import { traceImage, maskBounds } from './image.js';
import { estimateRegions, characterFromImage } from './rig.js';

/**
 * A picture in, a riggable character out.
 *
 * One entry point for both callers, because there are exactly two and they
 * differ only in where the pixels came from: the browser reads an upload into
 * a canvas, the headless op decodes a PNG. Everything after that is the same
 * arithmetic, which is why it is here and not duplicated at each end.
 */
export function traceCharacter(rgba, width, height, {
    asset = 'character', name = 'traced', height2d = 180,
    matte = true, tolerance = 28, threshold = 24, simplifyTo = 1.5,
    view = 'front', regions = null, palette = null,
} = {}) {
    const traced = traceImage(rgba, width, height, { matte, tolerance, threshold, simplifyTo });
    const warnings = [];
    if (!traced.bounds) {
        return { ok: false, warnings: ['nothing survived the matte: every pixel was cleared. '
            + 'Pass `matte: false` for a cut-out PNG, or lower `tolerance`.'] };
    }
    // A matte that ate most of the frame has almost always leaked through the
    // figure -- which happens when the character shares an edge colour with
    // the background. Say so: the alternative is a character with a hole in
    // it and nothing to explain why.
    const area = traced.bounds.w * traced.bounds.h;
    if (matte && traced.bounds.count < area * 0.12) {
        warnings.push(`the matte kept only ${(traced.bounds.count / area * 100).toFixed(0)}% of `
            + 'the figure\'s own box, so it probably leaked through it. '
            + 'Lower `tolerance`, or cut the image out first and pass `matte: false`.');
    }
    if (traced.components.length > 1) {
        warnings.push(`${traced.components.length} separate shapes survived the matte; `
            + 'the largest was taken as the figure.');
    }

    const estimated = estimateRegions(traced.mask, width, height, { bounds: traced.bounds, rgba });
    const boxes = regions ? { ...estimated.boxes, ...regions } : estimated.boxes;
    warnings.push(...estimated.warnings);

    const built = characterFromImage({
        asset, boxes, landmarks: estimated.landmarks, height: height2d, view, palette,
    });

    return {
        ok: true, name, warnings,
        character: built.character,
        bounds: traced.bounds,
        landmarks: {
            neckY: estimated.landmarks.neckY, shoulderY: estimated.landmarks.shoulderY,
            waistY: estimated.landmarks.waistY, crotchY: estimated.landmarks.crotchY,
            footY: estimated.landmarks.footY, core: estimated.landmarks.core,
        },
        boxes, outline: traced.path, scale: built.scale, feet: built.feet,
        opaque: traced.bounds.count,
    };
}

export { traceImage, maskBounds, estimateRegions, characterFromImage };
