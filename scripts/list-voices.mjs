/**
 * What can speak, and how to cast it.
 *
 *   npm run voices                 # engines and their cost, no network
 *   npm run voices -- --probe      # also ask each one what it has
 *   npm run voices -- --json       # the same rows as JSON, for an agent
 *
 * # Why this is a script and not a paragraph in the docs
 *
 * There are now four voice engines and they are not interchangeable: two run
 * in the browser and two need a server you start, two can clone a voice and
 * two cannot, and one of them is a 86 MB download the first time it speaks.
 * A film is cast by writing one string into its `voices` block, and getting
 * that string wrong is the quietest failure in this repo -- Phase 33 shipped
 * twelve films in the wrong voice because a studio was not running and the
 * ladder substituted silently.
 *
 * So "what can I cast against, and what will it cost me" has to be a question
 * you can ASK, in one command, rather than a thing you infer from source.
 *
 * `--probe` is off by default on purpose. Answering from the engine table
 * touches no network and no model, which is what makes this cheap enough for
 * an agent to call before every film instead of guessing.
 */
import { VOICE_ENGINES, VOICE_PROVIDERS, SPEC_PREFIX, createRegistry, listVoices }
    from '../src/core/voice/gateway.js';
import { VOICE_PRESETS } from '../src/core/voice/catalog.js';

const args = process.argv.slice(2);
// Env as well as argv, because the MCP server starts this as a bare script
// and has no argv to pass.
const probe = args.includes('--probe') || process.env.PROBE === '1';
const asJson = args.includes('--json') || process.env.JSON === '1';

const registry = createRegistry({
    decode: async () => null,
    backend: process.env.VOICE_BACKEND ?? null,
    voiceStudioUrl: process.env.VOICE_STUDIO ?? null,
    openVoiceUrl: process.env.OPENVOICE_URL ?? null,
    kokoroUrl: process.env.KOKORO_URL ?? null,
    report: asJson ? null : (m) => console.log(m),
});

const rows = await listVoices(registry, { probe });

if (asJson) {
    console.log(JSON.stringify({
        engines: VOICE_ENGINES,
        registered: [...registry.providers.keys()],
        roles: Object.fromEntries(Object.entries(VOICE_PRESETS)
            .map(([k, v]) => [k, v.spec])),
        voices: rows,
    }));
    process.exit(0);
}

console.log('\nEngines this build knows about, in fallback order:\n');
for (const name of VOICE_PROVIDERS) {
    const e = VOICE_ENGINES[name];
    const on = registry.providers.has(SPEC_PREFIX[name]);
    console.log(`  ${on ? '*' : ' '} ${name.padEnd(12)} ${e.label}`);
    console.log(`    ${'spec'.padEnd(10)} ${SPEC_PREFIX[name]}:<voice>`);
    console.log(`    ${'licence'.padEnd(10)} ${e.licence}`);
    console.log(`    ${'runs'.padEnd(10)} ${e.runs}`);
    console.log(`    ${'clones'.padEnd(10)} ${e.clones ? 'yes' : 'no'}`);
    console.log(`    ${'needs'.padEnd(10)} ${e.needs}`);
    console.log(`    ${'langs'.padEnd(10)} ${(e.langs ?? []).join(', ')}`);
    console.log(`    ${''.padEnd(10)} ${e.note}`);
    console.log('');
}
console.log('  * = registered in this process. VOICE_BACKEND=<name> promotes one.\n');

/**
 * Roles, which are what a film should actually name.
 *
 * A film casts by ROLE (`narrator-m-en`), not by model id, so the same
 * document renders on Piper offline and on a cloned voice when one is
 * configured. Printed here because the role table is the layer most people
 * skip, and skipping it is what welds a film to one engine.
 */
console.log('Roles a film can cast by name (src/core/voice/catalog.js):\n');
const byLang = new Map();
for (const [role, v] of Object.entries(VOICE_PRESETS)) {
    if (!byLang.has(v.lang)) byLang.set(v.lang, []);
    byLang.get(v.lang).push(`${role} -> ${v.spec}`);
}
for (const [lang, list] of byLang) {
    console.log(`  ${lang}`);
    for (const l of list) console.log(`    ${l}`);
}

if (probe) {
    console.log('\nVoices each live engine reports:\n');
    for (const r of rows) {
        if (r.unavailable) {
            console.log(`  ${r.spec.padEnd(34)} unavailable -- ${r.unavailable}`);
        } else if (r.listed) {
            console.log(`  ${r.spec.padEnd(34)} ${r.name}  ${r.lang}`
                + (r.clones ? '  (cloned)' : ''));
        }
    }
} else {
    console.log('\n(pass --probe to ask each engine what it actually has)');
}
