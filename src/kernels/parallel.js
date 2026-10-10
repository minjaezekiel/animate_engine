/**
 * A worker pool over one shared wasm memory.
 *
 * ```js
 * import { loadParallelKernels, parallelAvailable } from './src/kernels/parallel.js';
 *
 * const P = await loadParallelKernels();        // null if unavailable
 * const buf = P.f32(w * h * 4);                 // allocate on the main thread
 * await P.blurRgba(buf, P.f32(w * h * 4), w, h, 16);
 * ```
 *
 * # What this buys, and why it is the cheap win
 *
 * `docs/15-PERFORMANCE.md` measured the limit: per-vertex kernels run
 * 4-18x faster in wasm and sit three orders of magnitude inside the frame
 * budget, while full-resolution per-pixel kernels do not fit a frame in
 * *either* backend -- a 1080p blur is 97 ms against 41.67 ms, and it is
 * **memory-bandwidth bound at 4.0 GB/s**, so SIMD cannot help it.
 *
 * More cores can, because each core brings its own share of bandwidth.
 * That makes a worker pool strictly better value than porting these
 * kernels to WGSL compute shaders: it reuses the kernels unchanged, it
 * keeps the determinism guarantee that GPU float math cannot offer, and it
 * is a few hundred lines rather than a new shading language.
 *
 * # Zero copies
 *
 * Every worker instantiates the *same module* against the *same*
 * `WebAssembly.Memory({shared: true})`. So a pointer means the same thing
 * everywhere and no pixel is ever copied between threads. The obvious
 * alternative -- a worker per band with its own memory, staging through a
 * `SharedArrayBuffer` -- costs two copies of the buffer per pass, which
 * for a blur would roughly double the very memory traffic that is already
 * the bottleneck.
 *
 * # Three invariants
 *
 * 1. **Only the main thread allocates.** One allocator, one caller, no
 *    question of lock contention or reentrancy. Workers receive pointers.
 *    Kernels are allocation-free by construction to make this hold; see
 *    `MAX_BLUR_RADIUS` in `warp.rs`.
 * 2. **Each worker gets its own stack.** Instances share a linear memory
 *    but each initialises `__stack_pointer` from module data, to the same
 *    address. Without relocation every worker's call frames overlap, and
 *    the corruption is silent and timing-dependent.
 * 3. **Passes are barriered.** Within one blur pass, rows (or columns) are
 *    independent. *Between* passes they are not: a vertical pass reads
 *    what the horizontal pass wrote, across rows. Every method here awaits
 *    all bands of pass k before dispatching k+1.
 *
 * # Availability
 *
 * Needs `SharedArrayBuffer`, which in a browser needs the document to be
 * **cross-origin isolated** -- `Cross-Origin-Opener-Policy: same-origin`
 * plus `Cross-Origin-Embedder-Policy`. See `scripts/serve.mjs`, which
 * sends them, and `docs/15-PERFORMANCE.md` for the CDN consequence.
 * `loadParallelKernels` returns `null` rather than throwing when
 * unavailable, so a caller falls back to the serial `Kernels` in one line.
 */
import { Kernels, modeId } from './index.js';

/** Bytes of stack per worker. Kernels are shallow and allocation-free. */
const STACK_BYTES = 256 * 1024;

/** Initial shared memory, in 64 KiB pages. 64 MiB covers a 1080p set of buffers. */
const INITIAL_PAGES = 1024;

/** Maximum shared memory, in pages. Must not exceed the module's `--max-memory`. */
const MAX_PAGES = 16384;

/**
 * Below this many pixels, dispatch overhead outweighs the parallelism and
 * the pool runs the kernel inline on the main thread instead.
 *
 * A round trip is on the order of 100 microseconds, and a full blur is six
 * barriered passes, so a small buffer can genuinely come out slower in
 * parallel. The threshold is deliberately generous.
 */
const MIN_PIXELS = 64 * 1024;

/**
 * Whether a worker pool can be created here.
 *
 * In Node, `SharedArrayBuffer` is always present. In a browser it exists
 * only in a cross-origin-isolated document, which is the whole reason
 * `scripts/serve.mjs` exists.
 */
export function parallelAvailable() {
    if (typeof SharedArrayBuffer === 'undefined') return false;
    if (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === false) return false;
    return true;
}

/**
 * Create a worker pool, or return `null` if one is not possible here.
 *
 * @param {object} [options]
 * @param {number} [options.workers]    defaults to one per core, minus one
 *                                      for the orchestrating thread
 * @param {number} [options.minPixels]  below this, run inline
 * @returns {Promise<ParallelKernels|null>}
 */
export async function loadParallelKernels({ workers, minPixels = MIN_PIXELS } = {}) {
    if (!parallelAvailable()) return null;

    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency)
        || (await cpuCount()) || 4;
    // One fewer than the core count: the thread issuing the work and
    // reading the results is doing real work too, and oversubscribing
    // measured slower than leaving it a core.
    const count = Math.max(1, workers ?? Math.max(1, cores - 1));

    try {
        const memory = new WebAssembly.Memory({
            initial: INITIAL_PAGES, maximum: MAX_PAGES, shared: true,
        });
        if (!(memory.buffer instanceof SharedArrayBuffer)) {
            throw new Error('memory is not shared');
        }

        const { wasmBytes } = await import('./wasm/module-mt.js');
        const bytes = wasmBytes();
        const module = await WebAssembly.compile(bytes);

        // The main thread's own instance. It owns the heap, and it serves
        // every non-parallel kernel, so `P.serial` is a complete `Kernels`
        // over the same memory -- a pointer from `P.f32()` is valid in a
        // worker without translation.
        const { instantiate } = await import('./wasm/loader.js');
        const serial = new Kernels(await instantiate(bytes, memory));

        const pool = new ParallelKernels(serial, memory, count, minPixels);
        await pool._spawn(module);
        return pool;
    } catch (err) {
        // Same policy as `loadKernels`: a slower engine beats a broken
        // one, and the reason is surfaced because "why is this not
        // parallel" is otherwise unanswerable from outside.
        console.warn('jirex kernels: no worker pool —', err.message);
        return null;
    }
}

/** Node's core count, without importing `os` in a browser. */
async function cpuCount() {
    try {
        const os = await import('node:os');
        return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
    } catch { return 0; }
}

/**
 * The pool.
 *
 * Composition rather than inheritance: the parallel methods are `async`
 * while `Kernels`' are synchronous, so making this a subclass would mean a
 * `Kernels` whose methods return promises, which would break any caller
 * that accepted one. `P.serial` is the real `Kernels`, over the same
 * memory, and is the right thing to use for the per-vertex kernels -- they
 * are already microseconds and gain nothing from a pool.
 */
export class ParallelKernels {
    constructor(serial, memory, workers, minPixels) {
        /** @type {Kernels} a full Kernels over the same shared memory */
        this.serial = serial;
        this.memory = memory;
        this.workerCount = workers;
        this.minPixels = minPixels;
        this.backend = 'wasm-mt';
        this.simd = serial.simd;
        this._workers = [];
        this._next = 1;
        this._pending = new Map();
    }

    async _spawn(module) {
        const url = new URL('./wasm/worker.js', import.meta.url);
        const isNode = typeof process !== 'undefined' && !!process.versions?.node
            && typeof Worker === 'undefined';
        const NodeWorker = isNode ? (await import('node:worker_threads')).Worker : null;

        for (let i = 0; i < this.workerCount; i++) {
            // Each worker's stack comes out of the shared heap, allocated
            // by the main thread like everything else. The stack grows
            // down, so the pointer starts at the top of the block.
            const stack = this.serial.u8(STACK_BYTES);
            const worker = NodeWorker ? new NodeWorker(url) : new Worker(url, { type: 'module' });

            const handle = (data) => {
                if (data.t === 'ready') return;
                const entry = this._pending.get(data.id);
                if (!entry) return;
                this._pending.delete(data.id);
                if (data.t === 'error') entry.reject(new Error(data.err));
                else entry.resolve();
            };
            if (NodeWorker) worker.on('message', handle);
            else worker.onmessage = (e) => handle(e.data);

            const ready = new Promise((resolve, reject) => {
                const onReady = (data) => {
                    const d = data?.data ?? data;
                    if (d?.t === 'ready') resolve();
                    else if (d?.t === 'error' && d.id === -1) reject(new Error(d.err));
                };
                if (NodeWorker) worker.once('message', onReady);
                else worker.addEventListener('message', (e) => onReady(e.data), { once: true });
            });

            worker.postMessage({
                t: 'init', module, memory: this.memory, stackTop: stack.ptr + STACK_BYTES,
            });
            await ready;
            this._workers.push(worker);
        }
    }

    /** Dispatch `fn(...args)` to worker `i` and resolve when it finishes. */
    _run(i, fn, args) {
        const id = this._next++;
        return new Promise((resolve, reject) => {
            this._pending.set(id, { resolve, reject });
            this._workers[i].postMessage({ t: 'run', id, fn, args });
        });
    }

    /**
     * Split `total` lines into one contiguous band per worker.
     *
     * Contiguous rather than interleaved, because every kernel here reads
     * its band linearly and interleaving would destroy that locality on a
     * workload that is already bandwidth-bound. The remainder is spread
     * over the first few bands rather than dumped on the last, so no
     * single worker holds up the barrier.
     */
    _bands(total) {
        const n = Math.min(this.workerCount, Math.max(1, total));
        const base = Math.floor(total / n);
        const extra = total % n;
        const out = [];
        let at = 0;
        for (let i = 0; i < n; i++) {
            const size = base + (i < extra ? 1 : 0);
            out.push([at, at + size]);
            at += size;
        }
        return out;
    }

    // --- buffers: main thread only, by invariant -------------------------

    f32(n) { return this.serial.f32(n); }
    u32(n) { return this.serial.u32(n); }
    u8(n) { return this.serial.u8(n); }
    from(source, Ctor) { return this.serial.from(source, Ctor); }
    adjacency(indices, count) { return this.serial.adjacency(indices, count); }

    // --- parallel per-pixel kernels --------------------------------------

    /**
     * Three box passes approximating a Gaussian, across the pool.
     *
     * Six barriered passes. Each horizontal pass splits by rows and each
     * vertical pass by columns, which is the axis that pass does not read
     * across -- so no band needs a halo, and the result is identical to
     * the serial kernel rather than approximately equal.
     */
    async blurRgba(buf, scratch, w, h, radius) {
        if (radius <= 0 || w === 0 || h === 0) return;
        if (w * h < this.minPixels || this.workerCount < 2) {
            this.serial.blurRgba(buf, scratch, w, h, radius);
            return;
        }
        const rows = this._bands(h);
        const cols = this._bands(w);
        for (let i = 0; i < 3; i++) {
            await Promise.all(rows.map(([a, b], k) => this._run(k, 'blur_pass',
                [buf.ptr, scratch.ptr, w, h, radius, 1, a, b])));
            await Promise.all(cols.map(([a, b], k) => this._run(k, 'blur_pass',
                [scratch.ptr, buf.ptr, w, h, radius, 0, a, b])));
        }
    }

    /** Rasterise textured triangles, split by destination rows. */
    async warpMesh(src, sw, sh, dst, dw, dh, verts, uvs, indices, tris, vcount) {
        if (dw * dh < this.minPixels || this.workerCount < 2) {
            this.serial.warpMesh(src, sw, sh, dst, dw, dh, verts, uvs, indices, tris, vcount);
            return;
        }
        await Promise.all(this._bands(dh).map(([a, b], k) => this._run(k, 'warp_mesh',
            [src.ptr, sw, sh, dst.ptr, dw, dh, verts.ptr, uvs.ptr, indices.ptr,
                tris, vcount, a, b])));
    }

    /** Composite a coverage mask, split by rows. */
    async compositeMask(dst, mask, w, h, r, g, b, opacity, erase = 0) {
        if (w * h < this.minPixels || this.workerCount < 2) {
            this.serial.compositeMask(dst, mask, w, h, r, g, b, opacity, erase);
            return;
        }
        await Promise.all(this._bands(h).map(([a, z], k) => this._run(k, 'composite_mask',
            [dst.ptr, mask.ptr, w, h, r, g, b, opacity, erase ? 1 : 0, a, z])));
    }

    /** Accumulate stamps into a coverage mask, split by rows. */
    async stampMask(mask, w, h, stamps, count, hardness, mode, texture = null) {
        if (w * h < this.minPixels || this.workerCount < 2) {
            this.serial.stampMask(mask, w, h, stamps, count, hardness, mode, 0, h, texture);
            return;
        }
        const t = texture;
        await Promise.all(this._bands(h).map(([a, b], k) => this._run(k, 'stamp_mask',
            [mask.ptr, w, h, stamps.ptr, count, hardness, mode,
                t ? t.buf.ptr : 0, t ? t.width : 0, t ? t.height : 0,
                t ? t.mode : 0, t ? t.scale : 1, a, b])));
    }

    /**
     * Composite one layer onto another, split by rows.
     *
     * Flattening a stack is one of these per layer, so at 1080p a
     * twelve-layer document is twelve full-frame passes -- exactly the
     * bandwidth-bound shape the pool exists for.
     */
    async blendLayers(dst, src, w, h, mode, opacity) {
        const id = modeId(mode);
        if (w * h < this.minPixels || this.workerCount < 2) {
            this.serial.blendLayers(dst, src, w, h, id, opacity);
            return;
        }
        await Promise.all(this._bands(h).map(([a, b], k) => this._run(k, 'blend_layers',
            [dst.ptr, src.ptr, w, h, id, opacity, a, b])));
    }

    /** Premultiplied f32 to straight u8, split by pixel range. */
    async maskToRgba8(src, dst, n) {
        if (n < this.minPixels || this.workerCount < 2) {
            this.serial.maskToRgba8(src, dst, n);
            return;
        }
        await Promise.all(this._bands(n).map(([a, b], k) => this._run(k, 'mask_to_rgba8',
            [src.ptr, dst.ptr, a, b])));
    }

    /** Terminate the workers. The shared memory and its buffers go with them. */
    async dispose() {
        await Promise.all(this._workers.map((w) => (w.terminate ? w.terminate() : null)));
        this._workers = [];
        this._pending.clear();
    }
}
