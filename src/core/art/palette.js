/**
 * Palette derivation.
 *
 * Cel shading needs three tones per material -- the flat colour, a hard-edged
 * shadow, and the line it is drawn with. Asking an author for three is asking
 * for three chances to pick a shadow that reads as a different material, so
 * an author names one and the other two are derived.
 *
 * Derived per channel in RGB, not in HSL. Reducing HSL lightness holds
 * saturation while chroma grows, so a pale skin tone shades toward yellow
 * rather than toward shadow -- measured: #e8b98f became #e0ae6a. A channel
 * multiplier preserves hue exactly, and keeping blue's multiplier the highest
 * is what makes the shadow read cool.
 *
 * The deltas are fixed rather than tunable on purpose: a film whose shadows
 * all sit the same distance from their base colour looks like one film. A
 * palette may still declare any derived key itself, which is the escape hatch
 * for the one material where the rule is wrong.
 */

/** Darker and a little cooler: the hard-edged second tone. */
const SHADE = [0.80, 0.78, 0.84];
/** Line work: near-black, but in the material's own hue rather than true black. */
const LINE = [0.26, 0.24, 0.28];

export function parseHex(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? ''));
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v)))
    .toString(16).padStart(2, '0')).join('')}`;

/** Scale a colour per channel. Returns the input unchanged if it is not a hex. */
export function scaleColor(hex, mul) {
    const rgb = parseHex(hex);
    return rgb ? toHex(rgb.map((v, i) => v * mul[i])) : hex;
}

export const shadeOf = (hex) => scaleColor(hex, SHADE);
export const lineOf = (hex) => scaleColor(hex, LINE);

/** Blend two colours, for a highlight or a held tone between two materials. */
export function mixColor(a, b, t = 0.5) {
    const ra = parseHex(a), rb = parseHex(b);
    if (!ra || !rb) return a;
    return toHex(ra.map((v, i) => v + (rb[i] - v) * t));
}

/**
 * Enough colour for a generated character to render with no palette declared
 * at all. Without it, `fill: 'skin'` reaches the canvas as the literal string
 * "skin", which is not a colour, so the part silently draws in whatever fill
 * the previous node happened to leave behind.
 */
export const DEFAULT_PALETTE = {
    skin: '#c98a5e',
    cloth: '#5a6f8c',
    trouser: '#3c4457',
    hair: '#241b17',
    eye: '#17120f',
    white: '#f4efe6',
    shoe: '#2b2521',
    coat: '#5a6f8c',
    teeth: '#f1e8dc',
    mouth: '#4a2421',
    // Scenery. A template paints with these names, so a set renders with no
    // palette declared and recolours entirely when one is.
    sky: '#8fb6dc',
    skyLow: '#cfdcea',
    far: '#a9bcd0',
    wall: '#cfc6b6',
    floor: '#9a7b58',
    wood: '#6f4f32',
    stone: '#9c968b',
    asphalt: '#53555c',
    tile: '#d7cfc2',
    metal: '#8a8e95',
    light: '#fff4d8',
    accent: '#8a5a48',
    foliage: '#4f7a44',
    bark: '#4a3526',
    clay: '#a65e3e',
};

/**
 * Fill in `<name>Shade` and `<name>Line` for every hex colour in a palette.
 * Already-declared keys win, so derivation never overwrites art direction.
 */
export function derivePalette(palette = {}) {
    const out = { ...DEFAULT_PALETTE, ...palette };
    for (const [name, value] of Object.entries({ ...out })) {
        if (name.endsWith('Shade') || name.endsWith('Line')) continue;
        if (typeof value !== 'string' || !parseHex(value)) continue;
        out[`${name}Shade`] ??= shadeOf(value);
        out[`${name}Line`] ??= lineOf(value);
    }
    return out;
}
