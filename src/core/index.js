/**
 * Core barrel: the renderer-agnostic half of the engine.
 *
 * Everything exported here is pure with respect to time and free of DOM and
 * Three.js, so it runs unchanged in Node, in a worker, and in the browser.
 * Import from here when you want the scene graph, the timeline or the film
 * compiler without pulling in a backend, an encoder or the voice system.
 */

// scene
export { Scene } from './scene/Scene.js';
export { createNode } from './scene/Node.js';
export { transform2D, transform3D, TRANSFORM2D_CHANNELS } from './scene/Transform.js';
export { applyVisemeShapes } from './scene/visemeShapes.js';

// math
export * as mat2d from './math/mat2d.js';
export * as vec2 from './math/vec2.js';

// animation
export { createTrack, setKey, trackValueAt, trackDuration } from './anim/Track.js';
export { createClip, clipLocalTime } from './anim/Clip.js';
export { createTimeline, addClip, addInstance, key, getTrack } from './anim/Timeline.js';
export {
    Evaluator, samplePose, applyPose,
    createPoseBaseline, resetPose, timelineChannels,
} from './anim/Evaluator.js';
export { cubicBezierEase, smoothstep, easeProgress, DEFAULT_BEZIER_HANDLES } from './anim/easing.js';
export { interpolateValue, lerpVec, slerpQuat, lerpColor } from './anim/interpolate.js';
export { FrameClock } from './time/FrameClock.js';

// rig
export {
    solveTwoBone, solveChain, forwardKinematics,
    chainFromParts, chainRootOffset, wrapAngle,
} from './rig/IK2D.js';

// art assets (provider-based, same seam as voices)
export { AssetRegistry, loadAssets } from './art/AssetRegistry.js';
export { UrlProvider } from './art/providers/UrlProvider.js';
export { FileProvider } from './art/providers/FileProvider.js';

// audio analysis + lipsync (pure; no Web Audio)
export { createCue, cueSampleWindow, mixDuration, cueGainAt } from './audio/cues.js';
export { envelope, voicedSpans, normalize } from './audio/envelope.js';
export {
    VISEMES, VISEME_FALLBACK, resolveViseme,
    phonemeToViseme, textToVisemeSequence,
} from './audio/visemes.js';
export {
    lipsyncLine, visemesFromPhonemes, visemesFromText, visemesFromEnvelope,
} from './audio/lipsync.js';

// voice (the registry and provider contract; providers themselves may touch
// the network or the microphone, so import those directly when needed)
export { VoiceRegistry, createVoice } from './voice/VoiceRegistry.js';
export { castVoices, synthesizeDialogue } from './voice/synthesize.js';

// film script
export { compileFilm, filmShots, shotAt, characterParts } from './script/compile.js';
export { validateFilm, validateAssets, hasFatal, hasError } from './script/validate.js';
export { analyseStaging, measureCharacter, groundAt } from './script/staging.js';
export { parseScreenplay, estimateSeconds, retimeToAudio } from './script/screenplay.js';
export {
    generateCharacterParts, generateMouth, generateActions, DEFAULT_PROPORTIONS,
} from './script/generate.js';
export { FILM_VERSION, DEFAULTS, KNOWN, DO_VERBS, TRANSITION_KINDS } from './script/schema.js';

// util
export { createIdFactory, hashString } from './util/id.js';
