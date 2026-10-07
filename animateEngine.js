
        /**
         * Developed by: Ezekiel Minja 
         * M Enterprise
         * Enhanced Animation Engine - Main class that manages the entire animation system
         */
        (
            function (global,factory){
                if (typeof(module) === "object" && typeof(module).exports === "object"){
                    // Node / CommonJS
                    module.exports = factory()
                }else{
                    // Browser global
                    global.AnimationEngine = factory()
                }
            }(typeof(window) !== "undefined" ? window : this, function (){

                /**
                 * Where to find the ES-module core from a classic script.
                 *
                 * Captured at load, because document.currentScript is only
                 * meaningful during top-level execution. A dynamic import()
                 * works fine from a classic script; the specifier just has to
                 * be resolved against this file rather than the document, or
                 * it breaks for anyone loading the engine from a CDN.
                 */
                const SCRIPT_URL = (typeof document !== 'undefined' && document.currentScript)
                    ? document.currentScript.src : null;

                const coreUrl = (path) => (SCRIPT_URL ? new URL(path, SCRIPT_URL).href : path);

                let corePromise = null;

                /**
                 * The pure evaluator that drives 3D animation.
                 *
                 * Loaded lazily and once. If it cannot load, playback reports
                 * it rather than silently doing nothing -- which is precisely
                 * how the dead-mixer bug stayed hidden for so long.
                 */
                function loadAnimationCore() {
                    if (corePromise) return corePromise;
                    if (typeof globalThis.jirexCore === 'object' && globalThis.jirexCore) {
                        corePromise = Promise.resolve(globalThis.jirexCore);
                        return corePromise;
                    }
                    corePromise = Promise.all([
                        import(coreUrl('./src/core/anim/Evaluator.js')),
                        import(coreUrl('./src/backends/three3d/legacyTracks.js')),
                        import(coreUrl('./src/backends/three3d/PoseApplier.js')),
                        import(coreUrl('./src/backends/three3d/clipToTracks.js')),
                    ]).then(([evaluator, legacy, applier, clips]) => ({
                        samplePose: evaluator.samplePose,
                        timelineFromAnimation: legacy.timelineFromAnimation,
                        applyPoseToObjects: applier.applyPoseToObjects,
                        timelineFromClip: clips.timelineFromClip,
                    })).catch((error) => {
                        corePromise = null;
                        console.error('animateEngine: could not load the animation core', error);
                        throw error;
                    });
                    return corePromise;
                }

                class AnimationEngine {
                constructor(containerId) {
                this.container = document.getElementById(containerId);
                this.sceneManager = new SceneManager();
                this.animationManager = new AnimationManager(this.sceneManager);
                this.physicsManager = new PhysicsManager(this.sceneManager);
                this.uiManager = new UIManager(this, this.sceneManager, this.animationManager, this.physicsManager);
                this.editManager = new EditManager(this.sceneManager, this.uiManager);
                this.mediaManager = new MediaManager(this.sceneManager, this.animationManager);
                this.recordingManager = new RecordingManager(this.sceneManager, this.animationManager, this.mediaManager);
                // So an export can advance physics in fixed substeps; without
                // it, physics simply did not happen in any exported frame.
                this.recordingManager.physicsManager = this.physicsManager;
                this.rigManager = new RigManager(this.sceneManager, this.animationManager);
                this.cameraManager = new CameraManager(this.sceneManager);
                this.sceneManager.cameraManager = this.cameraManager;
                this.history = new HistoryManager(this);

                // Route scene/animation mutations into undo history + autosave.
                this.sceneManager.onChange = () => this.pushHistory();
                this.animationManager.onChange = () => this.pushHistory();
                // Register bones + morphs from imported rigged models.
                this.sceneManager.onModelImported = (model, gltf) => {
                    this.rigManager.extractRig(model);
                    if (this.refreshRigUI) this.refreshRigUI();
                    if (gltf && gltf.animations && gltf.animations.length) {
                        this.animationManager.adoptClips(gltf.animations, model)
                            .then(() => { if (this.uiManager.updateAnimationList) this.uiManager.updateAnimationList(); })
                            .catch((e) => console.error('animateEngine: clip import failed', e));
                    }
                };

                // Initialize the engine
                this.init();
            }

            init() {
                // Set up the scene
                this.sceneManager.init(this.container);

                // Register the default camera + build the post-processing composer.
                this.cameraManager.init();

                // Set up the UI
                this.uiManager.init();
                
                // Set up the edit manager
                this.editManager.init();
                
                // Set up the media manager
                this.mediaManager.init();
                
                // Set up the recording manager
                this.recordingManager.init();
                
                // Wire project save/load UI, undo/redo shortcuts and MCP bridge.
                this.setupProjectUI();
                this.setupRigUI();
                this.setupMaterialUI();
                this.setupCameraUI();
                this.setupShortcuts();
                this.connectMcpBridge();

                // Restore the last autosaved project, then seed the history baseline.
                this.restoreAutosave();
                this.history.flush();
// listeners removed for isolation

                // Start the render loop
                this.animate();

                // Hide loading overlay
                document.getElementById('loadingOverlay').style.display = 'none';
            }

            /** The 2D film studio, built once and only when a film op asks. */
            async filmStudio() {
                if (!this._filmStudio) {
                    const { FilmStudio } = await import(coreUrl('./src/studio.js'));
                    this._filmStudio = new FilmStudio({
                        onLog: (m) => { if (this.onFilmProgress) this.onFilmProgress({ log: m }); },
                    });
                }
                return this._filmStudio;
            }

            // ---- Project state: serialize / restore / persist ----

            serializeProject() {
                return {
                    scene: JSON.parse(this.sceneManager.exportScene()),
                    animations: this.animationManager.getAllAnimations()
                        .map(a => JSON.parse(this.animationManager.exportAnimation(a.name))),
                    environment: this.sceneManager.envURL || null,
                    postFX: this.cameraManager ? this.cameraManager.fx : null,
                    meta: { version: '1.0', savedAt: new Date().toISOString() }
                };
            }

            applyProject(project) {
                if (!project) return;
                this.sceneManager._suspendChange = true;
                this.animationManager._suspendChange = true;

                if (project.scene) this.sceneManager.importScene(JSON.stringify(project.scene));

                // Replace all animations with the saved set.
                this.animationManager.getAllAnimations().slice()
                    .forEach(a => this.animationManager.deleteAnimation(a.name));
                (project.animations || [])
                    .forEach(a => this.animationManager.importAnimation(JSON.stringify(a)));

                this.sceneManager._suspendChange = false;
                this.animationManager._suspendChange = false;
                if ('environment' in project) this.sceneManager.setEnvironment(project.environment);
                if (project.postFX && this.cameraManager) this.cameraManager.setPostFX(project.postFX);
                if (this.uiManager.updateHierarchy) this.uiManager.updateHierarchy();
            }

            saveProject() {
                this.history.flush();
                const blob = new Blob([JSON.stringify(this.serializeProject(), null, 2)],
                    { type: 'application/json' });
                downloadBlob(blob, 'project.json');
            }

            loadProject(json, record = true) {
                const project = typeof json === 'string' ? JSON.parse(json) : json;
                this.applyProject(project);
                if (record) this.history.push();
            }

            autosave(json) {
                const body = json ?? JSON.stringify(this.serializeProject());
                try {
                    localStorage.setItem('animateEngine.project', body);
                    this._autosaveWarned = false;
                } catch (e) {
                    // Geometry is serialized in full now, so a sculpt can
                    // outgrow the ~5MB localStorage quota. Skipping is the
                    // right call -- the previous snapshot stays usable and
                    // Save Project writes the whole thing to a file -- but it
                    // has to SAY so, because silently not saving is exactly
                    // how work disappears.
                    if (!this._autosaveWarned) {
                        this._autosaveWarned = true;
                        console.warn('animateEngine: autosave skipped — the project is '
                            + `${(body.length / 1048576).toFixed(1)}MB, more than this browser `
                            + 'will store. Use Save Project to keep it.');
                    }
                }
            }

            restoreAutosave() {
                try {
                    const saved = localStorage.getItem('animateEngine.project');
                    if (saved) this.applyProject(JSON.parse(saved));
                } catch (e) { /* corrupt autosave — ignore */ }
            }

            pushHistory() { this.history.push(); }
            undo() { this.history.undo(); }
            redo() { this.history.redo(); }

            setupProjectUI() {
                const on = (id, ev, fn) => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener(ev, fn);
                };
                on('saveProject', 'click', () => this.saveProject());
                on('loadProject', 'click', () => document.getElementById('loadProjectFile').click());
                on('loadProjectFile', 'change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => this.loadProject(ev.target.result);
                    reader.readAsText(file);
                    e.target.value = '';
                });
            }

            setupShortcuts() {
                document.addEventListener('keydown', (e) => {
                    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
                    e.preventDefault();
                    e.shiftKey ? this.redo() : this.undo();
                });
            }

            setupRigUI() {
                const toggle = document.getElementById('rigToggleSkeleton');
                if (toggle) toggle.addEventListener('click', () => this.rigManager.toggleSkeleton());
                this.refreshRigUI();

                // Interpolation selector — applies to the selected object's keyframes.
                const interp = document.getElementById('keyframeInterp');
                if (interp) interp.addEventListener('change', (e) => {
                    const obj = this.sceneManager.getSelectedObject();
                    if (obj) this.animationManager.setInterpolation(obj, e.target.value);
                });
            }

            setupMaterialUI() {
                const readAsDataURL = (input, cb) => input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => cb(ev.target.result);
                    reader.readAsDataURL(file);
                    e.target.value = '';
                });
                const texFile = document.getElementById('textureFile');
                const envFile = document.getElementById('envFile');
                const applyTex = document.getElementById('applyTexture');
                const applyEnv = document.getElementById('applyEnv');
                const clearEnv = document.getElementById('clearEnv');

                if (applyTex && texFile) {
                    applyTex.addEventListener('click', () => {
                        if (!this.sceneManager.getSelectedObject())
                            return this.recordingManager.showNotification('Select an object first', 'info');
                        texFile.click();
                    });
                    readAsDataURL(texFile, (url) => {
                        const obj = this.sceneManager.getSelectedObject();
                        const slot = document.getElementById('textureSlot').value;
                        if (obj) this.sceneManager.setTexture(obj.uuid, slot, url).catch(() => {});
                    });
                }
                if (applyEnv && envFile) {
                    applyEnv.addEventListener('click', () => envFile.click());
                    readAsDataURL(envFile, (url) => this.sceneManager.setEnvironment(url));
                }
                if (clearEnv) clearEnv.addEventListener('click', () => this.sceneManager.setEnvironment(null));
            }

            setupCameraUI() {
                const select = document.getElementById('cameraSelect');
                const refresh = () => {
                    if (!select) return;
                    select.innerHTML = '';
                    this.cameraManager.listCameras().forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.uuid;
                        opt.textContent = c.name + (c.active ? ' (active)' : '');
                        select.appendChild(opt);
                    });
                };
                refresh();

                const add = document.getElementById('addCamera');
                if (add) add.addEventListener('click', () => {
                    const cam = this.cameraManager.createCamera();
                    cam.position.copy(this.sceneManager.camera.position);
                    refresh();
                });
                const activate = document.getElementById('activateCamera');
                if (activate && select) activate.addEventListener('click', () => {
                    if (select.value) { this.cameraManager.activateCamera(select.value); refresh(); }
                });
                const bloom = document.getElementById('bloomToggle');
                if (bloom) bloom.addEventListener('change', (e) =>
                    this.cameraManager.setPostFX({ bloom: e.target.checked }));
                const strength = document.getElementById('bloomStrength');
                if (strength) strength.addEventListener('input', (e) =>
                    this.cameraManager.setPostFX({ bloomStrength: parseFloat(e.target.value) }));
            }

            // Rebuild morph-target sliders for imported meshes (called after import).
            refreshRigUI() {
                const host = document.getElementById('morphSliders');
                if (!host) return;
                host.innerHTML = '';
                const meshes = this.rigManager.listMorphMeshes();
                const hint = document.getElementById('rigHint');
                if (hint) hint.style.display = (meshes.length || this.rigManager.bones.size) ? 'none' : '';
                meshes.forEach(mesh => mesh.morphs.forEach(name => {
                    const row = document.createElement('div');
                    row.className = 'tool-slider-container';
                    row.innerHTML =
                        `<div class="tool-slider-label">${name}</div>` +
                        `<input type="range" class="tool-slider" min="0" max="1" step="0.01" value="0">`;
                    row.querySelector('input').addEventListener('input', (e) =>
                        this.rigManager.setMorph(mesh.uuid, name, parseFloat(e.target.value)));
                    host.appendChild(row);
                }));
            }

            // ---- Programmatic API (single choke point for scripts / AI / MCP bridge) ----

            getSceneJSON() {
                return this.serializeProject();
            }

            // Run a batch of {op, args} commands; returns one {ok, value|error} per command.
            async runCommands(commands) {
                const results = [];
                for (const cmd of (commands || [])) {
                    try {
                        results.push({ ok: true, value: await this.runCommand(cmd) });
                    } catch (err) {
                        results.push({ ok: false, error: err.message });
                    }
                }
                return results;
            }

            async runCommand(cmd) {
                const a = cmd.args || {};
                const sm = this.sceneManager, am = this.animationManager;
                const applyTransform = (obj) => {
                    if (a.position) obj.position.set(...a.position);
                    if (a.rotation) obj.rotation.set(...a.rotation);
                    if (a.scale) obj.scale.set(...a.scale);
                    if (a.color != null && obj.material) obj.material.color.set(a.color);
                };

                switch (cmd.op) {
                    case 'createObject': {
                        const makers = {
                            cube: 'createCube', sphere: 'createSphere', cylinder: 'createCylinder',
                            cone: 'createCone', torus: 'createTorus', tetrahedron: 'createTetrahedron'
                        };
                        const fn = makers[a.kind || 'cube'];
                        if (!fn) throw new Error('Unknown kind: ' + a.kind);
                        // `dims` and `material` reach the primitive now, so an
                        // agent can ask for a 3x1x2 box in one call instead of
                        // getting a unit cube and scaling it.
                        const obj = sm[fn](a.name, {}, a.dims || {},
                            a.color != null ? { ...a.material, color: a.color } : (a.material || {}));
                        applyTransform(obj);
                        return { uuid: obj.uuid, name: obj.name,
                                 dims: { ...obj.geometry.parameters } };
                    }
                    case 'createLight': {
                        const light = sm.createLight(a.type || 'point', a.name);
                        if (a.position) light.position.set(...a.position);
                        if (a.intensity != null) light.intensity = a.intensity;
                        if (a.color != null) light.color.set(a.color);
                        return { uuid: light.uuid };
                    }
                    case 'setMaterial': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        const { uuid, ...props } = a;
                        sm.setMaterialProperties(obj, props);
                        return { uuid: a.uuid };
                    }
                    case 'resize': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        if (!sm.resizePrimitive(obj, a.dims || {})) {
                            throw new Error('Not a resizable primitive: ' + a.uuid);
                        }
                        return { uuid: a.uuid, dims: { ...obj.geometry.parameters } };
                    }
                    case 'transform': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        applyTransform(obj);
                        sm.markChanged();
                        return { uuid: a.uuid };
                    }
                    case 'subdivide': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        sm.subdivide(obj);
                        return { uuid: a.uuid, vertices: obj.geometry.attributes.position.count };
                    }
                    case 'createAnimation':
                        am.createAnimation(a.name, a.duration || 5, a.loop || 'once');
                        am.selectAnimation(a.name);
                        return { name: a.name };
                    case 'selectAnimation':
                        am.selectAnimation(a.name);
                        return { name: a.name };
                    case 'addKeyframe': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        const props = {};
                        if (a.position) props.position = a.position;
                        if (a.rotation) props.rotation = a.rotation;
                        if (a.scale) props.scale = a.scale;
                        if (a.morphs) props.morphs = a.morphs;
                        if (a.interp) props.interp = a.interp;
                        am.addKeyframe(obj, a.time || 0, props);
                        return { uuid: a.uuid, time: a.time || 0 };
                    }
                    case 'toggleSkeleton':
                        return { visible: this.rigManager.toggleSkeleton() };
                    case 'listBones':
                        return { bones: this.rigManager.listBones() };
                    case 'listMorphs':
                        return { meshes: this.rigManager.listMorphMeshes() };
                    case 'ikReach':
                        return this.rigManager.ikReach(a.bones, a.target, a.iterations || 10);
                    case 'setMorph':
                        return this.rigManager.setMorph(a.uuid, a.name, a.value);
                    case 'setInterpolation': {
                        const obj = sm.getObjectByUUID(a.uuid);
                        if (!obj) throw new Error('No object: ' + a.uuid);
                        am.setInterpolation(obj, a.interp || 'linear', a.handles);
                        return { uuid: a.uuid, interp: a.interp || 'linear' };
                    }
                    case 'setTexture':
                        return await sm.setTexture(a.uuid, a.slot, a.url);
                    case 'setEnvironment':
                        sm.setEnvironment(a.url, a.background !== false);
                        return { url: a.url || null };
                    case 'createCamera': {
                        const cam = this.cameraManager.createCamera(a.name, a);
                        return { uuid: cam.uuid, name: cam.name };
                    }
                    case 'listCameras':
                        return { cameras: this.cameraManager.listCameras() };
                    case 'activateCamera':
                        return this.cameraManager.activateCamera(a.uuid);
                    case 'setCameraProps':
                        return this.cameraManager.setCameraProps(a.uuid, a);
                    case 'setPostFX':
                        return this.cameraManager.setPostFX(a);
                    case 'play': am.play(); return {};
                    case 'pause': am.pause(); return {};
                    case 'stop': am.stop(); return {};
                    case 'setTime': am.setCurrentTime(a.time || 0); return {};
                    case 'getScene': return this.getSceneJSON();
                    case 'loadScene':
                        this.loadProject(a.project || {});
                        return {};
                    case 'clear':
                        this.applyProject({ scene: { objects: [], lights: [], groups: [] }, animations: [] });
                        this.pushHistory();
                        return {};
                    case 'exportVideo': {
                        const blob = await this.recordingManager.recordSelectedAnimation();
                        return { dataUrl: await blobToDataUrl(blob), size: blob.size };
                    }
                    case 'exportGif': {
                        const blob = await this.recordingManager.exportAsGIF(
                            { fps: a.fps || 10, maxWidth: a.maxWidth || 480 });
                        if (!blob) throw new Error('No animation selected');
                        return { dataUrl: await blobToDataUrl(blob), size: blob.size };
                    }
                    case 'exportSequence': {
                        const blob = await this.recordingManager.exportAsImageSequence(
                            { fps: a.fps || 15, maxWidth: a.maxWidth || 1920 });
                        if (!blob) throw new Error('No animation selected');
                        return { dataUrl: await blobToDataUrl(blob), size: blob.size };
                    }
                    // --- 2D film pipeline ---------------------------------
                    // The command surface reached only the 3D editor, so an
                    // agent could drive modelling but had no way to produce a
                    // film -- the thing the 2D half exists for.
                    case 'loadFilm': {
                        const studio = await this.filmStudio();
                        const film = a.film ?? (a.url ? await (await fetch(a.url)).json() : null);
                        if (!film) throw new Error('loadFilm needs `film` or `url`');
                        this._film = film;
                        const { compileFilm } = await import(coreUrl('./src/core/script/compile.js'));
                        const compiled = compileFilm(film, {});
                        let staging = [];
                        if (compiled.scene) {
                            const [{ analyseStaging }, { trackValueAt }] = await Promise.all([
                                import(coreUrl('./src/core/script/staging.js')),
                                import(coreUrl('./src/core/anim/Track.js')),
                            ]);
                            staging = analyseStaging(compiled, film, { trackValueAt });
                        }
                        return {
                            title: film.meta?.title ?? null,
                            duration: compiled.meta?.duration ?? 0,
                            frames: compiled.meta?.frames ?? 0,
                            scenes: (film.scenes ?? []).length,
                            dialogue: compiled.lipsyncJobs?.length ?? 0,
                            diagnostics: [...compiled.diagnostics, ...staging]
                                .filter((d) => d.severity !== 'info')
                                .map((d) => `${d.severity}: ${d.message}`),
                        };
                    }
                    case 'checkFilm': {
                        // Validation without rendering. There was no way to
                        // ask "is this film staged correctly" short of
                        // producing a video, which is why staging bugs were
                        // only ever found by looking at frames.
                        const film = a.film ?? (a.url ? await (await fetch(a.url)).json() : this._film);
                        if (!film) throw new Error('checkFilm needs `film`, `url`, or a loaded film');
                        const [{ compileFilm }, { analyseStaging }, { trackValueAt }] = await Promise.all([
                            import(coreUrl('./src/core/script/compile.js')),
                            import(coreUrl('./src/core/script/staging.js')),
                            import(coreUrl('./src/core/anim/Track.js')),
                        ]);
                        const compiled = compileFilm(film, {});
                        const staging = compiled.scene
                            ? analyseStaging(compiled, film, { trackValueAt }) : [];
                        const all = [...compiled.diagnostics, ...staging]
                            .filter((d) => d.severity !== 'info');
                        return {
                            duration: compiled.meta?.duration ?? 0,
                            frames: compiled.meta?.frames ?? 0,
                            ok: !all.some((d) => d.severity === 'error' || d.severity === 'fatal'),
                            // `path` is folded in because the agent-facing
                            // shape below drops it.
                            problems: all.map((d) => `${d.severity}: ${d.path ? d.path + ' — ' : ''}${d.message}`),
                        };
                    }
                    case 'renderFilm': {
                        const film = a.film ?? this._film;
                        if (!film) throw new Error('No film loaded; call loadFilm first');
                        const studio = await this.filmStudio();
                        // The canvas has to be in the document: MediaRecorder
                        // captures a stream from it, and a detached canvas
                        // produces an empty one.
                        let canvas = document.getElementById('filmCanvas');
                        if (!canvas) {
                            canvas = document.createElement('canvas');
                            canvas.id = 'filmCanvas';
                            canvas.style.cssText = 'position:fixed;left:-10000px;top:0';
                            document.body.appendChild(canvas);
                        }
                        const out = await studio.produce(film, {
                            canvas,
                            width: a.width, height: a.height, fps: a.fps,
                            onProgress: (p) => { if (this.onFilmProgress) this.onFilmProgress(p); },
                        });
                        // The blob stays here. A finished film is megabytes,
                        // and a data URL that size does not survive the trip
                        // out of the page -- it comes back truncated, with no
                        // error, and writes a file of a few bytes. Callers
                        // pull it with readFilmChunk instead.
                        this._lastFilm = out.blob;
                        return {
                            size: out.blob.size,
                            type: out.blob.type,
                            encoder: out.sink,
                            duration: out.meta.duration,
                            frames: Math.round(out.meta.duration * out.meta.fps),
                            width: out.meta.width, height: out.meta.height,
                            audio: !!out.prepared.audio,
                            diagnostics: out.prepared.diagnostics
                                .filter((d) => d.severity !== 'info').length,
                        };
                    }
                    case 'readFilmChunk': {
                        if (!this._lastFilm) throw new Error('No rendered film to read');
                        const offset = a.offset || 0;
                        const length = Math.min(a.length || 4194304, this._lastFilm.size - offset);
                        if (length <= 0) return { offset, length: 0, base64: '', done: true };
                        const slice = this._lastFilm.slice(offset, offset + length);
                        const bytes = new Uint8Array(await slice.arrayBuffer());
                        // Build the base64 in blocks: String.fromCharCode with
                        // a megabyte of arguments blows the call stack.
                        let binary = '';
                        for (let i = 0; i < bytes.length; i += 8192) {
                            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                        }
                        return {
                            offset, length, base64: btoa(binary),
                            done: offset + length >= this._lastFilm.size,
                            total: this._lastFilm.size,
                        };
                    }
                    default:
                        throw new Error('Unknown op: ' + cmd.op);
                }
            }

            // Opt-in WebSocket bridge (enable with ?mcp=ws://host:port) so an MCP
            // server can drive this live browser session and receive results.
            connectMcpBridge() {
                if (typeof location === 'undefined' || typeof WebSocket === 'undefined') return;
                const url = new URLSearchParams(location.search).get('mcp');
                if (!url) return;
                try {
                    const ws = new WebSocket(url);
                    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'engine' }));
                    ws.onmessage = async (event) => {
                        let msg;
                        try { msg = JSON.parse(event.data); } catch (e) { return; }
                        if (msg.type !== 'commands') return;
                        const results = await this.runCommands(msg.commands);
                        ws.send(JSON.stringify({ type: 'result', id: msg.id, results }));
                    };
                    ws.onerror = () => console.warn('MCP bridge failed to connect:', url);
                    this.mcpSocket = ws;
                } catch (e) {
                    console.warn('MCP bridge error:', e);
                }
            }

            animate() {
                requestAnimationFrame(() => this.animate());

                // One clock read per frame, shared: physics needs real elapsed
                // time to spend in fixed steps, not a count of frames.
                const now = (typeof performance !== 'undefined' ? performance : Date).now();
                const deltaSec = this._lastFrameMs ? (now - this._lastFrameMs) / 1000 : 0;
                this._lastFrameMs = now;

                // Update the scene
                this.sceneManager.update();
                
                // Update physics
                this.physicsManager.update(deltaSec);
                
                // Update animations
                this.animationManager.update();
                
                // Update edit tools
                this.editManager.update();
                
                // Update media
                this.mediaManager.update();
                
                // Update recording
                this.recordingManager.update();
                
                // Update the UI
                this.uiManager.update();
                
                // Render the scene
                this.sceneManager.render();
            }
        }

        /**
         * Enhanced Scene Manager - Handles all scene-related operations
         */
        /**
         * Temporarily replace an Object3D's children, returning the undo.
         *
         * toJSON walks `children` directly, so swapping the array is enough to
         * keep furniture out of a save -- and unlike re-parenting it cannot
         * leave the live scene wrong if something throws in between.
         */
        function swapChildren(object, children) {
            const previous = object.children;
            object.children = children;
            return () => { object.children = previous; };
        }

        /**
         * Make a mesh's geometry safe to edit vertex by vertex.
         *
         * BufferGeometry.toJSON serializes a PARAMETRIC geometry (BoxGeometry
         * and friends) as its parameters and discards the attribute arrays
         * entirely -- so sculpting a primitive and saving gives back a
         * pristine primitive, silently. Once the vertices stop being described
         * by the parameters, the geometry has to stop claiming they are.
         */
        function makeGeometryEditable(mesh) {
            const geometry = mesh.geometry;
            if (!geometry || !geometry.parameters) return geometry;
            const plain = new THREE.BufferGeometry().copy(geometry);   // copy() drops `parameters`
            plain.name = geometry.name;
            geometry.dispose();
            mesh.geometry = plain;
            return plain;
        }

        /**
         * Default intensity for point and spot lights.
         *
         * Three r155 made punctual lights physical: intensity is candela and
         * decay is quadratic by default, so the old intensity of 1 renders a
         * point light barely above the background. 4*PI is the conversion the
         * migration notes give for preserving the pre-r155 appearance --
         * measured here as a cube at luma 43 against a background of 20, where
         * intensity 1 gave 25.
         */
        const PUNCTUAL_INTENSITY = 4 * Math.PI;

        const DEFAULT_MATERIAL = { color: 0x4fc3f7, metalness: 0.2, roughness: 0.5 };

        /**
         * The primitives, as data: the geometry class, its constructor
         * parameters in order, and the defaults. `params` names them so a
         * caller can pass {width: 3} without knowing the argument order, and
         * so `geometry.parameters` round-trips through a resize.
         */
        const PRIMITIVES = {
            cube: { geometry: 'BoxGeometry',
                    params: ['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments'],
                    defaults: { width: 1, height: 1, depth: 1,
                                widthSegments: 1, heightSegments: 1, depthSegments: 1 } },
            sphere: { geometry: 'SphereGeometry',
                      params: ['radius', 'widthSegments', 'heightSegments'],
                      defaults: { radius: 0.5, widthSegments: 32, heightSegments: 32 } },
            cylinder: { geometry: 'CylinderGeometry',
                        params: ['radiusTop', 'radiusBottom', 'height', 'radialSegments'],
                        defaults: { radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 32 } },
            cone: { geometry: 'ConeGeometry',
                    params: ['radius', 'height', 'radialSegments'],
                    defaults: { radius: 0.5, height: 1, radialSegments: 32 } },
            torus: { geometry: 'TorusGeometry',
                     params: ['radius', 'tube', 'radialSegments', 'tubularSegments'],
                     defaults: { radius: 0.5, tube: 0.2, radialSegments: 16, tubularSegments: 100 } },
            tetrahedron: { geometry: 'TetrahedronGeometry',
                           params: ['radius', 'detail'],
                           defaults: { radius: 0.7, detail: 0 } },
        };

        /** Material properties the editor and the command API can set. */
        const MATERIAL_PROPS = new Set([
            'color', 'emissive', 'emissiveIntensity', 'metalness', 'roughness',
            'opacity', 'transparent', 'wireframe', 'flatShading', 'side',
            'depthWrite', 'envMapIntensity',
        ]);

        const HANDLE_SIZE = 12;
        const HANDLE_REACH = 50;

        /**
         * [className, offsetX, offsetY, dragAxis] relative to the gizmo
         * origin, which sits on the object. Data, because three near-identical
         * builders differing only in these numbers is how the placement bug
         * survived in all three.
         */
        const TRANSFORM_HANDLES = (() => {
            const half = -HANDLE_SIZE / 2;
            const near = HANDLE_REACH / 2;
            const axisRow = (prefix) => [
                ['transform-handle x', HANDLE_REACH, half, `${prefix}X`],
                ['transform-handle y', half, -HANDLE_REACH, `${prefix}Y`],
                ['transform-handle z', half, HANDLE_REACH, `${prefix}Z`],
            ];
            return {
                move: [
                    ['transform-handle x', HANDLE_REACH, half, 'x'],
                    ['transform-handle y', half, -HANDLE_REACH, 'y'],
                    ['transform-handle z', half, HANDLE_REACH, 'z'],
                    ['transform-plane x', near, -near, 'xy'],
                    ['transform-plane z', near, near, 'xz'],
                    ['transform-plane y', -near, -near, 'yz'],
                    ['transform-handle xyz', half, half, 'xyz'],
                ],
                rotate: axisRow('rotate'),
                scale: [...axisRow('scale'),
                        ['transform-handle xyz', half, half, 'scaleUniform']],
            };
        })();

        const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

        /**
         * Attributes a geometry's own `parameters` do not describe.
         *
         * BufferGeometry.toJSON short-circuits on `parameters` and writes only
         * those, discarding every attribute. Skin weights, skin indices and
         * morph targets attached to a primitive are therefore lost on save
         * unless the geometry stops claiming to be parametric for the
         * duration of the write.
         */
        function keepExtraAttributes(geometry) {
            if (!geometry.parameters) return [];
            const extra = geometry.attributes.skinIndex || geometry.attributes.skinWeight
                || (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length);
            if (!extra) return [];
            const parameters = geometry.parameters;
            delete geometry.parameters;
            const type = geometry.type;
            geometry.type = 'BufferGeometry';   // or ObjectLoader rebuilds the primitive
            return [() => { geometry.parameters = parameters; geometry.type = type; }];
        }

        /** Detach a material's texture maps for the duration of a save. */
        function detachTextures(material) {
            const undos = [];
            for (const m of Array.isArray(material) ? material : [material]) {
                for (const slot of TEXTURE_SLOTS) {
                    if (!m[slot]) continue;
                    const texture = m[slot];
                    m[slot] = null;
                    undos.push(() => { m[slot] = texture; });
                }
            }
            return undos;
        }

        class SceneManager {
            constructor() {
                this.scene = null;
                this.camera = null;
                this.renderer = null;
                this.controls = null;
                this.selectedObject = null;
                this.objects = new Map(); // Map of object UUID to object
                this.lights = new Map(); // Map of light UUID to light
                this.groups = new Map(); // Map of group UUID to group
                this.objectProperties = new Map(); // Map of object UUID to custom properties
                this.raycaster = new THREE.Raycaster();
                this.mouse = new THREE.Vector2();
                this.onChange = null;        // set by AnimationEngine for undo/autosave
                this._suspendChange = false; // true while importing a project
                this.onModelImported = null; // set by AnimationEngine (rig extraction)
                this.envURL = null;          // current environment/HDRI source
                // Source AnimationClips per imported model root, kept because
                // retargeting works on clips and the engine converts them to
                // keyframes as soon as they are adopted.
                this.importedClips = new Map();
            }

            // Notify listeners that the scene mutated (drives undo history / autosave).
            markChanged() {
                if (!this._suspendChange && this.onChange) this.onChange();
            }

            init(container) {
                // Create the scene
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x222222);
                
                // Create the camera
                const aspect = container.clientWidth / container.clientHeight;
                this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
                this.camera.position.set(5, 5, 5);
                this.camera.lookAt(0, 0, 0);
                
                // Create the renderer
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
                this.renderer.setSize(container.clientWidth, container.clientHeight);
                // Cap pixel ratio at 2 — beyond that costs GPU with little visible gain.
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                container.appendChild(this.renderer.domElement);
                
                // Add orbit controls
                this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
                this.controls.enableDamping = true;
                this.controls.dampingFactor = 0.05;
                
                // Add default lights
                this.addDefaultLights();
                
                // Add grid helper
                const gridHelper = new THREE.GridHelper(10, 10);
                this.scene.add(gridHelper);
                
                // Add axes helper
                const axesHelper = new THREE.AxesHelper(5);
                this.scene.add(axesHelper);
                
                // Handle window resize
                window.addEventListener('resize', () => this.onWindowResize());
                
                // Handle mouse events
                this.setupMouseEvents(container);
            }

            setupMouseEvents(container) {
                container.addEventListener('mousedown', (e) => this.onMouseDown(e));
                container.addEventListener('mousemove', (e) => this.onMouseMove(e));
                container.addEventListener('mouseup', (e) => this.onMouseUp(e));
                
                // Touch events
                container.addEventListener('touchstart', (e) => this.onTouchStart(e));
                container.addEventListener('touchmove', (e) => this.onTouchMove(e));
                container.addEventListener('touchend', (e) => this.onTouchEnd(e));
            }

            onMouseDown(event) {
                // Update mouse position
                const rect = this.renderer.domElement.getBoundingClientRect();
                this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                
                // Raycast to find objects
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(Array.from(this.objects.values()));
                
                if (intersects.length > 0) {
                    const object = intersects[0].object;
                    
                    // If we're clicking on a light, select it
                    if (object.isLight || (object.parent && object.parent.isLight)) {
                        const light = object.isLight ? object : object.parent;
                        this.selectObject(light);
                        return;
                    }
                    
                    // If we're clicking on a regular object, select it
                    if (object.isMesh) {
                        this.selectObject(object);
                        return;
                    }
                    
                    // If we're clicking on a group, select it
                    if (object.type === 'Group') {
                        this.selectObject(object);
                        return;
                    }
                } else {
                    // If we're not clicking on anything, deselect
                    this.selectObject(null);
                }
            }

            onMouseMove(event) {
                // Update mouse position
                const rect = this.renderer.domElement.getBoundingClientRect();
                this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            }

            onMouseUp(event) {
                // Handle mouse up events
            }

            onTouchStart(event) {
                if (event.touches.length === 1) {
                    const touch = event.touches[0];
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    this.onMouseDown(mouseEvent);
                }
            }

            onTouchMove(event) {
                if (event.touches.length === 1) {
                    const touch = event.touches[0];
                    const mouseEvent = new MouseEvent('mousemove', {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    this.onMouseMove(mouseEvent);
                }
            }

            onTouchEnd(event) {
                const mouseEvent = new MouseEvent('mouseup', {});
                this.onMouseUp(mouseEvent);
            }

            addDefaultLights() {
                // Raised with the r155 lighting change, which dropped the
                // legacy intensity scaling. Measured on the default cube
                // (albedo luma 166): 0.5/0.8 lit its brightest face to 93,
                // 1.0/1.8 to about 125, 1.4/2.2 to 150 and nearly flat. The
                // middle one reads as lit without blowing out.
                const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
                this.scene.add(ambientLight);
                this.lights.set(ambientLight.uuid, ambientLight);
                
                // Directional light
                const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
                directionalLight.position.set(5, 10, 7);
                directionalLight.castShadow = true;
                directionalLight.shadow.mapSize.width = 1024;
                directionalLight.shadow.mapSize.height = 1024;
                directionalLight.shadow.camera.near = 0.5;
                directionalLight.shadow.camera.far = 500;
                directionalLight.shadow.camera.left = -20;
                directionalLight.shadow.camera.right = 20;
                directionalLight.shadow.camera.top = 20;
                directionalLight.shadow.camera.bottom = -20;
                this.scene.add(directionalLight);
                this.lights.set(directionalLight.uuid, directionalLight);
            }

            onWindowResize() {
                const container = this.renderer.domElement.parentElement;
                this.camera.aspect = container.clientWidth / container.clientHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(container.clientWidth, container.clientHeight);
                if (this.cameraManager) this.cameraManager.resize(container.clientWidth, container.clientHeight);
            }

            update() {
                this.controls.update();
            }

            // Delegate to the CameraManager (active camera + post-processing) when present.
            render() {
                if (this.cameraManager) this.cameraManager.render();
                else this.renderer.render(this.scene, this.camera);
            }

            addObject(object, name, properties = {}) {
                object.name = name || `Object_${this.objects.size + 1}`;
                this.scene.add(object);
                this.objects.set(object.uuid, object);
                
                // Store custom properties
                this.objectProperties.set(object.uuid, {
                    visible: true,
                    locked: false,
                    physicsEnabled: false,
                    mass: 1,
                    friction: 0.5,
                    restitution: 0.3,
                    isStatic: false,
                    ...properties
                });

                this.markChanged();
                return object;
            }

            removeObject(object) {
                if (object.parent) {
                    object.parent.remove(object);
                }
                this.objects.delete(object.uuid);
                this.objectProperties.delete(object.uuid);
                
                // If it's a light, remove from lights map as well
                if (this.lights.has(object.uuid)) {
                    this.lights.delete(object.uuid);
                }
                
                // If it's a group, remove from groups map
                if (this.groups.has(object.uuid)) {
                    this.groups.delete(object.uuid);
                }
                
                // If this was the selected object, deselect it
                if (this.selectedObject === object) {
                    this.selectedObject = null;
                }

                this.markChanged();
            }

            selectObject(object) {
                this.selectedObject = object;
            }

            getSelectedObject() {
                return this.selectedObject;
            }

            getObjectByUUID(uuid) {
                return this.objects.get(uuid);
            }

            getAllObjects() {
                return Array.from(this.objects.values());
            }

            getObjectProperties(uuid) {
                return this.objectProperties.get(uuid) || {};
            }

            setObjectProperties(uuid, properties) {
                if (this.objectProperties.has(uuid)) {
                    this.objectProperties.set(uuid, {
                        ...this.objectProperties.get(uuid),
                        ...properties
                    });
                }
            }

            // Subdivide a mesh: split every triangle into four (denser geometry
            // for smoother sculpting / higher detail). Reuses subdivideGeometry().
            subdivide(object) {
                if (!object || !object.isMesh) return false;
                let geo = object.geometry;
                if (geo.index) geo = geo.toNonIndexed();
                const positions = Array.from(geo.attributes.position.array);
                const newGeo = new THREE.BufferGeometry();
                newGeo.setAttribute('position',
                    new THREE.Float32BufferAttribute(subdivideGeometry(positions), 3));
                newGeo.computeVertexNormals();
                object.geometry.dispose();
                object.geometry = newGeo;
                this.markChanged();
                return true;
            }

            // Load an image texture into a PBR material slot of an object.
            setTexture(uuid, slot, url) {
                const obj = this.getObjectByUUID(uuid);
                if (!obj || !obj.material) throw new Error('No material: ' + uuid);
                const valid = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
                if (!valid.includes(slot)) throw new Error('Bad texture slot: ' + slot);
                return new Promise((resolve, reject) => {
                    new THREE.TextureLoader().load(url, (tex) => {
                        // r152 replaced texture.encoding with colorSpace.
                        if (slot === 'map' || slot === 'emissiveMap') tex.colorSpace = THREE.SRGBColorSpace;
                        obj.material[slot] = tex;
                        if (slot === 'emissiveMap') obj.material.emissive = new THREE.Color(0xffffff);
                        obj.material.needsUpdate = true;
                        obj.userData.textures = obj.userData.textures || {};
                        obj.userData.textures[slot] = url;
                        this.markChanged();
                        resolve({ uuid, slot });
                    }, undefined, () => reject(new Error('Texture load failed')));
                });
            }

            // Set an equirectangular environment (HDR via RGBELoader, else image) for
            // image-based lighting + reflections, prefiltered through PMREMGenerator.
            setEnvironment(url, asBackground = true) {
                if (!url) {
                    this.scene.environment = null;
                    this.scene.background = null;
                    this.envURL = null;
                    this.markChanged();
                    return;
                }
                const pmrem = new THREE.PMREMGenerator(this.renderer);
                const onTexture = (texture) => {
                    const envMap = pmrem.fromEquirectangular(texture).texture;
                    this.scene.environment = envMap;
                    if (asBackground) this.scene.background = envMap;
                    texture.dispose();
                    pmrem.dispose();
                    this.envURL = url;
                    this.markChanged();
                };
                if (/\.hdr($|\?)/i.test(url) && THREE.RGBELoader) {
                    new THREE.RGBELoader().load(url, onTexture);
                } else {
                    new THREE.TextureLoader().load(url, (t) => {
                        t.mapping = THREE.EquirectangularReflectionMapping;
                        onTexture(t);
                    });
                }
            }

            // Restore an object's original uuid and re-key it in every map so that
            // animation keyframes (keyed by uuid) still resolve after import.
            reassignUUID(object, newUuid) {
                const old = object.uuid;
                if (!newUuid || newUuid === old) return;
                [this.objects, this.objectProperties, this.lights, this.groups].forEach(map => {
                    if (map.has(old)) {
                        map.set(newUuid, map.get(old));
                        map.delete(old);
                    }
                });
                object.uuid = newUuid;
            }

            /**
             * Make a primitive.
             *
             * `dims` are the geometry's own parameters, by name, so a caller
             * can ask for a 3x1x2 box instead of getting the hardcoded unit
             * cube and having to scale it -- which is not the same thing,
             * because scaling distorts a subsequent sculpt and the physics
             * shape. Six near-identical builders differing only in these
             * numbers is why there was no way to pass a size at all, including
             * from the MCP `create_object` tool.
             */
            createPrimitive(kind, name, properties = {}, dims = {}, material = {}) {
                const spec = PRIMITIVES[kind];
                if (!spec) throw new Error(`Unknown primitive: ${kind}`);
                const args = spec.params.map((param) => dims[param] ?? spec.defaults[param]);
                const mesh = new THREE.Mesh(
                    new THREE[spec.geometry](...args),
                    new THREE.MeshStandardMaterial({ ...DEFAULT_MATERIAL, ...material }));
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                return this.addObject(mesh, name, properties);
            }

            createCube(name, properties, dims, material) {
                return this.createPrimitive('cube', name, properties, dims, material);
            }
            createSphere(name, properties, dims, material) {
                return this.createPrimitive('sphere', name, properties, dims, material);
            }
            createCylinder(name, properties, dims, material) {
                return this.createPrimitive('cylinder', name, properties, dims, material);
            }
            createCone(name, properties, dims, material) {
                return this.createPrimitive('cone', name, properties, dims, material);
            }
            createTorus(name, properties, dims, material) {
                return this.createPrimitive('torus', name, properties, dims, material);
            }
            createTetrahedron(name, properties, dims, material) {
                return this.createPrimitive('tetrahedron', name, properties, dims, material);
            }

            /**
             * Rebuild a primitive's geometry with new dimensions, in place.
             *
             * The alternative is scaling, which is not the same thing: a
             * scaled mesh sculpts and collides wrong. Only works while the
             * geometry is still parametric -- once sculpted it is not, and
             * saying so beats silently discarding the sculpt.
             */
            resizePrimitive(object, dims) {
                if (!object || !object.isMesh || !object.geometry.parameters) return false;
                const kind = Object.keys(PRIMITIVES)
                    .find((k) => PRIMITIVES[k].geometry === object.geometry.type);
                if (!kind) return false;
                const spec = PRIMITIVES[kind];
                const current = object.geometry.parameters;
                const args = spec.params.map((p) => dims[p] ?? current[p] ?? spec.defaults[p]);
                object.geometry.dispose();
                object.geometry = new THREE[spec.geometry](...args);
                this.markChanged();
                return true;
            }

            /**
             * Set material properties by name.
             *
             * Colour used to be the only one reachable, so every object in a
             * scene had the same finish no matter what it was meant to be.
             */
            setMaterialProperties(object, props = {}) {
                const material = object && object.material;
                if (!material) return false;
                for (const [key, value] of Object.entries(props)) {
                    if (!MATERIAL_PROPS.has(key)) continue;
                    if (key === 'color' || key === 'emissive') {
                        if (typeof value === 'number') material[key].setHex(value);
                        else material[key].set(value);
                    } else {
                        material[key] = value;
                    }
                }
                // Opacity does nothing unless the material is transparent, and
                // forgetting that is the usual reason "opacity doesn't work".
                if (props.opacity != null && props.transparent == null) {
                    material.transparent = props.opacity < 1;
                }
                material.needsUpdate = true;
                this.markChanged();
                return true;
            }

            createLight(type, name, properties = {}) {
                let light;
                
                switch (type) {
                    case 'point':
                        light = new THREE.PointLight(0xffffff, PUNCTUAL_INTENSITY, 100);
                        light.position.set(0, 3, 0);
                        light.castShadow = true;
                        break;
                    case 'spot':
                        light = new THREE.SpotLight(0xffffff, PUNCTUAL_INTENSITY);
                        light.position.set(0, 5, 0);
                        light.angle = Math.PI / 6;
                        light.penumbra = 0.1;
                        light.castShadow = true;
                        break;
                    case 'directional':
                        light = new THREE.DirectionalLight(0xffffff, 1);
                        light.position.set(5, 10, 7);
                        light.castShadow = true;
                        break;
                    case 'ambient':
                        light = new THREE.AmbientLight(0xffffff, 0.5);
                        break;
                    default:
                        light = new THREE.PointLight(0xffffff, PUNCTUAL_INTENSITY, 100);
                        light.position.set(0, 3, 0);
                        light.castShadow = true;
                }
                
                this._addLightHelper(light);

                this.scene.add(light);
                this.lights.set(light.uuid, light);
                // Lights go in `objects` too. They were only ever in `lights`,
                // so they were absent from the hierarchy panel and could not
                // be clicked in the viewport.
                this.objects.set(light.uuid, light);
                light.name = name || `Light_${this.lights.size}`;
                
                // Store properties
                this.objectProperties.set(light.uuid, {
                    visible: true,
                    locked: false,
                    ...properties
                });

                this.markChanged();
                return light;
            }

            createGroup(name, properties = {}) {
                const group = new THREE.Group();
                group.name = name || `Group_${this.objects.size + 1}`;
                this.scene.add(group);
                this.objects.set(group.uuid, group);
                this.groups.set(group.uuid, group);
                
                // Store properties
                this.objectProperties.set(group.uuid, {
                    visible: true,
                    locked: false,
                    ...properties
                });

                this.markChanged();
                return group;
            }

            addToGroup(object, group) {
                if (object.parent) {
                    object.parent.remove(object);
                }
                group.add(object);
            }

            removeFromGroup(object) {
                if (object.parent && object.parent.type === 'Group') {
                    object.parent.remove(object);
                    this.scene.add(object);
                }
            }

            toggleObjectVisibility(object) {
                const uuid = object.uuid;
                if (this.objectProperties.has(uuid)) {
                    const properties = this.objectProperties.get(uuid);
                    properties.visible = !properties.visible;
                    object.visible = properties.visible;
                    this.objectProperties.set(uuid, properties);
                    return properties.visible;
                }
                return true;
            }

            toggleObjectLock(object) {
                const uuid = object.uuid;
                if (this.objectProperties.has(uuid)) {
                    const properties = this.objectProperties.get(uuid);
                    properties.locked = !properties.locked;
                    this.objectProperties.set(uuid, properties);
                    return properties.locked;
                }
                return false;
            }

            /**
             * Serialize the scene with Three's OWN serializer.
             *
             * The hand-rolled version wrote a geometry TYPE NAME and rebuilt
             * from a switch whose default was createCube, so a sculpt or an
             * imported model came back as a cube; it wrote groups as
             * `children` but read `parent`, so hierarchy was lost; and it
             * never serialized lights at all. Object3D.toJSON already handles
             * geometry parameters, modified vertex buffers, materials,
             * hierarchy, lights and every light subclass -- and ObjectLoader
             * reads it back preserving uuids, so keyframes keyed by uuid
             * survive a round trip without the reassignUUID dance.
             */
            exportScene() {
                const restore = [];
                // Serialize only what the user made. The grid, the axes and
                // the light helpers are furniture, and a helper parented to a
                // light would come back as a stray Object3D on load.
                restore.push(swapChildren(this.scene,
                    this.scene.children.filter((c) => this.objects.has(c.uuid) || this.lights.has(c.uuid))));
                for (const light of this.lights.values()) {
                    if (light.children.length) restore.push(swapChildren(light, []));
                }
                // Texture images are embedded by toJSON as data URLs, which is
                // megabytes per map and throws outright on a cross-origin
                // image. The source URLs are already in userData.textures, so
                // detach the maps and re-apply them on load.
                this.objects.forEach((object) => {
                    if (object.material) restore.push(...detachTextures(object.material));
                    // Same trap as a sculpt, one level up: a geometry that
                    // still claims to be parametric serializes as its
                    // parameters, so skin weights and morph targets added to a
                    // primitive are silently dropped on save.
                    if (object.geometry) restore.push(...keepExtraAttributes(object.geometry));
                });

                let three;
                try {
                    // toJSON serializes object.matrix, which Three only
                    // refreshes during a render. Autosave fires on mutation,
                    // before the next frame, so without this a save could
                    // record the transform an object had one frame ago.
                    this.scene.updateMatrixWorld(true);
                    three = this.scene.toJSON();
                } finally {
                    for (const undo of restore) undo();
                }

                const properties = {};
                this.objectProperties.forEach((value, uuid) => { properties[uuid] = value; });

                return JSON.stringify({
                    format: 'animateEngine.scene/2',
                    three,
                    properties,
                    lights: [...this.lights.keys()],
                    groups: [...this.groups.keys()],
                    metadata: { version: '2.0', exportDate: new Date().toISOString() },
                }, null, 2);
            }

            importScene(sceneData) {
                try {
                    const data = JSON.parse(sceneData);
                    this.objects.forEach((object) => this.removeObject(object));
                    this.lights.forEach((light) => this.removeObject(light));
                    this.objects.clear();
                    this.lights.clear();
                    this.groups.clear();
                    this.objectProperties.clear();

                    if (!data.three) return this._importSceneV1(data);

                    const parsed = new THREE.ObjectLoader().parse(data.three);
                    const lightIds = new Set(data.lights || []);
                    const groupIds = new Set(data.groups || []);

                    // parsed.children shrinks as we re-parent, so copy first.
                    for (const child of [...parsed.children]) {
                        this.scene.add(child);
                        this._registerRestored(child, lightIds, groupIds, data.properties || {});
                    }
                    return true;
                } catch (error) {
                    console.error('Error importing scene:', error);
                    return false;
                }
            }

            /** Re-register a restored subtree into the manager's maps. */
            _registerRestored(object, lightIds, groupIds, properties) {
                const props = properties[object.uuid];
                if (props) this.objectProperties.set(object.uuid, props);

                if (object.isLight || lightIds.has(object.uuid)) {
                    this.lights.set(object.uuid, object);
                    // Lights belong in `objects` too: the hierarchy panel and
                    // click-selection both read `objects`, which is why lights
                    // were invisible to both.
                    this.objects.set(object.uuid, object);
                    this._addLightHelper(object);
                    return;                       // helpers are not content
                }

                this.objects.set(object.uuid, object);
                if (object.isGroup || groupIds.has(object.uuid)) this.groups.set(object.uuid, object);
                if (object.userData && object.userData.textures) {
                    Object.entries(object.userData.textures).forEach(([slot, url]) => {
                        this.setTexture(object.uuid, slot, url).catch(() => {});
                    });
                }
                for (const child of object.children) {
                    this._registerRestored(child, lightIds, groupIds, properties);
                }
            }

            /** The helper a light of this type gets, if any. */
            _addLightHelper(light) {
                let helper = null;
                if (light.isPointLight) helper = new THREE.PointLightHelper(light, 0.5);
                else if (light.isSpotLight) helper = new THREE.SpotLightHelper(light);
                else if (light.isDirectionalLight) helper = new THREE.DirectionalLightHelper(light, 1);
                if (helper) light.add(helper);
                return helper;
            }

            /**
             * Load a project written by the pre-2.0 serializer.
             *
             * Still lossy, because the data is: those files never contained
             * geometry parameters or vertices. It restores what was actually
             * recorded rather than refusing to open an old project.
             */
            _importSceneV1(data) {
                const make = {
                    BoxGeometry: 'createCube', SphereGeometry: 'createSphere',
                    CylinderGeometry: 'createCylinder', ConeGeometry: 'createCone',
                    TorusGeometry: 'createTorus', TetrahedronGeometry: 'createTetrahedron',
                };
                (data.groups || []).forEach((g) => {
                    const group = this.createGroup(g.name, g.properties);
                    group.position.set(...g.position);
                    group.rotation.set(...g.rotation);
                    group.scale.set(...g.scale);
                    this.reassignUUID(group, g.uuid);
                });
                (data.objects || []).forEach((o) => {
                    const object = this[make[o.geometry] || 'createCube'](o.name, o.properties);
                    object.position.set(...o.position);
                    object.rotation.set(...o.rotation);
                    object.scale.set(...o.scale);
                    if (o.material && o.material.color != null) object.material.color.setHex(o.material.color);
                    if (o.material && o.material.textures) {
                        Object.entries(o.material.textures).forEach(([slot, url]) => {
                            this.setTexture(object.uuid, slot, url).catch(() => {});
                        });
                    }
                    if (o.parent) {
                        const parent = this.getObjectByUUID(o.parent);
                        if (parent && parent.type === 'Group') this.addToGroup(object, parent);
                    }
                    this.reassignUUID(object, o.uuid);
                });
                (data.lights || []).forEach((l) => {
                    // `type` is a class name like "PointLight"; the old code
                    // lower-cased the whole thing, matched no case and turned
                    // every light in the file into a point light.
                    const kind = String(l.type || '').replace(/Light$/, '').toLowerCase();
                    const light = this.createLight(kind, l.name, l.properties);
                    light.position.set(...l.position);
                    light.color.setHex(l.color);
                    light.intensity = l.intensity;
                    this.reassignUUID(light, l.uuid);
                });
                return true;
            }

            // Import 3D model
            /**
             * Import a model. glTF/GLB and FBX, routed by extension.
             *
             * FBX matters because it is what Mixamo hands you, and Mixamo is
             * how most people get a rigged character and a library of
             * animations for it without rigging anything themselves.
             */
            importModel(file, callback) {
                const reader = new FileReader();
                const name = file.name.replace(/\.[^/.]+$/, '');
                const isFBX = /\.fbx$/i.test(file.name);

                const adopt = (model, animations) => {
                    this.addObject(model, name);
                    model.traverse((child) => {
                        if (!child.isMesh) return;
                        child.castShadow = true;
                        child.receiveShadow = true;
                        this.objects.set(child.uuid, child);
                        if (!this.objectProperties.has(child.uuid)) {
                            this.objectProperties.set(child.uuid,
                                { visible: true, locked: false, physicsEnabled: false });
                        }
                    });
                    // Keep the source clips: retargeting needs the clip, and
                    // the engine converts clips to keyframes on adoption.
                    this.importedClips.set(model.uuid, animations || []);
                    if (this.onModelImported) {
                        this.onModelImported(model, { animations: animations || [] });
                    }
                    callback(true, model);
                };

                reader.onload = (event) => {
                    const contents = event.target.result;
                    try {
                        if (isFBX) {
                            if (!THREE.FBXLoader) throw new Error('FBXLoader is not loaded');
                            const model = new THREE.FBXLoader().parse(contents, '');
                            adopt(model, model.animations);
                            return;
                        }
                        new THREE.GLTFLoader().parse(contents, '', (gltf) => {
                            adopt(gltf.scene, gltf.animations);
                        }, (error) => {
                            console.error('Error parsing model:', error);
                            callback(false, null);
                        });
                    } catch (error) {
                        console.error('Error loading model:', error);
                        callback(false, null);
                    }
                };
                
                reader.readAsArrayBuffer(file);
            }
        }

        /**
         * Enhanced Animation Manager - Handles all animation-related operations
         */
        class AnimationManager {
            constructor(sceneManager) {
                this.sceneManager = sceneManager;
                this.animations = new Map(); // Map of animation name to animation
                this.selectedAnimation = null;
                this.isPlaying = false;
                this.currentTime = 0;
                this._direction = 1;         // pingpong flips this
                this.clock = new THREE.Clock();
                this.onChange = null;        // set by AnimationEngine for undo/autosave
                this._suspendChange = false; // true while importing a project

                this.core = null;            // the evaluator, once it has loaded
                this._timeline = null;       // rebuilt whenever keyframes change
                loadAnimationCore().then((core) => {
                    this.core = core;
                    // Whatever time the UI already moved to applies now.
                    this.setCurrentTime(this.currentTime);
                }).catch(() => { /* already reported */ });
            }

            markChanged() {
                this.invalidateTimeline();
                if (!this._suspendChange && this.onChange) this.onChange();
            }

            /** Keyframes changed, so the compiled timeline is stale. */
            invalidateTimeline() { this._timeline = null; }

            /**
             * The selected animation as a core Timeline.
             *
             * Built from the keyframes every time they change, which is what
             * killed the dead-mixer bug rather than patching it: there is no
             * cache that can be empty after a load, because the keyframes ARE
             * the source and nothing else holds state.
             */
            timeline() {
                if (!this.core || !this.selectedAnimation) return null;
                if (!this._timeline) {
                    this._timeline = this.core.timelineFromAnimation(this.selectedAnimation);
                }
                return this._timeline;
            }

            update() {
                if (!this.isPlaying) return;
                const animation = this.selectedAnimation;
                const duration = animation ? animation.duration : 0;
                let time = this.currentTime + this.clock.getDelta() * this._direction;

                if (animation && time >= duration) {
                    if (animation.loop === 'repeat') time -= duration;
                    else if (animation.loop === 'pingpong') { this._direction = -1; time = duration; }
                    else { this.setCurrentTime(duration); this.stop(); return; }
                } else if (time <= 0 && this._direction < 0) {
                    if (animation && animation.loop === 'pingpong') { this._direction = 1; time = 0; }
                    else { this.setCurrentTime(0); this.stop(); return; }
                }
                this.setCurrentTime(time);
            }

            createAnimation(name, duration, loop = 'once') {
                const animation = {
                    name,
                    duration,
                    loop,
                    keyframes: new Map(), // Map of object UUID to keyframes
                    curves: new Map(), // legacy: read by nothing, kept so old files load
                    tweens: new Map()  // legacy: read by nothing, kept so old files load
                };
                
                this.animations.set(name, animation);
                return animation;
            }

            deleteAnimation(name) {
                if (this.animations.has(name)) {
                    this.animations.delete(name);
                    
                    if (this.selectedAnimation && this.selectedAnimation.name === name) {
                        this.selectedAnimation = null;
                    }
                    
                    return true;
                }
                return false;
            }

            duplicateAnimation(name, newName) {
                if (this.animations.has(name)) {
                    const original = this.animations.get(name);
                    const duplicate = {
                        ...original,
                        name: newName,
                        keyframes: new Map(original.keyframes),
                        curves: new Map(original.curves),
                        tweens: new Map(original.tweens)
                    };
                    
                    this.animations.set(newName, duplicate);
                    return duplicate;
                }
                return null;
            }

            selectAnimation(name) {
                if (this.animations.has(name)) {
                    this.selectedAnimation = this.animations.get(name);
                    return true;
                }
                return false;
            }

            getSelectedAnimation() {
                return this.selectedAnimation;
            }

            getAllAnimations() {
                return Array.from(this.animations.values());
            }

            // Build and start clip actions for the selected animation without
            // starting playback, so poses can be sampled via setCurrentTime().
            /**
             * Take imported glTF clips into the editor's own keyframe model.
             *
             * Converting all the way down is what leaves AnimationMixer with
             * no remaining job: imported animation becomes ordinary keyframes
             * that scrub, export, render and can be edited. The old engine
             * stashed clips in a Map that nothing ever read.
             */
            async adoptClips(clips, model) {
                const [{ trackValueAt }, { clipToKeyframes }, { eulerFromQuat }] = await Promise.all([
                    import(coreUrl('./src/core/anim/Track.js')),
                    import(coreUrl('./src/backends/three3d/clipToTracks.js')),
                    import(coreUrl('./src/backends/three3d/eulerQuat.js')),
                ]);

                // Clip tracks address nodes by name or by uuid; keyframes are
                // keyed by uuid, so resolve once per import.
                const byName = new Map();
                model.traverse((node) => { if (node.name) byName.set(node.name, node); });
                const resolveTarget = (target) => {
                    const bone = /^bones\[(.+)\]$/.exec(target);
                    const node = byName.get(bone ? bone[1] : target);
                    return node ? node.uuid : (this.sceneManager.getObjectByUUID(target) ? target : null);
                };

                const adopted = [];
                clips.forEach((clip, index) => {
                    const name = clip.name || `Animation_${index + 1}`;
                    const { keyframes, skipped } = clipToKeyframes(clip,
                        { resolveTarget, trackValueAt, eulerFromQuat });
                    if (!keyframes.size) return;
                    const animation = this.createAnimation(name, clip.duration, 'repeat');
                    keyframes.forEach((list, uuid) => animation.keyframes.set(uuid, list));
                    if (skipped.length) {
                        console.warn(`animateEngine: "${name}" has ${skipped.length} channel(s) `
                            + `this engine does not animate: ${skipped.slice(0, 4).join(', ')}`);
                    }
                    adopted.push(name);
                });
                if (adopted.length && !this.selectedAnimation) this.selectAnimation(adopted[0]);
                this.markChanged();
                return adopted;
            }

            /**
             * Kept because RecordingManager calls it before capturing frames.
             * There is nothing to prepare any more -- building the timeline is
             * the whole job and setCurrentTime does it on demand.
             */
            prepareActions() { return this.timeline(); }

            play() {
                if (!this.selectedAnimation) return;
                this.isPlaying = true;
                this._direction = 1;
                this.clock.start();
            }

            pause() {
                this.isPlaying = false;
                this.clock.stop();
            }

            stop() {
                this.isPlaying = false;
                this._direction = 1;
                this.clock.stop();
                this.setCurrentTime(0);
            }

            /**
             * Pose the scene at `time`. This is the only thing that moves an
             * object, so play, scrub and offline export all agree by
             * construction and frame N is a pure function of N.
             */
            setCurrentTime(time) {
                this.currentTime = time;
                const timeline = this.timeline();
                if (!timeline) return;
                this.core.applyPoseToObjects(
                    this.core.samplePose(timeline, time),
                    (uuid) => this.sceneManager.getObjectByUUID(uuid));
            }

            addKeyframe(object, time, properties) {
                if (!this.selectedAnimation) return false;

                const uuid = object.uuid;
                if (!this.selectedAnimation.keyframes.has(uuid)) {
                    this.selectedAnimation.keyframes.set(uuid, []);
                }
                const keyframes = this.selectedAnimation.keyframes.get(uuid);
                const existing = keyframes.findIndex(kf => kf.time === time);
                if (existing !== -1) keyframes[existing] = { time, properties };
                else {
                    keyframes.push({ time, properties });
                    keyframes.sort((a, b) => a.time - b.time);
                }

                this.markChanged();
                return true;
            }

            removeKeyframe(object, time) {
                if (!this.selectedAnimation) return false;
                const keyframes = this.selectedAnimation.keyframes.get(object.uuid);
                if (!keyframes) return false;
                const index = keyframes.findIndex(kf => kf.time === time);
                if (index === -1) return false;
                keyframes.splice(index, 1);
                if (keyframes.length === 0) this.selectedAnimation.keyframes.delete(object.uuid);
                this.markChanged();
                return true;
            }

            getKeyframes(object) {
                if (!this.selectedAnimation) return [];
                return this.selectedAnimation.keyframes.get(object.uuid) || [];
            }

            // Set the interpolation mode ('linear'|'smooth'|'step'|'bezier') and optional
            // bezier handles on every keyframe of an object in the selected animation.
            setInterpolation(object, interp, handles) {
                if (!this.selectedAnimation) return false;
                const kfs = this.selectedAnimation.keyframes.get(object.uuid);
                if (!kfs) return false;
                kfs.forEach(kf => {
                    kf.properties.interp = interp;
                    if (handles) kf.properties.handles = handles;
                });
                this.markChanged();
                return true;
            }

            exportAnimation(name) {
                if (!this.animations.has(name)) {
                    return null;
                }
                
                const animation = this.animations.get(name);
                const exportData = {
                    name: animation.name,
                    duration: animation.duration,
                    loop: animation.loop,
                    keyframes: {},
                    curves: {},
                    tweens: {},
                    metadata: {
                        version: '1.0',
                        exportDate: new Date().toISOString()
                    }
                };
                
                // Export keyframes
                animation.keyframes.forEach((keyframes, uuid) => {
                    exportData.keyframes[uuid] = keyframes;
                });
                
                // Export curves
                animation.curves.forEach((curves, uuid) => {
                    exportData.curves[uuid] = curves;
                });
                
                // Export tweens
                animation.tweens.forEach((tweens, uuid) => {
                    exportData.tweens[uuid] = tweens;
                });
                
                return JSON.stringify(exportData, null, 2);
            }

            // Import animation data
            importAnimation(animationData) {
                try {
                    const data = JSON.parse(animationData);
                    
                    const animation = this.createAnimation(data.name, data.duration, data.loop);
                    
                    // Import keyframes
                    if (data.keyframes) {
                        Object.keys(data.keyframes).forEach(uuid => {
                            animation.keyframes.set(uuid, data.keyframes[uuid]);
                        });
                    }
                    
                    // Import curves
                    if (data.curves) {
                        Object.keys(data.curves).forEach(uuid => {
                            animation.curves.set(uuid, data.curves[uuid]);
                        });
                    }
                    
                    // Import tweens
                    if (data.tweens) {
                        Object.keys(data.tweens).forEach(uuid => {
                            animation.tweens.set(uuid, data.tweens[uuid]);
                        });
                    }
                    
                    return animation;
                } catch (error) {
                    console.error('Error importing animation:', error);
                    return null;
                }
            }
        }

        /**
         * Physics Manager - Handles physics simulation
         */
        class PhysicsManager {
            constructor(sceneManager) {
                this.sceneManager = sceneManager;
                this.world = null;
                this.enabled = false;
                this.objects = new Map(); // Map of object UUID to physics body
                this.gravity = -9.8;
                this.timeStep = 1 / 60;
                this.simulatedTime = 0;
                this.accumulator = 0;
                // Where each body started, so a render can rewind to t=0.
                this.initialTransforms = new Map();
            }

            init() {
                // Create physics world
                this.world = new CANNON.World();
                this.world.gravity.set(0, this.gravity, 0);
                this.world.broadphase = new CANNON.NaiveBroadphase();
                this.world.solver.iterations = 10;
            }

            update(deltaSec) {
                if (!this.enabled || !this.world) return;
                // Accumulate real time and spend it in fixed steps. Stepping
                // once per rendered frame tied the simulation to the display:
                // half speed at 30fps, double on a 120Hz panel.
                this.accumulator += Math.min(deltaSec ?? this.timeStep, 0.25);
                let steps = 0;
                while (this.accumulator >= this.timeStep && steps < 8) {
                    this.world.step(this.timeStep);
                    this.accumulator -= this.timeStep;
                    this.simulatedTime += this.timeStep;
                    steps++;
                }
                if (steps) this._syncBodies();
            }

            /**
             * Advance the simulation to an absolute time in fixed substeps.
             *
             * An offline render steps frames rather than waiting for them, so
             * it never calls update() and physics simply did not happen in any
             * export -- objects sat wherever the last live frame left them.
             * Fixed substeps also make the result reproducible, which a
             * variable realtime step never was.
             */
            stepTo(tSec) {
                if (!this.enabled || !this.world) return;
                // Going backwards means a scrub or a re-render; the only
                // honest answer is to start over, since a solver has no
                // reverse.
                if (tSec < this.simulatedTime) this.resetSimulation();
                // Cap the catch-up so a jump to the end of a long animation
                // cannot lock the tab solving a million substeps.
                const steps = Math.min(Math.ceil((tSec - this.simulatedTime) / this.timeStep), 4000);
                for (let i = 0; i < steps; i++) this.world.step(this.timeStep);
                this.simulatedTime += steps * this.timeStep;
                this._syncBodies();
            }

            /** Put every body back where its Three object started. */
            resetSimulation() {
                this.simulatedTime = 0;
                this.objects.forEach((body, uuid) => {
                    const start = this.initialTransforms.get(uuid);
                    if (!start) return;
                    body.position.set(...start.position);
                    body.quaternion.set(...start.quaternion);
                    body.velocity.set(0, 0, 0);
                    body.angularVelocity.set(0, 0, 0);
                });
            }

            _syncBodies() {
                this.objects.forEach((body, uuid) => {
                    const object = this.sceneManager.getObjectByUUID(uuid);
                    // A deleted object used to leave its body simulating
                    // forever, because SceneManager.removeObject has no way to
                    // reach this class. Reaping here needs no such wiring: this
                    // is the one place that looks the object up anyway.
                    if (!object) { this.removeBodyFor(uuid); return; }
                    object.position.copy(body.position);
                    object.quaternion.copy(body.quaternion);
                });
            }

            removeBodyFor(uuid) {
                const body = this.objects.get(uuid);
                if (!body) return;
                this.world.removeBody(body);
                this.objects.delete(uuid);
                this.initialTransforms.delete(uuid);
            }

            enable() {
                this.enabled = true;
                if (!this.world) {
                    this.init();
                }
            }

            disable() {
                this.enabled = false;
            }

            toggle() {
                this.enabled = !this.enabled;
                if (this.enabled && !this.world) {
                    this.init();
                }
                return this.enabled;
            }

            addObject(object, properties = {}) {
                if (!this.enabled || !this.world) return;
                
                const uuid = object.uuid;
                let body;
                
                // Create physics body based on object type
                if (object.geometry) {
                    if (object.geometry.type === 'BoxGeometry') {
                        const size = object.geometry.parameters;
                        const halfExtents = new CANNON.Vec3(size.width / 2, size.height / 2, size.depth / 2);
                        const shape = new CANNON.Box(halfExtents);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    } else if (object.geometry.type === 'SphereGeometry') {
                        const radius = object.geometry.parameters.radius;
                        const shape = new CANNON.Sphere(radius);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    } else if (object.geometry.type === 'CylinderGeometry') {
                        const params = object.geometry.parameters;
                        const shape = new CANNON.Cylinder(params.radiusTop, params.radiusBottom, params.height, params.radialSegments);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    } else if (object.geometry.type === 'ConeGeometry') {
                        const params = object.geometry.parameters;
                        const shape = new CANNON.Cylinder(0, params.radius, params.height, params.radialSegments);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    } else if (object.geometry.type === 'TorusGeometry') {
                        // Approximate torus with a sphere for physics
                        const params = object.geometry.parameters;
                        const radius = params.radius + params.tube;
                        const shape = new CANNON.Sphere(radius);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    } else if (object.geometry.type === 'TetrahedronGeometry') {
                        // Approximate tetrahedron with a sphere for physics
                        const params = object.geometry.parameters;
                        const radius = params.radius;
                        const shape = new CANNON.Sphere(radius);
                        body = new CANNON.Body({
                            mass: properties.mass || 1,
                            position: new CANNON.Vec3(
                                object.position.x,
                                object.position.y,
                                object.position.z
                            ),
                            shape: shape
                        });
                    }
                    
                    if (body) {
                        body.material = new CANNON.Material();
                        body.material.friction = properties.friction || 0.5;
                        body.material.restitution = properties.restitution || 0.3;
                        
                        if (properties.isStatic) {
                            body.mass = 0;
                            body.type = CANNON.Body.STATIC;
                        }
                        
                        this.world.addBody(body);
                        this.objects.set(uuid, body);
                        // Remember the rest state so stepTo can rewind to t=0.
                        this.initialTransforms.set(uuid, {
                            position: [body.position.x, body.position.y, body.position.z],
                            quaternion: [body.quaternion.x, body.quaternion.y,
                                         body.quaternion.z, body.quaternion.w],
                        });
                    }
                }
            }

            removeObject(object) { this.removeBodyFor(object.uuid); }

            updateObjectProperties(object, properties) {
                const uuid = object.uuid;
                if (this.objects.has(uuid)) {
                    const body = this.objects.get(uuid);
                    
                    if (properties.mass !== undefined) {
                        body.mass = properties.mass;
                        body.updateMassProperties();
                    }
                    
                    if (properties.friction !== undefined) {
                        body.material.friction = properties.friction;
                    }
                    
                    if (properties.restitution !== undefined) {
                        body.material.restitution = properties.restitution;
                    }
                    
                    if (properties.isStatic !== undefined) {
                        if (properties.isStatic) {
                            body.mass = 0;
                            body.type = CANNON.Body.STATIC;
                        } else {
                            body.mass = properties.mass || 1;
                            body.type = CANNON.Body.DYNAMIC;
                        }
                        body.updateMassProperties();
                    }
                }
            }
        }

        /**
         * Edit Manager - Handles object editing, sculpting, and transform operations
         */
        class EditManager {
            constructor(sceneManager, uiManager) {
                this.sceneManager = sceneManager;
                this.uiManager = uiManager;
                this.currentTool = 'select';
                this.isDragging = false;
                this.dragStart = new THREE.Vector2();
                this.dragObject = null;
                this.dragOffset = new THREE.Vector3();
                this.transformGizmo = null;
                this.lightHelper = null;
                this.sculptOverlay = null;
                this.sculptCursor = null;
                this.sculptSize = 0.5;
                this.sculptStrength = 1.0;
                this.sculptTool = 'push';
                this.isSculpting = false;
                this.originalVertices = null;
                this.modifiedVertices = null;
            }

            init() {
                // Initialize transform gizmo
                this.initTransformGizmo();
                
                // Initialize light helper
                this.initLightHelper();
                
                // Initialize sculpt overlay
                this.initSculptOverlay();
                
                // Set up event listeners
                this.setupEventListeners();
            }

            initTransformGizmo() {
                this.transformGizmo = document.getElementById('transformGizmo');
            }

            initLightHelper() {
                this.lightHelper = document.getElementById('lightHelper');
            }

            initSculptOverlay() {
                this.sculptOverlay = document.getElementById('sculptOverlay');
                this.sculptCursor = document.getElementById('sculptCursor');
            }

            setupEventListeners() {
                // Tool buttons
                const subdivideBtn = document.getElementById('subdivideTool');
                if (subdivideBtn) subdivideBtn.addEventListener('click', () => {
                    const obj = this.sceneManager.getSelectedObject();
                    if (obj && obj.isMesh) this.sceneManager.subdivide(obj);
                });
                document.getElementById('selectTool').addEventListener('click', () => this.setTool('select'));
                document.getElementById('moveTool').addEventListener('click', () => this.setTool('move'));
                document.getElementById('rotateTool').addEventListener('click', () => this.setTool('rotate'));
                document.getElementById('scaleTool').addEventListener('click', () => this.setTool('scale'));
                
                // Sculpt tool buttons
                document.getElementById('sculptPushTool').addEventListener('click', () => this.setSculptTool('push'));
                document.getElementById('sculptPullTool').addEventListener('click', () => this.setSculptTool('pull'));
                document.getElementById('sculptSmoothTool').addEventListener('click', () => this.setSculptTool('smooth'));
                document.getElementById('sculptRidgeTool').addEventListener('click', () => this.setSculptTool('ridge'));
                document.getElementById('sculptPinchTool').addEventListener('click', () => this.setSculptTool('pinch'));
                document.getElementById('sculptFlattenTool').addEventListener('click', () => this.setSculptTool('flatten'));
                
                // Sculpt tool options
                document.getElementById('sculptSize').addEventListener('input', (e) => {
                    this.sculptSize = parseFloat(e.target.value);
                    document.getElementById('sculptSizeValue').textContent = this.sculptSize.toFixed(1);
                });
                
                document.getElementById('sculptStrength').addEventListener('input', (e) => {
                    this.sculptStrength = parseFloat(e.target.value);
                    document.getElementById('sculptStrengthValue').textContent = this.sculptStrength.toFixed(1);
                });
                
                // Mouse events for dragging
                const viewport = document.getElementById('viewport');
                viewport.addEventListener('mousedown', (e) => this.onMouseDown(e));
                viewport.addEventListener('mousemove', (e) => this.onMouseMove(e));
                viewport.addEventListener('mouseup', (e) => this.onMouseUp(e));
                
                // Touch events
                viewport.addEventListener('touchstart', (e) => this.onTouchStart(e));
                viewport.addEventListener('touchmove', (e) => this.onTouchMove(e));
                viewport.addEventListener('touchend', (e) => this.onTouchEnd(e));
            }

            setTool(tool) {
                this.currentTool = tool;
                
                // Update button states
                document.querySelectorAll('.edit-tools .tool-button').forEach(button => {
                    button.classList.remove('active');
                });
                
                if (tool === 'select') {
                    document.getElementById('selectTool').classList.add('active');
                } else if (tool === 'move') {
                    document.getElementById('moveTool').classList.add('active');
                } else if (tool === 'rotate') {
                    document.getElementById('rotateTool').classList.add('active');
                } else if (tool === 'scale') {
                    document.getElementById('scaleTool').classList.add('active');
                }
                
                // Update transform gizmo visibility
                this.updateTransformGizmo();
                
                // Update sculpt overlay visibility
                if (tool === 'select' || tool === 'move' || tool === 'rotate' || tool === 'scale') {
                    this.sculptOverlay.classList.remove('active');
                } else {
                    this.sculptOverlay.classList.add('active');
                }
            }

            setSculptTool(tool) {
                this.sculptTool = tool;
                
                // Update button states
                document.querySelectorAll('.sculpt-tools .tool-button').forEach(button => {
                    button.classList.remove('active');
                });
                
                if (tool === 'push') {
                    document.getElementById('sculptPushTool').classList.add('active');
                } else if (tool === 'pull') {
                    document.getElementById('sculptPullTool').classList.add('active');
                } else if (tool === 'smooth') {
                    document.getElementById('sculptSmoothTool').classList.add('active');
                } else if (tool === 'ridge') {
                    document.getElementById('sculptRidgeTool').classList.add('active');
                } else if (tool === 'pinch') {
                    document.getElementById('sculptPinchTool').classList.add('active');
                } else if (tool === 'flatten') {
                    document.getElementById('sculptFlattenTool').classList.add('active');
                }
            }

            updateTransformGizmo() {
                const selectedObject = this.sceneManager.getSelectedObject();
                
                if (!selectedObject || this.currentTool === 'select') {
                    this.transformGizmo.style.display = 'none';
                    // Forget the cached build, so re-selecting rebuilds with
                    // listeners bound to the object actually selected.
                    this._handleObject = null;
                    return;
                }
                
                // Calculate screen position of the object
                const vector = new THREE.Vector3();
                selectedObject.getWorldPosition(vector);
                vector.project(this.sceneManager.camera);
                
                const viewport = document.getElementById('viewport');
                const rect = viewport.getBoundingClientRect();
                const x = (vector.x * 0.5 + 0.5) * rect.width;
                const y = (-vector.y * 0.5 + 0.5) * rect.height;
                
                // Show transform gizmo. translate() composites; left/top
                // would relayout the handles every frame.
                this.transformGizmo.style.display = 'block';
                this.transformGizmo.style.left = '0';
                this.transformGizmo.style.top = '0';
                this.transformGizmo.style.transform = `translate(${x}px, ${y}px)`;
                
                this.createTransformHandles(selectedObject, x, y);
            }

            /**
             * Build the handles, once per tool and object.
             *
             * This used to run every frame: innerHTML = '' plus seven fresh
             * <div>s with fresh listeners, sixty times a second, forever. It
             * also positioned each handle at an ABSOLUTE viewport coordinate
             * while the gizmo container was itself absolutely positioned at
             * the same coordinate -- so every handle rendered at roughly twice
             * the offset it should have, which is why they never sat on the
             * object. Offsets relative to the container fix the placement and
             * make the per-frame work two style writes.
             */
            createTransformHandles(object, x, y) {
                if (this._handleTool === this.currentTool && this._handleObject === object) return;
                this._handleTool = this.currentTool;
                this._handleObject = object;
                this.transformGizmo.replaceChildren();

                const specs = TRANSFORM_HANDLES[this.currentTool];
                if (!specs) return;
                for (const [className, dx, dy, axis, size] of specs) {
                    const handle = document.createElement('div');
                    handle.className = className;
                    handle.style.width = `${size ?? HANDLE_SIZE}px`;
                    handle.style.height = `${size ?? HANDLE_SIZE}px`;
                    handle.style.left = `${dx}px`;
                    handle.style.top = `${dy}px`;
                    handle.addEventListener('mousedown', (e) => this.startDrag(e, object, axis));
                    this.transformGizmo.appendChild(handle);
                }
            }

            updateLightHelper() {
                const selectedObject = this.sceneManager.getSelectedObject();
                
                if (!selectedObject || !selectedObject.isLight) {
                    this.lightHelper.style.display = 'none';
                    return;
                }
                
                // Calculate screen position of the light
                const vector = new THREE.Vector3();
                selectedObject.getWorldPosition(vector);
                vector.project(this.sceneManager.camera);
                
                const viewport = document.getElementById('viewport');
                const rect = viewport.getBoundingClientRect();
                const x = (vector.x * 0.5 + 0.5) * rect.width;
                const y = (-vector.y * 0.5 + 0.5) * rect.height;
                
                // Show light helper
                this.lightHelper.style.display = 'block';
                
                // Create light handle
                this.lightHelper.innerHTML = '';
                
                const handleSize = 16;
                const handle = document.createElement('div');
                handle.className = 'light-handle';
                handle.style.width = `${handleSize}px`;
                handle.style.height = `${handleSize}px`;
                handle.style.left = `${x - handleSize / 2}px`;
                handle.style.top = `${y - handleSize / 2}px`;
                handle.addEventListener('mousedown', (e) => this.startDrag(e, selectedObject, 'light'));
                this.lightHelper.appendChild(handle);
                
                // Create light direction line
                const lineLength = 100;
                const line = document.createElement('div');
                line.className = 'light-line';
                line.style.width = '2px';
                line.style.height = `${lineLength}px`;
                line.style.left = `${x - 1}px`;
                line.style.top = `${y}px`;
                line.style.transformOrigin = 'top center';
                
                // Calculate rotation based on light direction
                const direction = new THREE.Vector3();
                if (selectedObject.target) {
                    selectedObject.getWorldDirection(direction);
                } else {
                    direction.set(0, -1, 0);
                }
                
                const angle = Math.atan2(direction.x, -direction.y) * (180 / Math.PI);
                line.style.transform = `rotate(${angle}deg)`;
                
                this.lightHelper.appendChild(line);
            }

            startDrag(event, object, axis) {
                event.preventDefault();
                event.stopPropagation();
                
                this.isDragging = true;
                this.dragObject = object;
                this.dragAxis = axis;
                
                // Store initial position and values
                this.dragStart.set(event.clientX, event.clientY);
                this.dragStartPosition = object.position.clone();
                this.dragStartRotation = object.rotation.clone();
                this.dragStartScale = object.scale.clone();
                this._dragPlane = this._planeForAxis(axis, object);
                this._dragFrom = this._dragPlane ? this._pointOnDragPlane(event) : null;
                
                // Disable orbit controls while dragging
                this.sceneManager.controls.enabled = false;
            }

            /**
             * The plane a position drag happens in.
             *
             * Position used to move by screen pixels times 0.01 -- so a drag
             * covered a different distance depending on how far away the
             * camera was, 'z' was driven by vertical mouse movement, and the
             * three plane handles had no branch at all and simply did nothing.
             * Projecting the pointer ray onto a plane in the scene is what
             * makes the object follow the cursor instead.
             *
             * For a single axis, the plane contains that axis and faces the
             * camera as squarely as it can; the hit is then projected back
             * onto the axis.
             */
            _planeForAxis(axis, object) {
                const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
                const origin = object.getWorldPosition(new THREE.Vector3());
                const camera = this.sceneManager.camera;

                if (axis.length === 2 && AXES[axis[0]] && AXES[axis[1]]) {
                    // A plane handle: its normal is simply the third axis.
                    const used = new Set(axis.split(''));
                    const normalAxis = ['x', 'y', 'z'].find((a) => !used.has(a));
                    return {
                        kind: 'plane',
                        axes: [new THREE.Vector3(...AXES[axis[0]]), new THREE.Vector3(...AXES[axis[1]])],
                        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(
                            new THREE.Vector3(...AXES[normalAxis]), origin),
                    };
                }
                if (!AXES[axis]) return null;      // rotate/scale/light keep screen deltas

                const dir = new THREE.Vector3(...AXES[axis]);
                const toCamera = camera.getWorldPosition(new THREE.Vector3()).sub(origin);
                // The part of the view direction perpendicular to the axis is
                // the most face-on normal available.
                let normal = toCamera.clone().sub(dir.clone().multiplyScalar(toCamera.dot(dir)));
                if (normal.lengthSq() < 1e-8) {
                    // Looking straight down the axis: any perpendicular will do.
                    normal = Math.abs(dir.y) < 0.9
                        ? new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0))
                        : new THREE.Vector3(1, 0, 0);
                }
                return {
                    kind: 'axis',
                    axes: [dir],
                    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), origin),
                };
            }

            /** Where the pointer ray meets the drag plane, in world space. */
            _pointOnDragPlane(event) {
                const viewport = document.getElementById('viewport');
                const rect = viewport.getBoundingClientRect();
                const ndc = new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1);
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(ndc, this.sceneManager.camera);
                const hit = new THREE.Vector3();
                // A ray parallel to the plane never meets it; hold the last
                // position rather than snapping the object to infinity.
                return raycaster.ray.intersectPlane(this._dragPlane.plane, hit) ? hit : null;
            }

            onMouseDown(event) {
                // Handle sculpting
                if (this.sculptOverlay.classList.contains('active')) {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    
                    if (selectedObject && selectedObject.isMesh) {
                        this.isSculpting = true;
                        this.startSculpting(event, selectedObject);
                    }
                }
            }

            onMouseMove(event) {
                // Handle dragging
                if (this.isDragging && this.dragObject) {
                    this.handleDrag(event);
                }
                
                // Handle sculpting
                if (this.isSculpting) {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    
                    if (selectedObject && selectedObject.isMesh) {
                        this.handleSculpting(event, selectedObject);
                    }
                }
                
                // Update transform gizmo
                this.updateTransformGizmo();
                
                // Update light helper
                this.updateLightHelper();
                
                // Update sculpt cursor
                if (this.sculptOverlay.classList.contains('active')) {
                    const viewport = document.getElementById('viewport');
                    const rect = viewport.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    
                    this.sculptCursor.style.left = `${x - this.sculptSize * 25}px`;
                    this.sculptCursor.style.top = `${y - this.sculptSize * 25}px`;
                    this.sculptCursor.style.width = `${this.sculptSize * 50}px`;
                    this.sculptCursor.style.height = `${this.sculptSize * 50}px`;
                }
            }

            onMouseUp(event) {
                // Handle dragging
                if (this.isDragging) {
                    this.isDragging = false;
                    this.dragObject = null;
                    
                    // Re-enable orbit controls
                    this.sceneManager.controls.enabled = true;

                    // Update properties panel
                    this.uiManager.updateProperties();
                    this.sceneManager.markChanged();
                }

                // Handle sculpting
                if (this.isSculpting) {
                    this.isSculpting = false;
                    this.finishSculpting();
                }
            }

            onTouchStart(event) {
                if (event.touches.length === 1) {
                    const touch = event.touches[0];
                    const mouseEvent = new MouseEvent('mousedown', {
                                                clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    this.onMouseDown(mouseEvent);
                }
            }
            
            onTouchMove(event) {
                if (event.touches.length === 1) {
                    const touch = event.touches[0];
                    const mouseEvent = new MouseEvent('mousemove', {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                    });
                    this.onMouseMove(mouseEvent);
                }
            }
            
            onTouchEnd(event) {
                const mouseEvent = new MouseEvent('mouseup', {});
                this.onMouseUp(mouseEvent);
            }
            
            handleDrag(event) {
                if (!this.isDragging || !this.dragObject) return;
                
                const dx = event.clientX - this.dragStart.x;
                const dy = event.clientY - this.dragStart.y;
                
                // Position drags follow the cursor through the scene; rotate
                // and scale stay screen-relative, which is the convention for
                // a DOM gizmo and is not what was wrong with this code.
                if (this._dragPlane && this._dragFrom) {
                    const to = this._pointOnDragPlane(event);
                    if (!to) return;
                    const moved = to.sub(this._dragFrom);
                    const next = this.dragStartPosition.clone();
                    for (const axis of this._dragPlane.axes) {
                        next.addScaledVector(axis, moved.dot(axis));
                    }
                    this.dragObject.position.copy(next);
                    this.uiManager.updateProperties();
                    return;
                }

                if (this.dragAxis === 'rotateX') {
                    this.dragObject.rotation.x = this.dragStartRotation.x + dy * 0.01;
                } else if (this.dragAxis === 'rotateY') {
                    this.dragObject.rotation.y = this.dragStartRotation.y + dx * 0.01;
                } else if (this.dragAxis === 'rotateZ') {
                    this.dragObject.rotation.z = this.dragStartRotation.z + dx * 0.01;
                } else if (this.dragAxis === 'scaleX') {
                    this.dragObject.scale.x = Math.max(0.1, this.dragStartScale.x + dx * 0.01);
                } else if (this.dragAxis === 'scaleY') {
                    this.dragObject.scale.y = Math.max(0.1, this.dragStartScale.y + dy * 0.01);
                } else if (this.dragAxis === 'scaleZ') {
                    this.dragObject.scale.z = Math.max(0.1, this.dragStartScale.z + dy * 0.01);
                } else if (this.dragAxis === 'scaleUniform') {
                    const scale = Math.max(0.1, this.dragStartScale.x + dx * 0.01);
                    this.dragObject.scale.set(scale, scale, scale);
                } else if (this.dragAxis === 'light') {
                    // Lights are dragged from their own helper, which has no
                    // axis, so this one stays screen-relative.
                    this.dragObject.position.x = this.dragStartPosition.x + dx * 0.01;
                    this.dragObject.position.y = this.dragStartPosition.y - dy * 0.01;
                }
                
                // Update properties panel
                this.uiManager.updateProperties();
            }
            
            startSculpting(event, object) {
                if (!object.isMesh) return;
                
                this.isSculpting = true;
                
                // Store original vertices
                const geometry = makeGeometryEditable(object);
                if (!geometry.attributes.position) return;
                
                this.originalVertices = geometry.attributes.position.array.slice();
                this.modifiedVertices = geometry.attributes.position.array.slice();
                
                // Store original normals
                if (geometry.attributes.normal) {
                    this.originalNormals = geometry.attributes.normal.array.slice();
                }
            }
            
            handleSculpting(event, object) {
                if (!this.isSculpting || !object.isMesh) return;
                
                const geometry = makeGeometryEditable(object);
                if (!geometry.attributes.position) return;
                
                // Get mouse position in normalized device coordinates
                const viewport = document.getElementById('viewport');
                const rect = viewport.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                
                // Raycast to find intersection with object
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(x, y), this.sceneManager.camera);
                
                const intersects = raycaster.intersectObject(object);
                if (intersects.length === 0) return;
                
                const point = intersects[0].point;
                const face = intersects[0].face;
                
                // Get face normal in world space
                const normal = new THREE.Vector3();
                normal.copy(face.normal);
                normal.transformDirection(object.matrixWorld);
                
                // Get vertices and apply sculpting
                const positions = geometry.attributes.position.array;
                const vertex = new THREE.Vector3();
                // One pass to bucket the mesh, instead of a full scan per
                // affected vertex. Built here because the positions move as
                // the stroke is applied.
                const vertexIndex = this.sculptTool === 'smooth'
                    ? this.buildVertexIndex(geometry) : null;
                
                for (let i = 0; i < positions.length; i += 3) {
                    vertex.set(positions[i], positions[i + 1], positions[i + 2]);
                    vertex.applyMatrix4(object.matrixWorld);
                    
                    const distance = vertex.distanceTo(point);
                    
                    if (distance < this.sculptSize) {
                        const influence = 1 - (distance / this.sculptSize);
                        const strength = this.sculptStrength * influence * 0.1;
                        
                        // Apply sculpting based on tool
                        if (this.sculptTool === 'push') {
                            vertex.sub(normal.clone().multiplyScalar(strength));
                        } else if (this.sculptTool === 'pull') {
                            vertex.add(normal.clone().multiplyScalar(strength));
                        } else if (this.sculptTool === 'smooth') {
                            // Smooth by averaging with neighbors
                            const neighbors = vertexIndex.near(i / 3);
                            if (!neighbors.length) continue;   // isolated vertex: nothing to average
                            const avgPosition = new THREE.Vector3();
                            
                            neighbors.forEach(neighborIndex => {
                                const ni = neighborIndex * 3;
                                avgPosition.x += this.originalVertices[ni];
                                avgPosition.y += this.originalVertices[ni + 1];
                                avgPosition.z += this.originalVertices[ni + 2];
                            });
                            
                            avgPosition.divideScalar(neighbors.length);
                            
                            // Convert to world space
                            avgPosition.applyMatrix4(object.matrixWorld);
                            
                            // Move toward average position
                            vertex.lerp(avgPosition, strength * 0.5);
                        } else if (this.sculptTool === 'ridge') {
                            // Create a ridge by moving vertices away from the center
                            const direction = vertex.clone().sub(point).normalize();
                            vertex.add(direction.multiplyScalar(strength));
                        } else if (this.sculptTool === 'pinch') {
                            // Pinch by moving vertices toward the center
                            const direction = vertex.clone().sub(point).normalize();
                            vertex.sub(direction.multiplyScalar(strength));
                        } else if (this.sculptTool === 'flatten') {
                            // Flatten by moving vertices toward a plane
                            const planePoint = point.clone();
                            const planeNormal = normal.clone();
                            const distanceToPlane = vertex.clone().sub(planePoint).dot(planeNormal);
                            vertex.sub(planeNormal.clone().multiplyScalar(distanceToPlane * strength));
                        }
                        
                        // Convert back to local space
                        vertex.applyMatrix4(new THREE.Matrix4().getInverse(object.matrixWorld));
                        
                        // Update vertex position
                        positions[i] = vertex.x;
                        positions[i + 1] = vertex.y;
                        positions[i + 2] = vertex.z;
                    }
                }
                
                // Update geometry
                geometry.attributes.position.needsUpdate = true;
                geometry.computeVertexNormals();
            }
            
            /**
             * A spatial hash over the vertices, built once per brush stroke.
             *
             * The smooth brush asked for a vertex's neighbours by scanning
             * every vertex and measuring the distance -- per affected vertex,
             * per mousemove. On a mesh subdivided four times that is 85
             * million distance checks and twice as many Vector3 allocations
             * for a single brush event, which is why smooth locked the tab.
             *
             * Bucketing by the search radius makes each query look at 27 cells
             * instead of the whole mesh, and keeps the "near enough counts as
             * connected" rule the brush was written around -- a non-indexed
             * mesh duplicates vertices at shared corners, so index adjacency
             * would silently stop smoothing across seams.
             */
            buildVertexIndex(geometry, radius = null) {
                const pos = geometry.attributes.position;
                // The old threshold was a hardcoded 0.5 in model units, which
                // does not scale with the mesh: on a unit cube subdivided four
                // times it caught 1,355 "neighbours" per vertex, so smooth was
                // really averaging with a quarter of the model and erased
                // detail rather than relaxing it. Scaling to the typical
                // spacing between vertices makes it local, and incidentally
                // makes each query cheap.
                if (radius == null) {
                    geometry.computeBoundingBox();
                    const size = geometry.boundingBox.getSize(new THREE.Vector3()).length();
                    radius = Math.max(1e-4, (size / Math.cbrt(Math.max(pos.count, 1))) * 1.5);
                }
                const buckets = new Map();
                const cellOf = (v) => Math.floor(v / radius);
                const key = (cx, cy, cz) => `${cx},${cy},${cz}`;

                for (let i = 0; i < pos.count; i++) {
                    const k = key(cellOf(pos.getX(i)), cellOf(pos.getY(i)), cellOf(pos.getZ(i)));
                    let bucket = buckets.get(k);
                    if (!bucket) buckets.set(k, (bucket = []));
                    bucket.push(i);
                }

                const r2 = radius * radius;
                return {
                    near(vertexIndex) {
                        const x = pos.getX(vertexIndex);
                        const y = pos.getY(vertexIndex);
                        const z = pos.getZ(vertexIndex);
                        const cx = cellOf(x), cy = cellOf(y), cz = cellOf(z);
                        const out = [];
                        for (let dx = -1; dx <= 1; dx++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dz = -1; dz <= 1; dz++) {
                                    const bucket = buckets.get(key(cx + dx, cy + dy, cz + dz));
                                    if (!bucket) continue;
                                    for (const i of bucket) {
                                        if (i === vertexIndex) continue;
                                        const ddx = pos.getX(i) - x;
                                        const ddy = pos.getY(i) - y;
                                        const ddz = pos.getZ(i) - z;
                                        if (ddx * ddx + ddy * ddy + ddz * ddz < r2) out.push(i);
                                    }
                                }
                            }
                        }
                        return out;
                    },
                };
            }
            
            finishSculpting() {
                this.isSculpting = false;
                this.originalVertices = null;
                this.modifiedVertices = null;
                this.originalNormals = null;
                this.sceneManager.markChanged();
            }
            
            update() {
                // Update transform gizmo and light helper positions
                this.updateTransformGizmo();
                this.updateLightHelper();
            }
        }

        /**
         * UI Manager - Handles all UI-related operations
         */
        class UIManager {
            constructor(animationEngine, sceneManager, animationManager, physicsManager) {
                this.animationEngine = animationEngine;
                this.sceneManager = sceneManager;
                this.animationManager = animationManager;
                this.physicsManager = physicsManager;
                this.toolboxVisible = true;
                this.activePanel = 'objects';
            }

            init() {
                // Set up event listeners
                this.setupEventListeners();
                
                // Initialize hierarchy
                this.updateHierarchy();
                
                // Initialize properties panel
                this.updateProperties();
                
                // Initialize animations panel
                this.updateAnimations();
                
                // Initialize timeline
                this.updateTimeline();
                
                // Initialize toolbox toggle
                this.updateToolboxToggle();
            }

            setupEventListeners() {
                // Toolbox toggle
                document.getElementById('toolboxToggle').addEventListener('click', () => {
                    this.toggleToolbox();
                });
                
                // Navigation items
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const panel = item.dataset.panel;
                        this.showPanel(panel);
                    });
                });
                
                // Tool panel close buttons
                document.querySelectorAll('.tool-panel-close').forEach(button => {
                    button.addEventListener('click', () => {
                        const panel = button.dataset.panel;
                        this.hidePanel(panel);
                    });
                });
                
                // Object creation buttons
                document.getElementById('addCube').addEventListener('click', () => {
                    const object = this.sceneManager.createCube();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addSphere').addEventListener('click', () => {
                    const object = this.sceneManager.createSphere();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addCylinder').addEventListener('click', () => {
                    const object = this.sceneManager.createCylinder();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addCone').addEventListener('click', () => {
                    const object = this.sceneManager.createCone();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addTorus').addEventListener('click', () => {
                    const object = this.sceneManager.createTorus();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addTetrahedron').addEventListener('click', () => {
                    const object = this.sceneManager.createTetrahedron();
                    this.sceneManager.selectObject(object);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                // Light creation buttons
                document.getElementById('addPointLight').addEventListener('click', (e) => {
                    e.preventDefault();
                    const light = this.sceneManager.createLight('point');
                    this.sceneManager.selectObject(light);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addSpotLight').addEventListener('click', (e) => {
                    e.preventDefault();
                    const light = this.sceneManager.createLight('spot');
                    this.sceneManager.selectObject(light);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addDirectionalLight').addEventListener('click', (e) => {
                    e.preventDefault();
                    const light = this.sceneManager.createLight('directional');
                    this.sceneManager.selectObject(light);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                document.getElementById('addAmbientLight').addEventListener('click', (e) => {
                    e.preventDefault();
                    const light = this.sceneManager.createLight('ambient');
                    this.sceneManager.selectObject(light);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                // Group creation button
                document.getElementById('addGroup').addEventListener('click', () => {
                    const group = this.sceneManager.createGroup();
                    this.sceneManager.selectObject(group);
                    this.updateHierarchy();
                    this.updateProperties();
                });
                
                // Model import button
                document.getElementById('importModel').addEventListener('click', () => {
                    document.getElementById('modelFileInput').click();
                });
                
                document.getElementById('modelFileInput').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.sceneManager.importModel(file, (success, model) => {
                            if (success) {
                                this.sceneManager.selectObject(model);
                                this.updateHierarchy();
                                this.updateProperties();
                                this.showNotification('Model imported successfully', 'success');
                            } else {
                                this.showNotification('Failed to import model', 'error');
                            }
                        });
                    }
                });
                
                // Delete object button
                document.getElementById('deleteObject').addEventListener('click', () => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        this.sceneManager.removeObject(selectedObject);
                        this.updateHierarchy();
                        this.updateProperties();
                    }
                });
                
                // Property inputs
                document.getElementById('propName').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.name = e.target.value;
                        this.updateHierarchy();
                    }
                });
                
                document.getElementById('propPosX').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.position.x = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propPosY').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.position.y = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propPosZ').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.position.z = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propRotX').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.rotation.x = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propRotY').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.rotation.y = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propRotZ').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.rotation.z = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propScaleX').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.scale.x = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propScaleY').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.scale.y = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propScaleZ').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        selectedObject.scale.z = parseFloat(e.target.value);
                    }
                });
                
                document.getElementById('propColor').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject && selectedObject.material) {
                        selectedObject.material.color.set(e.target.value);
                    }
                });
                
                // Physics properties
                document.getElementById('physicsEnabled').addEventListener('change', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        const uuid = selectedObject.uuid;
                        const properties = this.sceneManager.getObjectProperties(uuid);
                        properties.physicsEnabled = e.target.checked;
                        this.sceneManager.setObjectProperties(uuid, properties);
                        
                        if (e.target.checked) {
                            this.physicsManager.addObject(selectedObject, properties);
                        } else {
                            this.physicsManager.removeObject(selectedObject);
                        }
                        
                        document.getElementById('physicsProperties').classList.toggle('active', e.target.checked);
                    }
                });
                
                document.getElementById('propMass').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        const uuid = selectedObject.uuid;
                        const properties = this.sceneManager.getObjectProperties(uuid);
                        properties.mass = parseFloat(e.target.value);
                        this.sceneManager.setObjectProperties(uuid, properties);
                        this.physicsManager.updateObjectProperties(selectedObject, properties);
                    }
                });
                
                document.getElementById('propFriction').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        const uuid = selectedObject.uuid;
                        const properties = this.sceneManager.getObjectProperties(uuid);
                        properties.friction = parseFloat(e.target.value);
                        this.sceneManager.setObjectProperties(uuid, properties);
                        this.physicsManager.updateObjectProperties(selectedObject, properties);
                    }
                });
                
                document.getElementById('propRestitution').addEventListener('input', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        const uuid = selectedObject.uuid;
                        const properties = this.sceneManager.getObjectProperties(uuid);
                        properties.restitution = parseFloat(e.target.value);
                        this.sceneManager.setObjectProperties(uuid, properties);
                        this.physicsManager.updateObjectProperties(selectedObject, properties);
                    }
                });
                
                document.getElementById('propStatic').addEventListener('change', (e) => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject) {
                        const uuid = selectedObject.uuid;
                        const properties = this.sceneManager.getObjectProperties(uuid);
                        properties.isStatic = e.target.checked;
                        this.sceneManager.setObjectProperties(uuid, properties);
                        this.physicsManager.updateObjectProperties(selectedObject, properties);
                    }
                });
                
                // Animation controls
                document.getElementById('playBtn').addEventListener('click', () => {
                    this.animationManager.play();
                });
                
                document.getElementById('pauseBtn').addEventListener('click', () => {
                    this.animationManager.pause();
                });
                
                document.getElementById('stopBtn').addEventListener('click', () => {
                    this.animationManager.stop();
                });
                
                document.getElementById('addKeyframeBtn').addEventListener('click', () => {
                    const selectedObject = this.sceneManager.getSelectedObject();
                    if (selectedObject && this.animationManager.getSelectedAnimation()) {
                        const time = this.animationManager.currentTime;
                        const properties = {
                            position: [
                                selectedObject.position.x,
                                selectedObject.position.y,
                                selectedObject.position.z
                            ],
                            rotation: [
                                selectedObject.rotation.x,
                                selectedObject.rotation.y,
                                selectedObject.rotation.z
                            ],
                            scale: [
                                selectedObject.scale.x,
                                selectedObject.scale.y,
                                selectedObject.scale.z
                            ]
                        };
                        
                        if (selectedObject.material) {
                            properties.color = selectedObject.material.color.getHex();
                        }
                        
                        this.animationManager.addKeyframe(selectedObject, time, properties);
                        this.updateTimeline();
                    }
                });
                
                // Animation creation
                document.getElementById('addAnimation').addEventListener('click', () => {
                    document.getElementById('animationModal').style.display = 'flex';
                });
                
                document.getElementById('cancelAnimation').addEventListener('click', () => {
                    document.getElementById('animationModal').style.display = 'none';
                });
                
                document.getElementById('createAnimation').addEventListener('click', () => {
                    const name = document.getElementById('animationName').value;
                    const duration = parseFloat(document.getElementById('animationDuration').value);
                    const loop = document.getElementById('animationLoop').value;
                    
                    if (name && duration > 0) {
                        this.animationManager.createAnimation(name, duration, loop);
                        this.updateAnimations();
                        this.updateTimeline();
                        document.getElementById('animationModal').style.display = 'none';
                    }
                });
                
                // Animation deletion
                document.getElementById('deleteAnimation').addEventListener('click', () => {
                    if (this.animationManager.getSelectedAnimation()) {
                        const name = this.animationManager.getSelectedAnimation().name;
                        this.animationManager.deleteAnimation(name);
                        this.updateAnimations();
                        this.updateTimeline();
                    }
                });
                
                // Animation duplication
                document.getElementById('duplicateAnimation').addEventListener('click', () => {
                    if (this.animationManager.getSelectedAnimation()) {
                        const name = this.animationManager.getSelectedAnimation().name;
                        const newName = `${name}_copy`;
                        this.animationManager.duplicateAnimation(name, newName);
                        this.updateAnimations();
                        this.updateTimeline();
                    }
                });
                
                // Curve editing
                document.getElementById('editCurve').addEventListener('click', () => {
                    document.getElementById('curveModal').style.display = 'flex';
                });
                
                document.getElementById('cancelCurve').addEventListener('click', () => {
                    document.getElementById('curveModal').style.display = 'none';
                });
                
                document.getElementById('saveCurve').addEventListener('click', () => {
                    // Save curve logic would go here
                    document.getElementById('curveModal').style.display = 'none';
                });
                
                // Tab switching in curve editor
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabName = tab.dataset.tab;
                        
                        // Update active tab
                        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        
                        // Update active tab content
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        document.getElementById(`${tabName}-tab`).classList.add('active');
                    });
                });
                
                // Physics toggle
                document.getElementById('physicsToggleBtn').addEventListener('click', () => {
                    const enabled = this.physicsManager.toggle();
                    document.getElementById('physicsToggleBtn').textContent = `Physics: ${enabled ? 'On' : 'Off'}`;
                });
                
                // Export/Import
                document.getElementById('exportScene').addEventListener('click', () => {
                    const sceneData = this.sceneManager.exportScene();
                    const blob = new Blob([sceneData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'scene.json';
                    a.click();
                    URL.revokeObjectURL(url);
                });
                
                document.getElementById('importScene').addEventListener('click', () => {
                    document.getElementById('fileInput').click();
                });
                
                document.getElementById('fileInput').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const success = this.sceneManager.importScene(event.target.result);
                            if (success) {
                                this.updateHierarchy();
                                this.updateProperties();
                                this.showNotification('Scene imported successfully', 'success');
                            } else {
                                this.showNotification('Failed to import scene', 'error');
                            }
                        };
                        reader.readAsText(file);
                    }
                });
                
                document.getElementById('exportAnimation').addEventListener('click', () => {
                    if (this.animationManager.getSelectedAnimation()) {
                        const name = this.animationManager.getSelectedAnimation().name;
                        const animationData = this.animationManager.exportAnimation(name);
                        if (animationData) {
                            const blob = new Blob([animationData], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${name}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }
                    }
                });
                
                document.getElementById('importAnimation').addEventListener('click', () => {
                    document.getElementById('fileInput').click();
                });
                
                // Context menu
                document.getElementById('contextMenu').addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    if (action) {
                        this.handleContextMenuAction(action);
                    }
                    document.getElementById('contextMenu').style.display = 'none';
                });
                
                // Hide context menu on click outside
                document.addEventListener('click', () => {
                    document.getElementById('contextMenu').style.display = 'none';
                });
            }

            toggleToolbox() {
                this.toolboxVisible = !this.toolboxVisible;
                document.body.classList.toggle('toolbox-hidden', !this.toolboxVisible);
            }

            showPanel(panelName) {
                // Hide all panels
                document.querySelectorAll('.tool-panel').forEach(panel => {
                    panel.classList.remove('active');
                });
                
                // Show selected panel
                const panel = document.getElementById(`${panelName}Panel`);
                if (panel) {
                    panel.classList.add('active');
                }
                
                // Update active nav item
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                const activeNavItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
                if (activeNavItem) {
                    activeNavItem.classList.add('active');
                }
                
                this.activePanel = panelName;
            }

            hidePanel(panelName) {
                const panel = document.getElementById(`${panelName}Panel`);
                if (panel) {
                    panel.classList.remove('active');
                }
                
                // Update active nav item
                const activeNavItem = document.querySelector(`.nav-item[data-panel="${panelName}"]`);
                if (activeNavItem) {
                    activeNavItem.classList.remove('active');
                }
            }

            updateHierarchy() {
                const hierarchy = document.getElementById('hierarchy');
                hierarchy.innerHTML = '';
                
                // Add objects to hierarchy
                this.sceneManager.getAllObjects().forEach(object => {
                    const item = document.createElement('div');
                    item.className = 'hierarchy-item';
                    
                    if (this.sceneManager.getSelectedObject() === object) {
                        item.classList.add('selected');
                    }
                    
                    // Add icon based on object type
                    const icon = document.createElement('span');
                    icon.className = 'icon';
                    
                    if (object.isLight) {
                        icon.innerHTML = '💡';
                    } else if (object.type === 'Group') {
                        icon.innerHTML = '📁';
                    } else if (object.isMesh) {
                        icon.innerHTML = '🔷';
                    } else {
                        icon.innerHTML = '📦';
                    }
                    
                    item.appendChild(icon);
                    
                    // Add name
                    const name = document.createElement('span');
                    name.textContent = object.name;
                    item.appendChild(name);
                    
                    // Add visibility toggle
                    const visibility = document.createElement('span');
                    visibility.className = 'object-visibility';
                    visibility.innerHTML = this.sceneManager.getObjectProperties(object.uuid).visible ? '👁️' : '🚫';
                    visibility.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const visible = this.sceneManager.toggleObjectVisibility(object);
                        visibility.innerHTML = visible ? '👁️' : '🚫';
                    });
                    item.appendChild(visibility);
                    
                    // Add lock toggle
                    const lock = document.createElement('span');
                    lock.className = 'object-locked';
                    if (this.sceneManager.getObjectProperties(object.uuid).locked) {
                        lock.classList.add('active');
                    }
                    lock.innerHTML = '🔒';
                    lock.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const locked = this.sceneManager.toggleObjectLock(object);
                        lock.classList.toggle('active', locked);
                    });
                    item.appendChild(lock);
                    
                    // Add click event to select object
                    item.addEventListener('click', () => {
                        this.sceneManager.selectObject(object);
                        this.updateHierarchy();
                        this.updateProperties();
                    });
                    
                    // Add context menu event
                    item.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.showContextMenu(e.clientX, e.clientY, object);
                    });
                    
                    hierarchy.appendChild(item);
                });
            }

            updateProperties() {
                const selectedObject = this.sceneManager.getSelectedObject();
                
                if (!selectedObject) {
                    // Clear properties
                    document.getElementById('propName').value = '';
                    document.getElementById('propPosX').value = '';
                    document.getElementById('propPosY').value = '';
                    document.getElementById('propPosZ').value = '';
                    document.getElementById('propRotX').value = '';
                    document.getElementById('propRotY').value = '';
                    document.getElementById('propRotZ').value = '';
                    document.getElementById('propScaleX').value = '';
                    document.getElementById('propScaleY').value = '';
                    document.getElementById('propScaleZ').value = '';
                    document.getElementById('propColor').value = '#4fc3f7';
                    
                    // Disable physics properties
                    document.getElementById('physicsEnabled').checked = false;
                    document.getElementById('physicsProperties').classList.remove('active');
                    
                    return;
                }
                
                // Update properties
                document.getElementById('propName').value = selectedObject.name || '';
                document.getElementById('propPosX').value = selectedObject.position.x.toFixed(2);
                document.getElementById('propPosY').value = selectedObject.position.y.toFixed(2);
                document.getElementById('propPosZ').value = selectedObject.position.z.toFixed(2);
                document.getElementById('propRotX').value = selectedObject.rotation.x.toFixed(2);
                document.getElementById('propRotY').value = selectedObject.rotation.y.toFixed(2);
                document.getElementById('propRotZ').value = selectedObject.rotation.z.toFixed(2);
                document.getElementById('propScaleX').value = selectedObject.scale.x.toFixed(2);
                document.getElementById('propScaleY').value = selectedObject.scale.y.toFixed(2);
                document.getElementById('propScaleZ').value = selectedObject.scale.z.toFixed(2);
                
                // Update color if available
                if (selectedObject.material && selectedObject.material.color) {
                    const color = '#' + selectedObject.material.color.getHexString();
                    document.getElementById('propColor').value = color;
                }
                
                // Update physics properties
                const properties = this.sceneManager.getObjectProperties(selectedObject.uuid);
                document.getElementById('physicsEnabled').checked = properties.physicsEnabled || false;
                document.getElementById('physicsProperties').classList.toggle('active', properties.physicsEnabled);
                
                document.getElementById('propMass').value = properties.mass || 1;
                document.getElementById('propFriction').value = properties.friction || 0.5;
                document.getElementById('propRestitution').value = properties.restitution || 0.3;
                document.getElementById('propStatic').checked = properties.isStatic || false;
            }

            updateAnimations() {
                const animations = document.getElementById('animations');
                animations.innerHTML = '';
                
                this.animationManager.getAllAnimations().forEach(animation => {
                    const item = document.createElement('div');
                    item.className = 'animation-item';
                    
                    if (this.animationManager.getSelectedAnimation() === animation) {
                        item.classList.add('selected');
                    }
                    
                    // Add name
                    const name = document.createElement('span');
                    name.textContent = animation.name;
                    item.appendChild(name);
                    
                    // Add buttons
                    const buttons = document.createElement('div');
                    buttons.className = 'animation-item-buttons';
                    
                    const selectBtn = document.createElement('button');
                    selectBtn.className = 'button secondary';
                    selectBtn.textContent = 'Select';
                    selectBtn.addEventListener('click', () => {
                        this.animationManager.selectAnimation(animation.name);
                        this.updateAnimations();
                        this.updateTimeline();
                    });
                    buttons.appendChild(selectBtn);
                    
                    item.appendChild(buttons);
                    
                    animations.appendChild(item);
                });
            }

            updateTimeline() {
                const timelineTracks = document.getElementById('timelineTracks');
                timelineTracks.innerHTML = '';
                
                if (!this.animationManager.getSelectedAnimation()) {
                    return;
                }
                
                const animation = this.animationManager.getSelectedAnimation();
                
                // Add tracks for each object with keyframes
                animation.keyframes.forEach((keyframes, uuid) => {
                    const object = this.sceneManager.getObjectByUUID(uuid);
                    if (!object) return;
                    
                    const track = document.createElement('div');
                    track.className = 'timeline-track';
                    
                    // Add track header
                    const header = document.createElement('div');
                    header.className = 'timeline-track-header';
                    header.textContent = object.name;
                    track.appendChild(header);
                    
                    // Add track content
                    const content = document.createElement('div');
                    content.className = 'timeline-track-content';
                    
                    // Add keyframes
                    keyframes.forEach(keyframe => {
                        const keyframeElement = document.createElement('div');
                        keyframeElement.className = 'timeline-keyframe';
                        keyframeElement.style.left = `${(keyframe.time / animation.duration) * 100}%`;
                        
                        keyframeElement.addEventListener('click', () => {
                            this.animationManager.setCurrentTime(keyframe.time);
                            this.updateTimelinePlayhead();
                        });
                        
                        content.appendChild(keyframeElement);
                    });
                    
                    track.appendChild(content);
                    timelineTracks.appendChild(track);
                });
                
                // Update playhead position
                this.updateTimelinePlayhead();
            }

            updateTimelinePlayhead() {
                const playhead = document.getElementById('timelinePlayhead');
                const animation = this.animationManager.getSelectedAnimation();
                
                if (animation) {
                    const position = (this.animationManager.currentTime / animation.duration) * 100;
                    playhead.style.left = `${position}%`;
                } else {
                    playhead.style.left = '0%';
                }
                
                // Update time display
                document.getElementById('timelineTime').textContent = `${this.animationManager.currentTime.toFixed(2)}s`;
            }

            updateToolboxToggle() {
                const toggle = document.getElementById('toolboxToggle');
                toggle.innerHTML = this.toolboxVisible ? 
                    '<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>' :
                    '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>';
            }

            showContextMenu(x, y, object) {
                const contextMenu = document.getElementById('contextMenu');
                contextMenu.style.left = `${x}px`;
                contextMenu.style.top = `${y}px`;
                contextMenu.style.display = 'block';
                
                // Store the object for context menu actions
                this.contextMenuObject = object;
            }

            handleContextMenuAction(action) {
                if (!this.contextMenuObject) return;
                
                switch (action) {
                    case 'rename':
                        const newName = prompt('Enter new name:', this.contextMenuObject.name);
                        if (newName) {
                            this.contextMenuObject.name = newName;
                            this.updateHierarchy();
                        }
                        break;
                    case 'duplicate':
                        // Clone the object
                        const clone = this.contextMenuObject.clone();
                        this.sceneManager.addObject(clone, `${this.contextMenuObject.name}_copy`);
                        this.updateHierarchy();
                        break;
                    case 'delete':
                        this.sceneManager.removeObject(this.contextMenuObject);
                        this.updateHierarchy();
                        this.updateProperties();
                        break;
                    case 'toggleVisibility':
                        this.sceneManager.toggleObjectVisibility(this.contextMenuObject);
                        this.updateHierarchy();
                        break;
                    case 'toggleLock':
                        this.sceneManager.toggleObjectLock(this.contextMenuObject);
                        this.updateHierarchy();
                        break;
                }
            }

            showNotification(message, type = 'info') {
                const notification = document.getElementById('notification');
                notification.textContent = message;
                notification.className = `notification ${type}`;
                notification.classList.add('show');
                
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            }

            update() {
                // Update timeline playhead
                this.updateTimelinePlayhead();
            }
        }

        /**
         * Media Manager - Handles audio and media operations
         */
        class MediaManager {
            constructor(sceneManager, animationManager) {
                this.sceneManager = sceneManager;
                this.animationManager = animationManager;
                this.audioContext = null;
                this.backgroundMusic = null;
                this.soundEffects = [];
                this.voiceOver = null;
                this.mediaRecorder = null;
                this.recordedChunks = [];
            }

            init() {
                // Set up event listeners for media controls
                this.setupEventListeners();
                
                // Initialize audio context
                try {
                    window.AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.audioContext = new AudioContext();
                } catch (e) {
                    console.error('Web Audio API is not supported in this browser');
                }
            }

            setupEventListeners() {
                // Background music
                document.getElementById('selectBgMusic').addEventListener('click', () => {
                    document.getElementById('bgMusicFile').click();
                });
                
                document.getElementById('bgMusicFile').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.loadBackgroundMusic(file);
                    }
                });
                
                // Sound effects
                document.getElementById('selectSfx').addEventListener('click', () => {
                    document.getElementById('sfxFile').click();
                });
                
                document.getElementById('sfxFile').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.loadSoundEffect(file);
                    }
                });
                
                // Voice over
                document.getElementById('selectVoice').addEventListener('click', () => {
                    document.getElementById('voiceFile').click();
                });
                
                document.getElementById('voiceFile').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.loadVoiceOver(file);
                    }
                });
                
                // Voice recording
                document.getElementById('recordVoice').addEventListener('click', () => {
                    this.startRecording();
                });
                
                document.getElementById('stopRecordVoice').addEventListener('click', () => {
                    this.stopRecording();
                });
                
                // Scene transitions
                document.querySelectorAll('[data-transition]').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        const transition = e.target.dataset.transition;
                        this.applySceneTransition(transition);
                    });
                });
            }

            loadBackgroundMusic(file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (this.audioContext) {
                        this.audioContext.decodeAudioData(e.target.result, (buffer) => {
                            this.backgroundMusic = buffer;
                            document.getElementById('bgMusicInput').value = file.name;
                        }, (error) => {
                            console.error('Error decoding audio data:', error);
                        });
                    }
                };
                reader.readAsArrayBuffer(file);
            }

            loadSoundEffect(file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (this.audioContext) {
                        this.audioContext.decodeAudioData(e.target.result, (buffer) => {
                            this.soundEffects.push({
                                name: file.name,
                                buffer: buffer
                            });
                            document.getElementById('sfxInput').value = file.name;
                        }, (error) => {
                            console.error('Error decoding audio data:', error);
                        });
                    }
                };
                reader.readAsArrayBuffer(file);
            }

            loadVoiceOver(file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (this.audioContext) {
                        this.audioContext.decodeAudioData(e.target.result, (buffer) => {
                            this.voiceOver = buffer;
                            document.getElementById('voiceInput').value = file.name;
                        }, (error) => {
                            console.error('Error decoding audio data:', error);
                        });
                    }
                };
                reader.readAsArrayBuffer(file);
            }

            playBackgroundMusic() {
                if (this.backgroundMusic && this.audioContext) {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = this.backgroundMusic;
                    source.connect(this.audioContext.destination);
                    source.start();
                }
            }

            playSoundEffect(index) {
                if (this.soundEffects[index] && this.audioContext) {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = this.soundEffects[index].buffer;
                    source.connect(this.audioContext.destination);
                    source.start();
                }
            }

            playVoiceOver() {
                if (this.voiceOver && this.audioContext) {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = this.voiceOver;
                    source.connect(this.audioContext.destination);
                    source.start();
                }
            }

            // Play any loaded audio into both speakers and a capture stream,
            // returning an audio track to mix into a video recording (or null).
            startAudioForRecording() {
                if (!this.audioContext || (!this.backgroundMusic && !this.voiceOver)) return null;
                const dest = this.audioContext.createMediaStreamDestination();
                const play = (buffer) => {
                    if (!buffer) return;
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    source.connect(dest);
                    source.start();
                };
                play(this.backgroundMusic);
                play(this.voiceOver);
                return dest.stream.getAudioTracks()[0] || null;
            }

            startRecording() {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.error('MediaDevices API is not supported in this browser');
                    return;
                }
                
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        this.mediaRecorder = new MediaRecorder(stream);
                        this.recordedChunks = [];
                        
                        this.mediaRecorder.ondataavailable = (event) => {
                            if (event.data.size > 0) {
                                this.recordedChunks.push(event.data);
                            }
                        };
                        
                        this.mediaRecorder.onstop = () => {
                            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                            const url = URL.createObjectURL(blob);
                            
                            // Load the recorded audio as voice over
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                if (this.audioContext) {
                                    this.audioContext.decodeAudioData(e.target.result, (buffer) => {
                                        this.voiceOver = buffer;
                                        document.getElementById('voiceInput').value = 'Recorded Voice';
                                    }, (error) => {
                                        console.error('Error decoding audio data:', error);
                                    });
                                }
                            };
                            reader.readAsArrayBuffer(blob);
                        };
                        
                        this.mediaRecorder.start();
                    })
                    .catch(error => {
                        console.error('Error accessing microphone:', error);
                    });
            }

            stopRecording() {
                if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
            }

            /**
             * Scene transitions are rendered, not overlaid on the page.
             *
             * This used to build an absolutely-positioned <div> over the
             * viewport and animate it with CSS, so a transition was visible
             * on screen and invisible in every single export -- it is not
             * part of the canvas. The 2D compiler builds fade and crossfade as
             * ordinary alpha tracks, which is why they survive a render; the
             * 3D path will take the same route.
             */
            applySceneTransition(transition) {
                this.showNotification(
                    `"${transition}" transitions are not rendered yet, so they would be `
                    + 'invisible in an export. Use a fade keyframed on the objects instead.',
                    'info');
            }

            update() {
                // Update media-related operations
            }
        }

        /**
         * Download a Blob as a named file (shared helper).
         */
        function downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        /**
         * Read a Blob as a base64 data URL (used to ship recordings over the MCP bridge).
         */
        function blobToDataUrl(blob) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }

        // ---- Pure, dependency-free utilities (also exported for unit testing) ----

        // Decode a base64 data URL (e.g. canvas.toDataURL) into raw bytes.
        function dataURLToBytes(dataURL) {
            const bin = atob(dataURL.split(',')[1]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        }

        // Evaluate a CSS-style cubic-bezier easing curve, returning eased y for
        // linear progress t in [0,1]. Control points (x1,y1)/(x2,y2); ends at 0..1.
        function cubicBezierEase(x1, y1, x2, y2, t) {
            if (t <= 0) return 0;
            if (t >= 1) return 1;
            const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
            const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
            const fx = (u) => ((ax * u + bx) * u + cx) * u;
            const dfx = (u) => (3 * ax * u + 2 * bx) * u + cx;
            let u = t;
            for (let i = 0; i < 8; i++) {
                const x = fx(u) - t;
                if (Math.abs(x) < 1e-6) break;
                const d = dfx(u);
                if (Math.abs(d) < 1e-6) break;
                u -= x / d;
            }
            u = Math.max(0, Math.min(1, u));
            return ((ay * u + by) * u + cy) * u;
        }

        // Densify keyframes into a dense linear track honouring per-key interpolation
        // ('bezier' with handles / 'step' / linear). keys: [{time, value:[...], interp, handles}].
        function sampleChannel(keys, fps = 30) {
            const stride = keys[0].value.length;
            const times = [], values = [];
            for (let i = 0; i < keys.length - 1; i++) {
                const a = keys[i], b = keys[i + 1];
                const bezier = a.interp === 'bezier';
                const step = a.interp === 'step';
                const segDur = b.time - a.time;
                const steps = bezier ? Math.max(2, Math.round(segDur * fps)) : 1;
                for (let s = 0; s < steps; s++) {
                    const tt = s / steps;
                    let e = step ? 0 : tt;
                    if (bezier) {
                        const h = a.handles || [0.42, 0, 0.58, 1];
                        e = cubicBezierEase(h[0], h[1], h[2], h[3], tt);
                    }
                    times.push(a.time + tt * segDur);
                    for (let k = 0; k < stride; k++) values.push(a.value[k] + (b.value[k] - a.value[k]) * e);
                }
                // Hold a stepped value until just before the next key, then jump.
                if (step) {
                    times.push(b.time - 1e-4);
                    for (let k = 0; k < stride; k++) values.push(a.value[k]);
                }
            }
            const last = keys[keys.length - 1];
            times.push(last.time);
            for (let k = 0; k < stride; k++) values.push(last.value[k]);
            return { times, values };
        }

        // GIF LZW compressor. `indices` are 8-bit palette indices; returns a byte array.
        function lzwEncode(minCodeSize, indices) {
            const clearCode = 1 << minCodeSize;
            const eoiCode = clearCode + 1;
            let codeSize = minCodeSize + 1;
            let dict, dictSize;
            const initDict = () => {
                dict = new Map();
                for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);
                dictSize = eoiCode + 1;
            };
            initDict();

            const bytes = [];
            let cur = 0, curBits = 0;
            const write = (code) => {
                cur |= code << curBits;
                curBits += codeSize;
                while (curBits >= 8) { bytes.push(cur & 0xff); cur >>= 8; curBits -= 8; }
            };

            write(clearCode);
            let w = String.fromCharCode(indices[0]);
            for (let i = 1; i < indices.length; i++) {
                const c = String.fromCharCode(indices[i]);
                if (dict.has(w + c)) {
                    w += c;
                } else {
                    write(dict.get(w));
                    dict.set(w + c, dictSize++);
                    if (dictSize > (1 << codeSize) && codeSize < 12) codeSize++;
                    if (dictSize > 4096) { write(clearCode); initDict(); codeSize = minCodeSize + 1; }
                    w = c;
                }
            }
            write(dict.get(w));
            write(eoiCode);
            if (curBits > 0) bytes.push(cur & 0xff);
            return bytes;
        }

        // Encode RGBA frames to an animated GIF89a (256-colour 3-3-2 palette). No deps.
        /**
         * Streaming GIF writer: one frame in, its compressed bytes kept, the
         * pixels dropped.
         *
         * The batch encoder needed every frame's raw RGBA alive at once -- at
         * 480x270 that is 518KB a frame, so a two-minute GIF wanted 622MB
         * before encoding even started. Nothing here needs that: the palette
         * is a fixed 3-3-2 cube, so quantizing is stateless per pixel and a
         * frame can be compressed the moment it is drawn. Memory becomes the
         * size of the GIF you were producing anyway.
         */
        function createGifStream(width, height, delayMs = 100) {
            const parts = [];
            const head = [];
            const short = (out, v) => out.push(v & 0xff, (v >> 8) & 0xff);
            const str = (out, t) => { for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i)); };

            str(head, 'GIF89a');
            short(head, width); short(head, height);
            head.push(0xF7, 0, 0); // global colour table, 256 entries, 8 bits/pixel
            for (let i = 0; i < 256; i++) {
                head.push(
                    Math.round(((i >> 5) & 7) * 255 / 7),
                    Math.round(((i >> 2) & 7) * 255 / 7),
                    Math.round((i & 3) * 255 / 3)
                );
            }
            head.push(0x21, 0xFF, 11); str(head, 'NETSCAPE2.0'); head.push(3, 1, 0, 0, 0); // loop forever
            parts.push(Uint8Array.from(head));

            const delay = Math.round(delayMs / 10); // centiseconds
            let count = 0;

            return {
                get frameCount() { return count; },
                addFrame(rgba) {
                    const out = [];
                    out.push(0x21, 0xF9, 4, 0, delay & 0xff, (delay >> 8) & 0xff, 0, 0);
                    out.push(0x2C); short(out, 0); short(out, 0);
                    short(out, width); short(out, height); out.push(0);

                    const indices = new Uint8Array(width * height);
                    for (let p = 0; p < indices.length; p++) {
                        const r = rgba[p * 4], g = rgba[p * 4 + 1], b = rgba[p * 4 + 2];
                        indices[p] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
                    }
                    const data = lzwEncode(8, indices);
                    out.push(8); // LZW minimum code size
                    for (let i = 0; i < data.length; i += 255) {
                        const chunk = data.slice(i, i + 255);   // lzwEncode returns a plain array
                        out.push(chunk.length);
                        for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
                    }
                    out.push(0); // block terminator
                    parts.push(Uint8Array.from(out));
                    count++;
                    return this;
                },
                finish() {
                    parts.push(Uint8Array.from([0x3B])); // trailer
                    const total = parts.reduce((n, part) => n + part.length, 0);
                    const gif = new Uint8Array(total);
                    let at = 0;
                    for (const part of parts) { gif.set(part, at); at += part.length; }
                    parts.length = 0;
                    return gif;
                },
            };
        }

        /** Batch form, kept because it is the documented utility and is tested. */
        function encodeGIF(frames, width, height, delayMs = 100) {
            const gif = createGifStream(width, height, delayMs);
            for (const rgba of frames) gif.addFrame(rgba);
            return gif.finish();
        }

        const CRC_TABLE = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                t[n] = c >>> 0;
            }
            return t;
        })();
        function crc32(bytes) {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        }

        // Build a ZIP archive (STORE / no compression) from [{name, data:Uint8Array}]. No deps.
        function buildZip(files) {
            const chunks = [];
            const central = [];
            let offset = 0;
            const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
            const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

            for (const file of files) {
                const nameBytes = Array.from(new TextEncoder().encode(file.name));
                const data = file.data;
                const crc = crc32(data);
                const local = [
                    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                    ...u32(crc), ...u32(data.length), ...u32(data.length),
                    ...u16(nameBytes.length), ...u16(0), ...nameBytes,
                ];
                chunks.push(new Uint8Array(local), data);
                central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
                    ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length),
                    ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                    ...u32(0), ...u32(offset), ...nameBytes);
                offset += local.length + data.length;
            }
            const centralBytes = new Uint8Array(central);
            const eocd = new Uint8Array([
                ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
                ...u32(centralBytes.length), ...u32(offset), ...u16(0),
            ]);
            chunks.push(centralBytes, eocd);

            const total = chunks.reduce((n, c) => n + c.length, 0);
            const result = new Uint8Array(total);
            let pos = 0;
            for (const c of chunks) { result.set(c, pos); pos += c.length; }
            return result;
        }

        // Loop-subdivide a triangle-soup position array (each tri -> 4 tris). Returns Array.
        function subdivideGeometry(positions) {
            const out = [];
            const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            const tri = (a, b, c) => out.push(...a, ...b, ...c);
            for (let i = 0; i < positions.length; i += 9) {
                const a = [positions[i], positions[i + 1], positions[i + 2]];
                const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
                const c = [positions[i + 6], positions[i + 7], positions[i + 8]];
                const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
                tri(a, ab, ca); tri(ab, b, bc); tri(ca, bc, c); tri(ab, bc, ca);
            }
            return out;
        }

        /**
         * History Manager - Snapshot-based undo/redo. A snapshot is a full project
         * object produced by engine.serializeProject() and restored via applyProject().
         */
        class HistoryManager {
            constructor(engine, limit = 30, budgetBytes = 64 * 1024 * 1024) {
                this.engine = engine;
                this.limit = limit;
                // Snapshots now carry real geometry, so 30 of a sculpted mesh
                // is a memory problem rather than a rounding error. Drop the
                // oldest until the stack fits; losing the far end of undo
                // beats running the tab out of memory.
                this.budgetBytes = budgetBytes;
                this.stack = [];     // JSON strings: measurable, and smaller than object graphs
                this.bytes = 0;
                this.index = -1;
                this.suspended = false; // true while restoring, so restores aren't recorded
                this.coalesceMs = 350;
                this.timer = null;
            }

            /**
             * Record a snapshot, coalescing bursts.
             *
             * Measured on a subdivided cube (9,216 vertices): 10ms to
             * serialize and 10ms more for the synchronous localStorage write.
             * That was paid once per committed gesture, so a run of sculpt
             * strokes stalled on every one, and a dense mesh scales it
             * linearly.
             *
             * A trailing timer collapses a burst into one snapshot. Undo
             * granularity becomes "a run of edits", which for sculpting is
             * what you want anyway, and anything that READS the history
             * flushes first so a pending snapshot is never missed.
             *
             * ponytail: coalescing, not diffing. Diffs would also remove the
             * cost of the edits that do land, but they need a diff format for
             * a Three JSON tree. Measure again before building one.
             */
            push() {
                if (this.suspended) return;
                if (this.timer !== null) return;      // one already queued
                this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.coalesceMs);
            }

            /** Take the snapshot now, if one is due. */
            flush() {
                if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
                if (this.suspended) return;
                for (const dropped of this.stack.slice(this.index + 1)) this.bytes -= dropped.length;
                this.stack = this.stack.slice(0, this.index + 1);

                const snapshot = JSON.stringify(this.engine.serializeProject());
                // Nothing actually changed: a timer that fired after a no-op
                // mutation should not cost an undo step.
                if (snapshot === this.stack[this.index]) return;

                this.stack.push(snapshot);
                this.bytes += snapshot.length;
                while (this.stack.length > 1
                    && (this.stack.length > this.limit || this.bytes > this.budgetBytes)) {
                    this.bytes -= this.stack.shift().length;
                }
                this.index = this.stack.length - 1;
                this.engine.autosave(snapshot);
            }

            _restore(snapshot) {
                this.suspended = true;
                this.engine.applyProject(JSON.parse(snapshot));
                this.suspended = false;
            }

            undo() {
                this.flush();
                if (this.index > 0) this._restore(this.stack[--this.index]);
            }

            redo() {
                this.flush();
                if (this.index < this.stack.length - 1) this._restore(this.stack[++this.index]);
            }
        }

        /**
         * Rig Manager - Skeleton display, bone posing/keyframing, 2+ bone CCD
         * inverse kinematics, and morph-target (shape key) control for imported
         * rigged (GLTF) characters. Bones are registered as selectable objects so
         * the existing transform gizmo + keyframe pipeline pose them (FK).
         */
        class RigManager {
            constructor(sceneManager, animationManager) {
                this.sceneManager = sceneManager;
                this.animationManager = animationManager;
                this.bones = new Map();          // bone uuid -> Bone
                this.morphMeshes = new Map();    // mesh uuid -> Mesh with morph targets
                this.skeletonHelpers = new Map();// root uuid -> SkeletonHelper
            }

            // Register bones + morph meshes from a freshly imported model.
            extractRig(root) {
                if (!root || !root.traverse) return;
                root.traverse((node) => {
                    if (node.isBone) {
                        this.bones.set(node.uuid, node);
                        this.sceneManager.objects.set(node.uuid, node); // selectable + keyframeable
                        if (!this.sceneManager.objectProperties.has(node.uuid)) {
                            this.sceneManager.objectProperties.set(node.uuid,
                                { visible: true, locked: false, isBone: true });
                        }
                    }
                    if (node.isMesh && node.morphTargetInfluences && node.morphTargetInfluences.length) {
                        this.morphMeshes.set(node.uuid, node);
                    }
                });
                if (this.bones.size) this.showSkeleton(root, true);
            }

            showSkeleton(root, on) {
                const existing = this.skeletonHelpers.get(root.uuid);
                if (on && !existing) {
                    const helper = new THREE.SkeletonHelper(root);
                    this.sceneManager.scene.add(helper);
                    this.skeletonHelpers.set(root.uuid, helper);
                } else if (!on && existing) {
                    this.sceneManager.scene.remove(existing);
                    this.skeletonHelpers.delete(root.uuid);
                }
            }

            toggleSkeleton() {
                if (this.skeletonHelpers.size) {
                    this.skeletonHelpers.forEach(h => this.sceneManager.scene.remove(h));
                    this.skeletonHelpers.clear();
                    return false;
                }
                const roots = new Set();
                this.bones.forEach(b => {
                    let r = b;
                    while (r.parent && r.parent.isBone) r = r.parent;
                    roots.add(r.parent || r);
                });
                roots.forEach(r => this.showSkeleton(r, true));
                return true;
            }

            listBones() {
                return [...this.bones.values()].map(b => ({ uuid: b.uuid, name: b.name }));
            }

            listMorphMeshes() {
                return [...this.morphMeshes.values()].map(m => ({
                    uuid: m.uuid, name: m.name, morphs: Object.keys(m.morphTargetDictionary || {})
                }));
            }

            // Cyclic-Coordinate-Descent IK over a bone chain (root -> end effector).
            /**
             * The skinned mesh under a model root, which retargeting needs.
             */
            findSkinnedMesh(root) {
                let found = null;
                root.traverse?.((node) => { if (!found && node.isSkinnedMesh) found = node; });
                return found;
            }

            /**
             * Copy an animation from one rigged character onto another.
             *
             * This is the whole reason Mixamo is useful: one character, a
             * library of animations built for a different skeleton. Three's
             * SkeletonUtils does the maths -- rest-pose compensation and
             * per-bone remapping -- so the job here is finding the two skinned
             * meshes and supplying a name map.
             *
             * ponytail: stdlib. A hand-written retargeter is a bone-name map
             * plus two quaternion conversions that are easy to get subtly
             * wrong, and Three already ships a tested one.
             */
            retarget(sourceRootUuid, targetRootUuid, { clipName = null, names = null } = {}) {
                const utils = THREE.SkeletonUtils;
                if (!utils || !utils.retargetClip) throw new Error('SkeletonUtils is not loaded');

                const sourceRoot = this.sceneManager.getObjectByUUID(sourceRootUuid);
                const targetRoot = this.sceneManager.getObjectByUUID(targetRootUuid);
                if (!sourceRoot || !targetRoot) throw new Error('Unknown model root');

                const source = this.findSkinnedMesh(sourceRoot);
                const target = this.findSkinnedMesh(targetRoot);
                if (!source || !target) {
                    throw new Error('Both models need a skinned mesh; retargeting needs two skeletons');
                }

                const clips = this.sceneManager.importedClips.get(sourceRootUuid) || [];
                const clip = clipName ? clips.find((c) => c.name === clipName) : clips[0];
                if (!clip) throw new Error(`No clip "${clipName ?? '(first)'}" on that model`);

                // A Mixamo rig prefixes every bone with "mixamorig". Stripping
                // it is the whole mapping for most characters, so build it from
                // the bones actually present rather than shipping a fixed list
                // that goes stale.
                // SkeletonUtils keys `names` by the TARGET bone and yields the
                // SOURCE bone -- the opposite of the direction that reads
                // naturally -- and silently produces an empty clip if you get
                // it backwards.
                const map = names ?? this.boneNameMap(target, source);
                const retargeted = utils.retargetClip(target, source, clip, {
                    hip: this.guessHipBone(target),
                    names: map,
                });
                retargeted.name = `${clip.name || 'clip'} -> ${targetRoot.name}`;
                return retargeted;
            }

            /**
             * `{ targetBoneName: sourceBoneName }`, matched by normalising
             * both: drop a "mixamorig" prefix, separators and case.
             *
             * Built from the bones actually present rather than a fixed table,
             * which would go stale the first time a character used slightly
             * different names.
             */
            boneNameMap(target, source) {
                const normal = (n) => String(n)
                    .replace(/^mixamorig[:_]?/i, '')
                    .replace(/[\s_:.-]/g, '')
                    .toLowerCase();
                const sourceByNormal = new Map();
                for (const bone of source.skeleton.bones) sourceByNormal.set(normal(bone.name), bone.name);

                const names = {};
                for (const bone of target.skeleton.bones) {
                    const match = sourceByNormal.get(normal(bone.name));
                    if (match) names[bone.name] = match;
                }
                return names;
            }

            /** The root of the bone hierarchy, which retargeting treats specially. */
            guessHipBone(skinnedMesh) {
                const bones = skinnedMesh.skeleton.bones;
                const named = bones.find((b) => /hips?$/i.test(b.name.replace(/^mixamorig[:_]?/i, '')));
                if (named) return named.name;
                const root = bones.find((b) => !b.parent || !b.parent.isBone);
                return root ? root.name : (bones[0] && bones[0].name);
            }

            ikReach(boneUuids, target, iterations = 10) {
                const bones = (boneUuids || [])
                    .map(u => this.bones.get(u) || this.sceneManager.getObjectByUUID(u))
                    .filter(Boolean);
                if (bones.length < 2) throw new Error('IK needs at least 2 bones');
                const end = bones[bones.length - 1];
                const tgt = new THREE.Vector3(target[0], target[1], target[2]);
                for (let it = 0; it < iterations; it++) {
                    for (let i = bones.length - 2; i >= 0; i--) {
                        const bone = bones[i];
                        const bonePos = bone.getWorldPosition(new THREE.Vector3());
                        const endPos = end.getWorldPosition(new THREE.Vector3());
                        const toEnd = endPos.sub(bonePos).normalize();
                        const toTgt = tgt.clone().sub(bonePos).normalize();
                        const delta = new THREE.Quaternion().setFromUnitVectors(toEnd, toTgt);
                        const boneWorldQ = bone.getWorldQuaternion(new THREE.Quaternion());
                        const newWorldQ = delta.multiply(boneWorldQ);
                        const parentWorldQ = bone.parent
                            ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
                            : new THREE.Quaternion();
                        bone.quaternion.copy(parentWorldQ.invert().multiply(newWorldQ));
                        bone.updateMatrixWorld(true);
                    }
                }
                this.sceneManager.markChanged();
                return { end: end.getWorldPosition(new THREE.Vector3()).toArray() };
            }

            /**
             * Which morph target plays each viseme.
             *
             * The lipsync tiers already produce viseme NAMES and the evaluator
             * already writes `morph.<name>` channels; the only thing missing
             * for a 3D face was the mapping between the two. Built from the
             * morph targets a mesh actually has, because every character names
             * them differently.
             */
            visemeMorphMap(meshUuid) {
                const mesh = this.morphMeshes.get(meshUuid);
                if (!mesh || !mesh.morphTargetDictionary) return null;
                const have = Object.keys(mesh.morphTargetDictionary);
                const normal = (n) => n.toLowerCase().replace(/[^a-z]/g, '');
                const byNormal = new Map(have.map((n) => [normal(n), n]));
                const pick = (...candidates) => {
                    for (const c of candidates) {
                        const hit = byNormal.get(normal(c));
                        if (hit) return hit;
                    }
                    for (const c of candidates) {
                        const hit = have.find((n) => normal(n).includes(normal(c)));
                        if (hit) return hit;
                    }
                    return null;
                };
                // The six visemes the 2D path produces, against the names ARKit
                // and the common Mixamo/ReadyPlayerMe sets use.
                const map = {
                    closed: pick('viseme_sil', 'sil', 'mouthClose', 'closed'),
                    mid: pick('viseme_aa', 'aa', 'mouthOpen', 'jawOpen', 'mid'),
                    open: pick('viseme_O', 'jawOpen', 'mouthOpen', 'open'),
                    round: pick('viseme_U', 'ou', 'mouthPucker', 'round'),
                    wide: pick('viseme_I', 'ih', 'mouthSmile', 'wide'),
                    teeth: pick('viseme_FF', 'ff', 'mouthFunnel', 'teeth'),
                };
                return Object.fromEntries(Object.entries(map).filter(([, v]) => v));
            }

            /**
             * Key a lipsync viseme track onto a mesh's morph targets.
             *
             * `track` is a core discrete track of viseme names, exactly what
             * `lipsyncLine` returns for the 2D path -- so a face rigged with
             * morph targets is driven by the same lipsync the cutout mouths
             * use, rather than by a second implementation.
             */
            keyVisemes(meshUuid, track, { map = null, hold = 0.04 } = {}) {
                const mesh = this.morphMeshes.get(meshUuid);
                const visemes = map ?? this.visemeMorphMap(meshUuid);
                if (!mesh || !visemes || !track || !track.keys) return 0;
                const shapes = [...new Set(Object.values(visemes))];
                let written = 0;
                for (const key of track.keys) {
                    const active = visemes[key.v];
                    const morphs = {};
                    // Every shape is written at every key, not just the active
                    // one: a morph left at 1 by the previous viseme would stack.
                    for (const shape of shapes) morphs[shape] = shape === active ? 1 : 0;
                    // A touch before the key holds the previous shape, so the
                    // mouth snaps between visemes instead of sliding.
                    if (hold > 0 && key.t > hold) {
                        this.animationManager.addKeyframe(mesh, +(key.t - hold).toFixed(4),
                            { morphs: this._lastMorphs ?? morphs, interp: 'step' });
                    }
                    this.animationManager.addKeyframe(mesh, key.t, { morphs, interp: 'step' });
                    this._lastMorphs = morphs;
                    written++;
                }
                this._lastMorphs = null;
                return written;
            }

            setMorph(meshUuid, name, value) {
                const mesh = this.morphMeshes.get(meshUuid) || this.sceneManager.getObjectByUUID(meshUuid);
                if (!mesh || !mesh.morphTargetDictionary) throw new Error('No morph targets: ' + meshUuid);
                const idx = mesh.morphTargetDictionary[name];
                if (idx == null) throw new Error('No morph target: ' + name);
                mesh.morphTargetInfluences[idx] = value;
                this.sceneManager.markChanged();
                return { uuid: meshUuid, name, value };
            }
        }

        /**
         * Camera Manager - Multiple keyframeable cameras + an EffectComposer post-
         * processing chain (bloom). Rendering (viewport and exports) routes through
         * here so effects appear in recordings too.
         */
        class CameraManager {
            constructor(sceneManager) {
                this.sceneManager = sceneManager;
                this.cameras = new Map();     // uuid -> PerspectiveCamera
                this.active = null;
                this.composer = null;
                this.bloomPass = null;
                this.renderPass = null;
                this.fx = { bloom: false };
            }

            init() {
                const cam = this.sceneManager.camera;
                if (cam) { this.cameras.set(cam.uuid, cam); this.active = cam; }
                this.setupComposer();
            }

            setupComposer() {
                if (typeof THREE.EffectComposer === 'undefined' || !this.active) return;
                const renderer = this.sceneManager.renderer;
                this.composer = new THREE.EffectComposer(renderer);
                this.renderPass = new THREE.RenderPass(this.sceneManager.scene, this.active);
                this.composer.addPass(this.renderPass);
                if (THREE.UnrealBloomPass) {
                    const size = renderer.getSize(new THREE.Vector2());
                    this.bloomPass = new THREE.UnrealBloomPass(size, 0.6, 0.4, 0.85);
                    this.bloomPass.enabled = false;
                    this.composer.addPass(this.bloomPass);
                }
            }

            createCamera(name, opts = {}) {
                const el = this.sceneManager.renderer.domElement;
                const aspect = (el.clientWidth || 16) / (el.clientHeight || 9);
                const cam = new THREE.PerspectiveCamera(opts.fov || 50, aspect, opts.near || 0.1, opts.far || 1000);
                cam.name = name || `Camera_${this.cameras.size + 1}`;
                if (opts.position) cam.position.set(...opts.position);
                if (opts.target) cam.lookAt(new THREE.Vector3(...opts.target));
                this.sceneManager.scene.add(cam);
                this.cameras.set(cam.uuid, cam);
                this.sceneManager.objects.set(cam.uuid, cam); // selectable + keyframeable
                this.sceneManager.objectProperties.set(cam.uuid, { visible: true, locked: false, isCamera: true });
                this.sceneManager.markChanged();
                return cam;
            }

            listCameras() {
                return [...this.cameras.values()].map(c => ({
                    uuid: c.uuid, name: c.name, active: c === this.active
                }));
            }

            activateCamera(uuid) {
                const cam = this.cameras.get(uuid) || this.sceneManager.getObjectByUUID(uuid);
                if (!cam || !cam.isCamera) throw new Error('No camera: ' + uuid);
                this.active = cam;
                this.sceneManager.camera = cam;
                if (this.renderPass) this.renderPass.camera = cam;
                if (this.sceneManager.controls) this.sceneManager.controls.object = cam;
                this.sceneManager.markChanged();
                return { uuid };
            }

            setCameraProps(uuid, props = {}) {
                const cam = this.cameras.get(uuid) || this.sceneManager.getObjectByUUID(uuid);
                if (!cam || !cam.isCamera) throw new Error('No camera: ' + uuid);
                if (props.fov != null) cam.fov = props.fov;
                if (props.near != null) cam.near = props.near;
                if (props.far != null) cam.far = props.far;
                if (props.focalLength != null && cam.setFocalLength) cam.setFocalLength(props.focalLength);
                cam.updateProjectionMatrix();
                this.sceneManager.markChanged();
                return { uuid, fov: cam.fov };
            }

            setPostFX(fx = {}) {
                this.fx = { ...this.fx, ...fx };
                if (this.bloomPass) {
                    this.bloomPass.enabled = !!this.fx.bloom;
                    if (fx.bloomStrength != null) this.bloomPass.strength = fx.bloomStrength;
                    if (fx.bloomRadius != null) this.bloomPass.radius = fx.bloomRadius;
                    if (fx.bloomThreshold != null) this.bloomPass.threshold = fx.bloomThreshold;
                }
                this.sceneManager.markChanged();
                return this.fx;
            }

            fxActive() { return !!(this.bloomPass && this.bloomPass.enabled); }

            resize(w, h) { if (this.composer) this.composer.setSize(w, h); }

            render() {
                const sm = this.sceneManager;
                if (this.composer && this.fxActive()) this.composer.render();
                else sm.renderer.render(sm.scene, this.active || sm.camera);
            }
        }

        /**
         * Recording Manager - Records the viewport to a downloadable WebM video
         * using the native MediaRecorder + canvas.captureStream (no dependencies).
         */
        class RecordingManager {
            constructor(sceneManager, animationManager, mediaManager) {
                this.sceneManager = sceneManager;
                this.animationManager = animationManager;
                this.mediaManager = mediaManager;
                this.isRecording = false;
                this.recorder = null;
                this.chunks = [];
                this.lastRecording = null;
                this.autoStopTimer = null;
            }

            init() {
                this.setupEventListeners();
            }

            setupEventListeners() {
                const on = (id, fn) => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('click', fn);
                };
                on('startRecording', () => this.startRecording());
                on('stopRecording', () => this.stopRecording());
                on('pauseRecording', () => this.pauseRecording());
                on('resumeRecording', () => this.resumeRecording());
                on('exportVideo', () => this.exportAsVideo());
                on('exportGIF', () => this.exportAsGIF());
                on('exportSequence', () => this.exportAsImageSequence());
                on('exportData', () => this.exportAnimationData());
            }

            /**
             * Render the selected animation through the shared offline loop.
             *
             * Every export goes through here, so they all get the same
             * frame-stepped timing, the same physics stepping, and the same
             * guarantee that frame N is a pure function of N. The sink decides
             * what to do with each frame -- and, critically, is expected to
             * consume and release it.
             */
            async renderWithSink(sink, { fps = 24, width, height, signal = null,
                                         onProgress = null } = {}) {
                const anim = this.animationManager.getSelectedAnimation();
                if (!anim) { this.showNotification('No animation selected', 'info'); return null; }
                const timeline = this.animationManager.prepareActions();
                if (!timeline) throw new Error('The animation core has not loaded yet');

                const [render, three] = await Promise.all([
                    import(coreUrl('./src/render/OfflineRenderer.js')),
                    import(coreUrl('./src/backends/three3d/Three3DBackend.js')),
                ]);

                const gl = this.sceneManager.renderer.domElement;
                const w = Math.max(1, Math.round(width ?? gl.width));
                const h = Math.max(1, Math.round(height ?? gl.height));
                const backend = new three.Three3DBackend({ sceneManager: this.sceneManager });
                const resolve = (uuid) => this.sceneManager.getObjectByUUID(uuid);
                const poser = three.createThreePoser({
                    timeline, resolve, samplePose: this.animationManager.core.samplePose,
                });

                const previous = { width: gl.width, height: gl.height };
                backend.mount(gl, { width: w, height: h });
                try {
                    this.physicsManager?.resetSimulation();
                    return await render.renderOffline({
                        scene: null, timeline, backend, cameraId: null, poser,
                        fps, width: w, height: h, durationSec: anim.duration,
                        physics: this.physicsManager ?? null,
                        sink, signal, onProgress,
                    });
                } finally {
                    backend.resize(previous.width, previous.height);
                    this.animationManager.setCurrentTime(this.animationManager.currentTime);
                }
            }

            /**
             * Read a frame off the WebGL canvas as RGBA, into one reused
             * buffer. The scratch canvas is allocated once per export rather
             * than per frame, because an export is thousands of frames.
             */
            _frameReader(width, height) {
                const scratch = document.createElement('canvas');
                scratch.width = width;
                scratch.height = height;
                const ctx = scratch.getContext('2d', { willReadFrequently: true });
                return {
                    rgba(canvas) {
                        ctx.drawImage(canvas, 0, 0, width, height);
                        return ctx.getImageData(0, 0, width, height).data;
                    },
                    png(canvas) {
                        ctx.drawImage(canvas, 0, 0, width, height);
                        return dataURLToBytes(scratch.toDataURL('image/png'));
                    },
                };
            }

            async exportAsGIF({ fps = 10, maxWidth = 480 } = {}) {
                const gl = this.sceneManager.renderer.domElement;
                const scale = Math.min(1, maxWidth / gl.width);
                const w = Math.max(1, Math.round(gl.width * scale));
                const h = Math.max(1, Math.round(gl.height * scale));
                const read = this._frameReader(w, h);
                const gif = createGifStream(w, h, 1000 / fps);
                // The sink keeps COMPRESSED bytes and drops the pixels. The
                // old path held raw RGBA and PNG bytes for every frame --
                // about 15GB for two minutes at 1080p -- so a long export
                // could not finish at all.
                const out = await this.renderWithSink({
                    configure() {},
                    writeFrame(canvas) { gif.addFrame(read.rgba(canvas)); },
                    finish() { return new Blob([gif.finish()], { type: 'image/gif' }); },
                    abort() { gif.finish(); },
                }, { fps, width: w, height: h });
                if (!out) return null;
                downloadBlob(out, 'animation.gif');
                this.showNotification(`GIF exported (${gif.frameCount} frames)`, 'success');
                return out;
            }

            async exportAsImageSequence({ fps = 15, maxWidth = 1920 } = {}) {
                const gl = this.sceneManager.renderer.domElement;
                const scale = Math.min(1, maxWidth / gl.width);
                const w = Math.max(1, Math.round(gl.width * scale));
                const h = Math.max(1, Math.round(gl.height * scale));
                const read = this._frameReader(w, h);
                // A zip's central directory is written last, so the compressed
                // PNGs do have to be held. The raw RGBA does not, and the old
                // path held both.
                const files = [];
                const out = await this.renderWithSink({
                    configure() {},
                    writeFrame(canvas, n) {
                        files.push({ name: `frame_${String(n).padStart(4, '0')}.png`,
                                     data: read.png(canvas) });
                    },
                    finish() { return new Blob([buildZip(files)], { type: 'application/zip' }); },
                    abort() { files.length = 0; },
                }, { fps, width: w, height: h });
                if (!out) return null;
                downloadBlob(out, 'frames.zip');
                this.showNotification(`Image sequence exported (${files.length} frames)`, 'success');
                return out;
            }

            // Toggle the four control-button indicators; true = stopped (dim).
            setIndicators(start, stop, pause, resume) {
                const set = (id, stopped) => {
                    const el = document.getElementById(id);
                    const ind = el && el.querySelector('.recording-indicator');
                    if (ind) ind.classList.toggle('stopped', stopped);
                };
                set('startRecording', start);
                set('stopRecording', stop);
                set('pauseRecording', pause);
                set('resumeRecording', resume);
            }

            startRecording(autoPlay = true) {
                if (this.isRecording) return;
                const canvas = this.sceneManager.renderer.domElement;
                if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
                    this.showNotification('Video recording is not supported in this browser', 'error');
                    return;
                }

                const stream = canvas.captureStream(30);
                const audioTrack = this.mediaManager && this.mediaManager.startAudioForRecording
                    ? this.mediaManager.startAudioForRecording() : null;
                if (audioTrack) stream.addTrack(audioTrack);

                const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
                    .find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

                this.chunks = [];
                this.recorder = new MediaRecorder(stream, { mimeType: mime });
                this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
                this.recorder.onstop = () => {
                    this.lastRecording = new Blob(this.chunks, { type: 'video/webm' });
                    const btn = document.getElementById('exportVideo');
                    if (btn) btn.disabled = false;
                    this.showNotification('Recording ready — click "Export as Video" to download', 'success');
                    if (this._resolveRecording) {
                        const resolve = this._resolveRecording;
                        this._resolveRecording = null;
                        resolve(this.lastRecording);
                    }
                };
                this.recorder.start();
                this.isRecording = true;
                this.setIndicators(false, true, true, true);

                // Auto-play the selected animation from the start and stop when it ends.
                const anim = this.animationManager.getSelectedAnimation();
                if (autoPlay && anim) {
                    this.animationManager.setCurrentTime(0);
                    this.animationManager.play();
                    this.autoStopTimer = setTimeout(() => this.stopRecording(), anim.duration * 1000 + 200);
                }
            }

            stopRecording() {
                if (!this.isRecording) return;
                clearTimeout(this.autoStopTimer);
                if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
                this.isRecording = false;
                this.setIndicators(true, true, true, true);
            }

            pauseRecording() {
                if (this.recorder && this.recorder.state === 'recording') {
                    this.recorder.pause();
                    this.animationManager.pause();
                    this.setIndicators(false, true, false, true);
                }
            }

            resumeRecording() {
                if (this.recorder && this.recorder.state === 'paused') {
                    this.recorder.resume();
                    this.animationManager.play();
                    this.setIndicators(false, true, true, false);
                }
            }

            exportAsVideo() {
                if (!this.lastRecording) {
                    this.showNotification('Record an animation first', 'info');
                    return;
                }
                downloadBlob(this.lastRecording, 'animation.webm');
            }

            /**
             * Render the selected animation to WebM by stepping frames.
             *
             * The old path played the animation in real time into a
             * MediaRecorder fed by captureStream(30) and stopped it with a
             * wall-clock setTimeout, so it dropped frames under load and came
             * out the wrong length. This steps an explicit frame index through
             * the same OfflineRenderer the 2D films use: the content is
             * frame-exact, physics advances in fixed substeps, and the sink
             * paces to the wall clock so the file's duration is right.
             */
            async renderSelectedAnimation({ fps = 30, width, height, signal = null,
                                            onProgress = null } = {}) {
                const anim = this.animationManager.getSelectedAnimation();
                if (!anim) throw new Error('No animation selected');
                const timeline = this.animationManager.prepareActions();
                if (!timeline) throw new Error('The animation core has not loaded yet');

                const [render, sinks, three] = await Promise.all([
                    import(coreUrl('./src/render/OfflineRenderer.js')),
                    import(coreUrl('./src/render/sinks/MediaRecorderSink.js')),
                    import(coreUrl('./src/backends/three3d/Three3DBackend.js')),
                ]);

                const gl = this.sceneManager.renderer.domElement;
                const w = width ?? gl.width;
                const h = height ?? gl.height;
                const backend = new three.Three3DBackend({ sceneManager: this.sceneManager });
                const resolve = (uuid) => this.sceneManager.getObjectByUUID(uuid);
                const poser = three.createThreePoser({
                    timeline, resolve, samplePose: this.animationManager.core.samplePose,
                });

                backend.mount(gl, { width: w, height: h });
                try {
                    this.physicsManager?.resetSimulation();
                    return await render.renderOffline({
                        scene: null, timeline, backend, cameraId: null, poser,
                        fps, width: w, height: h, durationSec: anim.duration,
                        physics: this.physicsManager ?? null,
                        sink: new sinks.MediaRecorderSink(),
                        signal, onProgress,
                    });
                } finally {
                    // Put the viewport back the way the editor had it.
                    backend.resize(gl.width, gl.height);
                    this.animationManager.setCurrentTime(this.animationManager.currentTime);
                }
            }

            // Record the selected animation and resolve with the resulting WebM Blob.
            recordSelectedAnimation() {
                return this.renderSelectedAnimation();
            }

            // Export the selected animation's keyframe data as JSON.
            exportAnimationData() {
                const anim = this.animationManager.getSelectedAnimation();
                const json = anim && this.animationManager.exportAnimation(anim.name);
                if (!json) {
                    this.showNotification('No animation selected', 'info');
                    return;
                }
                downloadBlob(new Blob([json], { type: 'application/json' }), `${anim.name}.json`);
            }

            showNotification(message, type = 'info') {
                const notification = document.getElementById('notification');
                if (!notification) return;
                notification.textContent = message;
                notification.className = `notification ${type}`;
                notification.classList.add('show');
                setTimeout(() => notification.classList.remove('show'), 3000);
            }

            update() {}
        }

        // Auto-initialize only in a browser page that provides the #viewport host.
        // When imported in Node (no DOM) this is skipped, so the module can be
        // required for testing/tooling and used as an npm package.
        const animationEngine = (typeof document !== 'undefined' && document.getElementById('viewport'))
            ? new AnimationEngine('viewport')
            : null;

    return {AnimationEngine,
            SceneManager,
            AnimationManager,
            PhysicsManager,
            EditManager,
            UIManager,
            RecordingManager,
            MediaManager,
            HistoryManager,
            RigManager,
            CameraManager,
            animationEngine,
            // pure utilities (exposed for reuse and unit testing)
            utils: { encodeGIF, createGifStream, lzwEncode, buildZip, crc32, subdivideGeometry, dataURLToBytes, cubicBezierEase, sampleChannel, downloadBlob, blobToDataUrl }
        }
    }
    )
)

        