/**
 * The `jirex.film/1` schema, as data.
 *
 * Design constraints this encodes:
 *   - an author (human or LLM) must never do arithmetic: shots and scenes
 *     sequence automatically and `at` is shot-relative.
 *   - total duration is DERIVED, never declared, so a film cannot disagree
 *     with itself.
 *   - unknown fields are diagnostics, never errors. An LLM will emit
 *     plausible-but-unsupported keys, and a render that aborts at frame 1 on
 *     a typo is worse than one that renders and reports.
 */
export const FILM_VERSION = 'jirex.film/1';

export const DEFAULTS = {
    fps: 24,
    width: 1280,
    height: 720,
    shotDuration: 4,
    transitionDuration: 0.8,
    subtitleStyle: {
        font: '600 34px system-ui, sans-serif',
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 6,
        bottomMargin: 64,
    },
};

/** Known keys per level, used to report (not reject) anything unrecognized. */
export const KNOWN = {
    root: ['version', 'meta', 'voices', 'assets', 'palettes', 'characters', 'scenes'],
    meta: ['title', 'fps', 'width', 'height', 'author', 'description', 'duration', 'estimatedTiming'],
    character: ['palette', 'voice', 'parts', 'mouth', 'poses', 'actions', 'proportions', 'generate'],
    part: ['id', 'parent', 'pivot', 'shape', 'shapes', 'fill', 'stroke', 'strokeWidth',
           'z', 'at', 'alpha'],
    scene: ['id', 'background', 'transitionIn', 'transitionOut', 'cast', 'audio', 'shots',
            'scenery', 'palette', 'ground'],
    shot: ['id', 'duration', 'camera', 'actions', 'dialogue', 'subtitleStyle'],
    action: ['target', 'do', 'action', 'pose', 'to', 'at', 'for', 'ease', 'h', 'loop', 'speed', 'value', 'channel',
             'part', 'bones', 'bend'],
    dialogue: ['speaker', 'at', 'text', 'audio', 'voice', 'lipsync', 'subtitle', 'gain', 'duration'],
    camera: ['from', 'to', 'ease', 'h', 'at', 'for'],
    audioCue: ['asset', 'at', 'gain', 'fadeIn', 'fadeOut', 'offset', 'duration', 'bus'],
    asset: ['kind', 'src', 'file', 'provider', 'frames', 'grid', 'pivot', 'fit'],
    background: ['color', 'gradient', 'image', 'fit'],
};

export const ASSET_KINDS = ['image', 'audio'];

export const KNOWN_SCENERY = ['id', 'shape', 'at', 'fill', 'stroke', 'strokeWidth', 'z',
                             'alpha', 'parallax', 'gradient', 'screenSpace', 'sx', 'sy', 'rot'];

export const SHAPE_KINDS = ['path', 'ellipse', 'rect', 'image', 'text', 'group'];
export const TRANSITION_KINDS = ['fade', 'crossfade', 'none'];
export const DO_VERBS = ['play', 'pose', 'move', 'reach', 'set', 'show', 'hide'];
