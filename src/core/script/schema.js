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
    meta: ['title', 'fps', 'width', 'height', 'author', 'description', 'duration',
           'estimatedTiming', 'step'],
    character: ['palette', 'voice', 'parts', 'mouth', 'poses', 'actions', 'proportions',
                'generate', 'view', 'expression'],
    generate: ['skin', 'cloth', 'trouser', 'hair', 'hairColor', 'eye', 'white', 'shoe',
               'face', 'build', 'facing'],
    face: ['jaw', 'eyes', 'brow', 'nose', 'lips', 'ears'],
    cast: ['character', 'as', 'at', 'scale', 'z', 'alpha', 'palette', 'view', 'expression',
           'facing', 'echo'],
    template: ['template', 'time', 'props'],
    part: ['id', 'parent', 'pivot', 'shape', 'shapes', 'swap', 'fill', 'stroke',
           'strokeWidth', 'z', 'at', 'alpha',
           // draw-level: compositing, glow, trimmed strokes, repeaters
           'blend', 'glow', 'trim', 'repeat', 'gradient'],
    scene: ['id', 'background', 'transitionIn', 'transitionOut', 'cast', 'audio', 'shots',
            'scenery', 'palette', 'ground', 'template', 'drawings', 'photos'],
    // A still photograph animated by `core/motion/PhotoMotion.js`. `source`
    // and `depth` are asset ids; `start`/`duration` are scene-relative
    // seconds, and `draw` retimes it like any drawing.
    photo: ['id', 'source', 'image', 'depth', 'effects', 'duration', 'start',
            'at', 'z', 'alpha', 'width', 'height', 'grid', 'overscan',
            'depthBlur', 'tear'],
    shot: ['id', 'duration', 'camera', 'actions', 'dialogue', 'subtitleStyle', 'step',
           // what the shot is MEANT to be, so the checker can say whether it is
           'framing', 'on'],
    action: ['target', 'do', 'action', 'pose', 'to', 'at', 'for', 'ease', 'h', 'loop', 'speed', 'value', 'channel',
             // `draw` ramps from `from` to `to`; `from` was missing, so every
             // backwards reveal reported its own option as unrecognized.
             'from',
             'part', 'bones', 'bend',
             // the four principles that need a number rather than a keyframe
             'anticipate', 'overshoot', 'arc', 'weight'],
    dialogue: ['speaker', 'at', 'text', 'audio', 'voice', 'lipsync', 'subtitle', 'gain', 'duration'],
    camera: ['from', 'to', 'ease', 'h', 'at', 'for', 'shake'],
    audioCue: ['asset', 'at', 'gain', 'fadeIn', 'fadeOut', 'offset', 'duration', 'bus'],
    asset: ['kind', 'src', 'file', 'provider', 'frames', 'grid', 'pivot', 'fit'],
    background: ['color', 'gradient', 'image', 'fit'],
};

export const ASSET_KINDS = ['image', 'audio'];

export const KNOWN_SCENERY = ['id', 'shape', 'at', 'fill', 'stroke', 'strokeWidth', 'z',
                             'alpha', 'parallax', 'gradient', 'screenSpace', 'sx', 'sy', 'rot',
                             'blend', 'glow', 'trim', 'repeat'];

export const SHAPE_KINDS = ['path', 'ellipse', 'rect', 'image', 'text', 'group'];
export const TRANSITION_KINDS = ['fade', 'crossfade', 'none'];
export const DO_VERBS = ['play', 'pose', 'move', 'reach', 'set', 'show', 'hide', 'draw'];
