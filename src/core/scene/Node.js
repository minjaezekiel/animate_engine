import { transform2D } from './Transform.js';

/**
 * A scene node is data only: no behavior, no backend object, no DOM.
 *
 * Backends keep their own `coreId -> backendObject` registry. That separation
 * is what lets the same scene render through canvas2d and three3d, and lets
 * the whole graph be cloned into a worker or a history snapshot.
 *
 * kind: group | path | rect | ellipse | image | text | mesh | light | camera | bone
 */
export function createNode(spec = {}) {
    return {
        id: spec.id,
        name: spec.name ?? spec.id,
        kind: spec.kind ?? 'group',
        parentId: spec.parentId ?? null,
        childIds: spec.childIds ? [...spec.childIds] : [],
        transform: spec.transform ? transform2D(spec.transform) : transform2D(),
        props: spec.props ? { ...spec.props } : {},
        visible: spec.visible !== false,
        z: spec.z ?? 0,
        tags: spec.tags ? [...spec.tags] : [],
    };
}
