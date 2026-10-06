import { timelineTargets } from './legacyTracks.js';
import { applyPoseToObjects, captureBaseline, restoreBaseline } from './PoseApplier.js';

/**
 * The 3D editor's scene as a render backend.
 *
 * It wraps the existing SceneManager rather than mirroring it: the THREE
 * scene already IS the scene, so `sync` has nothing to reconcile. That is the
 * whole point of the core being renderer-agnostic -- a second backend is an
 * adapter, not a second engine.
 *
 * What this buys the 3D editor is the 2D path's render pipeline: frame-stepped
 * export with a correct duration, every FrameSink, and physics advanced in
 * fixed steps. The old captureFrames held raw RGBA *and* PNG bytes for every
 * frame (about 15GB for two minutes), never stepped physics, and was hardcoded
 * to 10 or 15 fps.
 */
export class Three3DBackend {
    constructor({ sceneManager, renderer = null } = {}) {
        this.sceneManager = sceneManager;
        this.renderer = renderer ?? sceneManager.renderer;
        this.capabilities = { kind: '3d', postFX: true, skinning: false };
    }

    mount(host, { width, height } = {}) {
        if (width && height) this.resize(width, height);
        return this;
    }

    unmount() { /* the editor owns the canvas; leave it mounted */ }

    resize(width, height) {
        this.width = width;
        this.height = height;
        // setSize(..., false) leaves the CSS size alone, so exporting at a
        // different resolution does not resize the editor's viewport.
        this.renderer.setSize(width, height, false);
        const camera = this.sceneManager.camera;
        if (camera && camera.isPerspectiveCamera) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
        return this;
    }

    sync() { return this; }

    renderFrame() {
        this.sceneManager.render();
        return this;
    }

    canvas() { return this.renderer.domElement; }
}

/**
 * A poser for OfflineRenderer that writes onto THREE objects.
 *
 * The default poser writes into a core Scene's plain nodes. 3D objects are
 * not plain nodes, so the loop takes this instead -- the loop itself is
 * unchanged, which is the property worth keeping.
 */
export function createThreePoser({ timeline, resolve, samplePose }) {
    const baseline = captureBaseline(timelineTargets(timeline), resolve);
    return {
        reset() { restoreBaseline(baseline, resolve); },
        apply(tSec) { applyPoseToObjects(samplePose(timeline, tSec), resolve); },
    };
}
