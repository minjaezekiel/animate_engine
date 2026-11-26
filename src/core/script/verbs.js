/**
 * The verb table: one row per verb, shared by both compilers.
 *
 * # The structural finding this exists to end
 *
 * There are two compilers, `compile.js` (2D) and `compile3d.js` (3D), and
 * they **share a vocabulary and not a table**. Phase 39 found five
 * capabilities that were not missing machinery at all, only a call nobody
 * had made. That is not a bug to fix once; it is a shape that keeps
 * producing bugs, because every verb added to one compiler is a silent
 * divergence from the other. See
 * [37-MISSING-TOOLS.md §1](../../../docs/pending/37-MISSING-TOOLS.md).
 *
 * The fix named there is deliberately **not** "copy the verbs across". Half
 * of them are legitimately one-path-only: a clip plane is not a thing a flat
 * drawing has, and an exposure sheet is not a thing a solid has. The fix is
 * that the list of verbs, and which path honours each one, becomes *data* --
 * so that
 *
 *   - adding a verb is one row plus one handler, and
 *   - a compiler meeting a verb it cannot honour **says what to use
 *     instead**, rather than ignoring it or reporting a bare "unknown verb"
 *     that is a lie: the verb exists, it is just not available here.
 *
 * `ops.js` already proves the pattern one layer down -- the MCP surface is
 * 28 tools generated from one op table -- and this is the same idea for the
 * film language itself.
 *
 * # Why `paths` is the whole mechanism
 *
 * `paths` is the per-path capability flag. It is checked in three places and
 * nowhere else: `validate.js` (so a film is checked without compiling),
 * and each compiler's `default:` branch. A row claiming a path whose
 * compiler has no handler is a **divergence**, reported as one by name --
 * which is why the test for this module compiles every verb in the table
 * on every path it claims, and fails on the divergence message rather than
 * on an assertion about any one verb.
 *
 * # What `instead` is for
 *
 * A phrase, not always a verb: the 2D answer to `express` is a cast entry
 * field chosen per shot, and the 2D answer to `smear` is `meta.shutter`.
 * Writing the honest answer down is the difference between a diagnostic
 * that ends the author's search and one that starts it.
 *
 * Pure data and one lookup: no THREE, no DOM, no fs.
 */

/**
 * Every verb the film language has.
 *
 *   paths    which compilers honour it -- the capability flag
 *   does     one line, as an animator would say it
 *   instead  path -> what to say on that path, when this verb is not there
 */
export const VERBS = {
    // --- the shared spine -------------------------------------------------
    move: { paths: ['2d', '3d'], does: 'go to an absolute position' },
    set: { paths: ['2d', '3d'], does: 'write one channel directly' },
    play: { paths: ['2d', '3d'], does: 'run a named cycle or an imported clip' },
    spin: { paths: ['2d', '3d'], does: 'rotate, by revolutions' },
    squash: { paths: ['2d', '3d'], does: 'squash and stretch at conserved volume' },
    grip: { paths: ['2d', '3d'], does: 'take a named hand pose' },
    show: { paths: ['2d', '3d'], does: 'reveal, mid-shot' },
    hide: { paths: ['2d', '3d'], does: 'conceal, mid-shot' },
    sound: { paths: ['2d', '3d'], does: 'fire an effect at a shot-relative moment' },

    // --- 2D ---------------------------------------------------------------
    pose: { paths: ['2d'], does: 'adopt a named pose from the character',
            instead: { '3d': 'play, for an authored cycle, or nudge, for one bone' } },
    reach: { paths: ['2d'], does: 'put a hand on a point and keep the arm plausible',
             instead: { '3d': 'a `targets` entry with an `ik` constraint, which is '
                 + 'the better form -- it holds across a whole span' } },
    shift: { paths: ['2d'], does: 'move BY an offset from where it is',
             instead: { '3d': 'nudge' } },
    count: { paths: ['2d'], does: 'a numeric readout that ramps and reformats' },
    draw: { paths: ['2d'], does: 'reveal a drawing stroke by stroke' },
    expose: { paths: ['2d'], does: 'an exposure sheet: hold drawings for n frames each' },
    boil: { paths: ['2d'], does: 'reseed a drawing per hold, for a living line' },
    smear: { paths: ['2d'], does: 'a smear frame through the fastest part of a move',
             instead: { '3d': '`meta.shutter`, which is real subframe motion blur' } },

    // --- 3D ---------------------------------------------------------------
    nudge: { paths: ['3d'], does: 'offset BY an amount from the rest pose',
             instead: { '2d': 'shift' } },
    turn: { paths: ['3d'], does: 'rotate to an absolute orientation, in degrees',
            instead: { '2d': 'spin, which turns in the plane of the page' } },
    grow: { paths: ['3d'], does: 'scale to an absolute size',
            instead: { '2d': 'set, on transform.sx and transform.sy' } },
    fly: { paths: ['3d'], does: 'arrive from an offset start pose -- an assembly shot' },
    cut: { paths: ['3d'], does: 'slide a declared clip plane through a solid' },
    express: { paths: ['3d'], does: 'a facial expression, as morph weights',
               instead: { '2d': "the cast entry's `expression`, which is chosen per "
                   + 'shot and cannot change mid-shot' } },
    burst: { paths: ['3d'], does: 'fire a declared particle emitter' },
};

/** The verbs one path honours, sorted. Used to build `DO_VERBS`. */
export function verbsFor(path) {
    return Object.keys(VERBS).filter((v) => VERBS[v].paths.includes(path)).sort();
}

/** Does this path honour this verb? The capability flag, read. */
export function supports(path, verb) {
    return VERBS[verb]?.paths.includes(path) === true;
}

const LABEL = { '2d': '2D', '3d': '3D' };
const OPPOSITE = { '2d': '3d', '3d': '2d' };

/**
 * What to tell an author who wrote a verb this path will not honour.
 *
 * Three answers, in order of how much they help:
 *
 *   1. it exists on the other path and there IS a way to say it here,
 *   2. it exists on the other path and there is not,
 *   3. it is not a verb at all -- so list the ones that are.
 *
 * Returns `null` when the verb is fine, so a caller can use it as the test.
 */
export function verbDiagnostic(verb, path) {
    if (supports(path, verb)) return null;
    const here = LABEL[path];
    const row = VERBS[verb];
    if (!row) {
        return `unknown verb '${verb}'. The ${here} verbs are: ${verbsFor(path).join(', ')}.`;
    }
    const alt = row.instead?.[path];
    const mine = LABEL[OPPOSITE[path]];     // the path it IS on
    if (alt) return `'${verb}' is a ${mine} verb. On the ${here} path, use ${alt}.`;
    return `'${verb}' is a ${mine} verb (${row.does}) and the ${here} path has no `
        + 'equivalent. If a film needs one, that is an engine gap, not a typo.';
}

/**
 * A verb the table promises on this path and the compiler does not handle.
 *
 * This is the failure the table exists to prevent, so it is reported as
 * itself rather than as "unknown verb" -- which would send an author
 * hunting for a typo in a word that is spelled correctly.
 */
export function divergence(verb, path) {
    return `'${verb}' is in the shared verb table for the ${LABEL[path]} path, but this`
        + ' compiler has no handler for it: a table/compiler divergence.'
        + ' See src/core/script/verbs.js.';
}
