/**
 * Compile the Rust kernels to WebAssembly and embed them as a JS module.
 *
 *   npm run build:wasm
 *
 * # Why the wasm is embedded rather than fetched
 *
 * The obvious design is to ship `jirex_kernels.wasm` as a file and
 * `fetch` it. In a browser that invites a specific set of failures, all of
 * which present as "the fast path silently never loads":
 *
 *   - the path is wrong under a bundler, a CDN, a sub-path deploy or a
 *     service worker's scope;
 *   - the server does not send `Content-Type: application/wasm`, so
 *     `instantiateStreaming` rejects;
 *   - the page is opened from `file://`, where fetch is blocked outright;
 *   - CORS blocks a cross-origin fetch from a CDN build.
 *
 * Base64 in a module has none of those. It costs about a third more bytes
 * -- 21 KB becomes 28 KB -- which against any real asset in this engine
 * is noise, and it means the kernels load wherever the JS loaded, with no
 * configuration at all. A caller who would rather fetch can still pass
 * bytes to `loadKernels({ wasmBytes })`.
 *
 * This also keeps the browser dependency count at zero: there is nothing
 * to install, nothing to resolve, and no network request that can fail.
 *
 * # Two modules, not one
 *
 * `module.js` is the single-threaded build: its own linear memory, **zero
 * imports**, runs anywhere.
 *
 * `module-mt.js` is the shared-memory build, for a worker pool. It differs
 * in three ways that all follow from one requirement -- several wasm
 * instances addressing the same bytes:
 *
 *   - `--import-memory --shared-memory`, so the host supplies one
 *     `WebAssembly.Memory({shared:true})` to every instance. This is the
 *     module's single import, and the only one tolerated anywhere here.
 *   - `+atomics`, required for shared memory. It also makes the linker
 *     emit data segments as *passive*, initialised once behind an atomic
 *     guard, which is what makes instantiating the module N times safe.
 *   - `--export=__stack_pointer`, so each worker's instance can be given
 *     its own stack region. Without it every instance starts with the same
 *     stack pointer and they corrupt each other's frames -- the failure is
 *     silent, intermittent and extremely hard to attribute.
 *
 * `+atomics` is still unstable, so this build needs a nightly toolchain and
 * `-Z build-std` to rebuild core and alloc with atomics enabled. That is a
 * heavier requirement than the rest of the repo imposes, so it is
 * **optional**: when nightly or `rust-src` is missing, the single-threaded
 * module is still produced and the committed `module-mt.js` is left alone.
 * The loader falls back to it whenever the threaded path is unavailable, so
 * a machine without nightly loses parallelism and nothing else.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'rust', 'jirex-kernels');
const out = join(root, 'src', 'kernels', 'wasm', 'module.js');

// Run with `cwd` set to the crate, not with `--manifest-path` from the
// repository root. Cargo discovers `.cargo/config.toml` by walking up from
// the *current working directory*, not from the manifest's directory, so
// building by manifest path from elsewhere silently drops the crate's
// `rustflags` -- which is where `-C target-feature=+simd128` lives. The
// build still succeeds; it just produces a scalar module, and the only
// visible symptom is `has_simd()` returning 0.
/**
 * Compile, verify and embed one variant.
 *
 * @param {object} variant
 * @param {string} variant.label      human name for the log
 * @param {string} variant.out        generated module path
 * @param {string[]} variant.args     extra cargo arguments
 * @param {string} [variant.rustflags] RUSTFLAGS for this build
 * @param {string} variant.targetDir  cargo target dir, so the two builds
 *                                    do not invalidate each other's cache
 * @param {string[]} variant.allowImports  permitted import names, as
 *                                    `module.name`
 */
async function emit(variant) {
    console.log(`\n--- ${variant.label} ---`);
    // Run with `cwd` set to the crate, not with `--manifest-path` from the
    // repository root. Cargo discovers `.cargo/config.toml` by walking up
    // from the *current working directory*, not from the manifest's
    // directory, so building by manifest path from elsewhere silently drops
    // the crate's `rustflags` -- which is where `+simd128` lives. The build
    // still succeeds; it just produces a scalar module, and the only
    // visible symptom is `has_simd()` returning 0.
    // `+toolchain` has to be the first argument to cargo, before the
    // subcommand, so variant args that start with `+` are hoisted.
    const plus = variant.args.filter((a) => a.startsWith('+'));
    const rest = variant.args.filter((a) => !a.startsWith('+'));
    execFileSync('cargo', [
        ...plus, 'build', '--release', '--target', 'wasm32-unknown-unknown',
        '--target-dir', variant.targetDir, ...rest,
    ], {
        stdio: 'inherit',
        cwd: crate,
        env: variant.rustflags ? { ...process.env, RUSTFLAGS: variant.rustflags } : process.env,
    });

    const wasmPath = join(crate, variant.targetDir, 'wasm32-unknown-unknown',
        'release', 'jirex_kernels.wasm');
    const wasm = readFileSync(wasmPath);

    // Refuse to embed a module that needs anything unexpected from the
    // host. The portability claim rests on the import list, so it is
    // checked rather than trusted: adding a crate that pulls in `wasi` or
    // `getrandom` would otherwise fail much later and much less clearly.
    const mod = await WebAssembly.compile(wasm);
    const imports = WebAssembly.Module.imports(mod).map((i) => `${i.module}.${i.name}`);
    const unexpected = imports.filter((i) => !variant.allowImports.includes(i));
    if (unexpected.length) {
        console.error('refusing to embed: unexpected imports', unexpected);
        console.error('kernels must be self-contained -- no WASI, no JS glue, no host functions.');
        process.exit(1);
    }

    const exported = new Set(WebAssembly.Module.exports(mod).map((e) => e.name));
    for (const required of variant.requireExports) {
        if (!exported.has(required)) {
            console.error(`refusing to embed: missing required export "${required}"`);
            process.exit(1);
        }
    }

    // The SIMD flag is read back from the module rather than assumed from
    // the config file -- assuming it was wrong once already, see the cwd
    // note above.
    const probe = variant.shared
        ? await WebAssembly.instantiate(mod, {
            env: { memory: new WebAssembly.Memory({ initial: 256, maximum: 16384, shared: true }) },
        })
        : await WebAssembly.instantiate(mod, {});
    const simd = !!probe.exports.has_simd?.();
    if (!simd) {
        console.error('refusing to embed: built without simd128.');
        console.error('check rust/jirex-kernels/.cargo/config.toml is being picked up.');
        process.exit(1);
    }
    const abi = probe.exports.abi_version();

    const b64 = wasm.toString('base64');
    mkdirSync(dirname(variant.out), { recursive: true });
    writeFileSync(variant.out, `/**
 * The compiled Rust kernels${variant.shared ? ' (shared-memory build)' : ''}, base64-encoded.
 *
 * GENERATED by scripts/build-wasm.mjs -- do not edit. Rebuild with
 * \`npm run build:wasm\` after changing anything under rust/jirex-kernels.
 *
 * Source:  ${wasm.length} bytes of wasm, ${b64.length} as base64.
 * ABI:     ${abi}
 * Imports: ${imports.length ? imports.join(', ') : 'none'} (verified at build time)
 * SIMD:    simd128
 */

const BYTES = '${b64}';

/**
 * Decode the embedded module to bytes.
 *
 * \`atob\` is global in browsers and in Node 16+, so one path covers both;
 * the \`Buffer\` branch is only a faster route when it happens to exist.
 */
export function wasmBytes() {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(BYTES, 'base64'));
    const raw = atob(BYTES);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/** Byte length of the decoded module, without decoding it. */
export const WASM_SIZE = ${wasm.length};
`);

    console.log(`embedded ${wasm.length} bytes (${b64.length} base64) -> ${variant.out.replace(root + '/', '')}`);
    console.log(`imports: ${imports.length ? imports.join(', ') : 'none'} · `
        + `exports: ${exported.size} · simd128: ${simd} · abi: ${abi}`);
}

await emit({
    label: 'single-threaded (universal, zero imports)',
    out,
    args: [],
    targetDir: 'target/st',
    shared: false,
    allowImports: [],
    requireExports: ['memory', 'alloc', 'dealloc', 'abi_version', 'has_simd'],
});

// --- the shared-memory build, which is optional ----------------------
const hasNightly = (() => {
    try {
        const list = execFileSync('rustup', ['component', 'list', '--toolchain', 'nightly'],
            { encoding: 'utf8' });
        return /^rust-src \(installed\)/m.test(list);
    } catch { return false; }
})();

if (!hasNightly) {
    console.log('\n--- shared-memory build: SKIPPED ---');
    console.log('needs a nightly toolchain with rust-src, because +atomics is unstable and');
    console.log('core/alloc must be rebuilt with it. Install with:');
    console.log('  rustup toolchain install nightly && rustup component add rust-src --toolchain nightly');
    console.log('The committed module-mt.js is left as it is; without it the loader simply');
    console.log('runs single-threaded.');
} else {
    await emit({
        label: 'shared-memory (worker pool, imports env.memory)',
        out: join(root, 'src', 'kernels', 'wasm', 'module-mt.js'),
        args: ['+nightly', '-Z', 'build-std=std,panic_abort'].slice(0),
        rustflags: [
            '-C target-feature=+atomics,+bulk-memory,+mutable-globals,+simd128',
            '-C link-arg=--shared-memory',
            '-C link-arg=--import-memory',
            `-C link-arg=--max-memory=${1024 * 1024 * 1024}`,
            // Each worker instance needs its own stack region, or they
            // overwrite each other's frames silently.
            '-C link-arg=--export=__stack_pointer',
            '-C link-arg=--no-check-features',
        ].join(' '),
        targetDir: 'target/mt',
        shared: true,
        allowImports: ['env.memory'],
        requireExports: ['alloc', 'dealloc', 'abi_version', 'has_simd', '__stack_pointer'],
    });
}
