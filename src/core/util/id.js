/**
 * Deterministic id generation. Core must never call Math.random(), because
 * two renders of the same film have to produce byte-identical node ids for
 * golden-frame comparison to mean anything.
 */
export function createIdFactory(prefix = 'n') {
    let n = 0;
    return () => `${prefix}${++n}`;
}

/** Stable 32-bit string hash. Used for caching synthesized speech by content. */
export function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
