/**
 * Viseme vocabulary and the mappings into it.
 *
 * Six shapes, chosen because they are the distinctions a viewer actually
 * notices at 24fps: a closure, a neutral, an open vowel, a rounded vowel, a
 * wide vowel, and teeth-on-lip. Finer sets buy nothing for cutout animation
 * and cost accuracy, because a misclassified viseme flickers and reads worse
 * than a coarser one that is right.
 */
export const VISEMES = ['closed', 'mid', 'open', 'round', 'wide', 'teeth'];

/**
 * Graceful degradation: a character that only declares {closed, mid, open}
 * still animates, because each viseme names the shapes it will settle for.
 */
export const VISEME_FALLBACK = {
    closed: ['closed', 'mid', 'open'],
    mid: ['mid', 'open', 'closed'],
    open: ['open', 'mid', 'closed'],
    round: ['round', 'open', 'mid', 'closed'],
    wide: ['wide', 'mid', 'open', 'closed'],
    teeth: ['teeth', 'mid', 'closed', 'open'],
};

/** Resolve a viseme against the shapes a character actually declares. */
export function resolveViseme(viseme, availableShapes) {
    for (const candidate of VISEME_FALLBACK[viseme] ?? [viseme]) {
        if (availableShapes[candidate]) return candidate;
    }
    return Object.keys(availableShapes)[0] ?? 'closed';
}

/** IPA / espeak-style phoneme -> viseme. Used when a TTS provider gives timings. */
export const PHONEME_VISEME = {
    m: 'closed', b: 'closed', p: 'closed',
    f: 'teeth', v: 'teeth',
    w: 'round', u: 'round', 'ʊ': 'round', 'o': 'round', 'ɔ': 'round', 'oʊ': 'round', 'uː': 'round',
    i: 'wide', 'iː': 'wide', 'ɪ': 'wide', s: 'wide', z: 'wide', 'ʃ': 'wide', 'ʒ': 'wide', 'tʃ': 'wide', 'dʒ': 'wide',
    a: 'open', 'ɑ': 'open', 'æ': 'open', 'ʌ': 'open', 'ɐ': 'open', 'aɪ': 'open', 'aʊ': 'open', 'ɒ': 'open',
    e: 'mid', 'ɛ': 'mid', 'eɪ': 'mid', 'ə': 'mid', 'ɜ': 'mid',
    t: 'mid', d: 'mid', n: 'mid', k: 'mid', g: 'mid', l: 'mid', r: 'mid', 'ɹ': 'mid',
    h: 'mid', j: 'mid', 'ŋ': 'mid', 'θ': 'mid', 'ð': 'mid',
    _: 'closed', '': 'closed',
};

export const phonemeToViseme = (p) => PHONEME_VISEME[String(p).toLowerCase()]
    ?? PHONEME_VISEME[String(p)]
    ?? 'mid';

/**
 * Grapheme -> viseme rules for English, longest match first.
 *
 * This drives the primary text path. It is crude phonetics, but it gets the
 * thing the eye catches right: the lip closures on m/b/p and the teeth on
 * f/v land on the correct syllables, which band-energy analysis of the audio
 * simply cannot recover.
 */
export const GRAPHEME_RULES = [
    ['sch', 'wide'], ['tch', 'wide'],
    ['sh', 'wide'], ['ch', 'wide'], ['th', 'mid'], ['ph', 'teeth'], ['wh', 'round'],
    ['ck', 'mid'], ['ng', 'mid'], ['qu', 'round'],
    ['oo', 'round'], ['ou', 'round'], ['ow', 'round'], ['oa', 'round'], ['oi', 'round'], ['oy', 'round'],
    ['ee', 'wide'], ['ea', 'wide'], ['ie', 'wide'], ['ei', 'wide'], ['ey', 'wide'],
    ['ai', 'open'], ['ay', 'open'], ['au', 'open'], ['aw', 'open'],
    ['a', 'open'], ['e', 'mid'], ['i', 'wide'], ['o', 'round'], ['u', 'round'], ['y', 'wide'],
    ['m', 'closed'], ['b', 'closed'], ['p', 'closed'],
    ['f', 'teeth'], ['v', 'teeth'],
    ['w', 'round'],
    ['s', 'wide'], ['z', 'wide'], ['j', 'wide'], ['x', 'wide'],
    ['t', 'mid'], ['d', 'mid'], ['n', 'mid'], ['k', 'mid'], ['g', 'mid'],
    ['l', 'mid'], ['r', 'mid'], ['h', 'mid'], ['c', 'mid'],
];

/**
 * Text -> ordered viseme sequence, one entry per perceived articulation.
 * Repeats are collapsed, since holding a shape reads better than re-keying it.
 */
export function textToVisemeSequence(text) {
    const s = String(text).toLowerCase().replace(/[^a-z\s]/g, ' ');
    const out = [];
    let i = 0;
    while (i < s.length) {
        if (s[i] === ' ') {
            if (out.length && out[out.length - 1] !== 'closed') out.push('closed');
            i++;
            continue;
        }
        let matched = false;
        for (const [graph, viseme] of GRAPHEME_RULES) {
            if (s.startsWith(graph, i)) {
                if (out[out.length - 1] !== viseme) out.push(viseme);
                i += graph.length;
                matched = true;
                break;
            }
        }
        if (!matched) i++;
    }
    while (out.length && out[out.length - 1] === 'closed') out.pop();
    return out;
}
