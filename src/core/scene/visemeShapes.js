import { resolveViseme } from '../audio/visemes.js';

/**
 * Resolve each mouth's current viseme name to a concrete declared shape.
 *
 * The lipsync track is DISCRETE: the Evaluator writes a viseme NAME, and the
 * backend needs geometry, so something has to turn one into the other once
 * per frame. Characters declaring fewer shapes than the full viseme set
 * degrade through the fallback chain rather than losing their mouth.
 *
 * Pure with respect to time and free of DOM, so the editor's preview and the
 * offline render share it instead of each keeping a copy that can drift.
 */
export function applyVisemeShapes(scene) {
    for (const node of scene.byId.values()) {
        const shapes = node.props.visemeShapes;
        if (!shapes) continue;
        const name = resolveViseme(node.props.viseme ?? 'closed', shapes);
        const shape = shapes[name];
        if (!shape) continue;
        // The cache key lives outside props so a per-frame pose reset cannot
        // leave it disagreeing with the geometry actually applied.
        if (node._shapeName === name) continue;
        node._shapeName = name;
        node.kind = shape.kind ?? 'path';
        for (const [k, v] of Object.entries(shape)) {
            if (k !== 'kind') node.props[k] = v;
        }
    }
}
