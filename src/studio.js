/**
 * jireX film studio: the browser-facing entry point.
 *
 * One call takes a declarative film to a finished video:
 *
 *   compile -> synthesize voices -> mix audio offline -> lipsync from the
 *   real samples -> render frames deterministically -> encode
 *
 * Ordering is not arbitrary. Audio is rendered before the first video frame
 * because lipsync needs actual samples: the envelope decides when a mouth
 * moves and the text decides what shape it makes.
 */
import { compileFilm } from './core/script/compile.js';
import { parseScreenplay, retimeToAudio } from './core/script/screenplay.js';
import { VoiceRegistry } from './core/voice/VoiceRegistry.js';
import { AssetRegistry, loadAssets, loadAudioAssets, pendingImageAssets } from './core/art/AssetRegistry.js';
import { UrlProvider } from './core/art/providers/UrlProvider.js';
import { FileProvider } from './core/art/providers/FileProvider.js';
import { MicProvider } from './core/voice/providers/MicProvider.js';
import { UploadProvider } from './core/voice/providers/UploadProvider.js';
import { TtsVitsProvider } from './core/voice/providers/TtsVitsProvider.js';
import { VoiceStudioProvider } from './core/voice/providers/VoiceStudioProvider.js';
import { TtsHttpProvider } from './core/voice/providers/TtsHttpProvider.js';
import { synthesizeDialogue } from './core/voice/synthesize.js';
import { renderMix, decodeAudio } from './audio/OfflineMixer.js';
import { audioBufferToWav } from './audio/wav.js';
import { Canvas2DBackend } from './backends/canvas2d/Canvas2DBackend.js';
import { attachPainters } from './backends/canvas2d/PaintPainter.js';
import { preparePhotos } from './backends/canvas2d/PhotoPainter.js';
import { loadKernels } from './kernels/index.js';
import { loadParallelKernels, parallelAvailable } from './kernels/parallel.js';
import { renderOffline, preflight } from './render/OfflineRenderer.js';
import { MediaRecorderSink } from './render/sinks/MediaRecorderSink.js';
import { WebCodecsSink } from './render/sinks/WebCodecsSink.js';
import { MemorySink } from './render/sinks/MemorySink.js';
import { PngSequenceSink } from './render/sinks/PngSequenceSink.js';
import { Mp4Muxer, mp4MuxerFactory } from './render/mux/Mp4Muxer.js';
import { applySwapSets } from './core/scene/swapSets.js';
import { trackValueAt } from './core/anim/Track.js';
import { CALIBRATION, calibrate, estimateFrameCost, worstSpan } from './core/script/budget.js';

const SAMPLE_RATE = 48000;

export class FilmStudio {
    constructor({ sampleRate = SAMPLE_RATE, muxerFactory = null, ttsModuleUrl, onLog = null,
                  parallel = null,
                  // A locally-running VoiceStudio, for cloned and designed
                  // voices. Absent by default; see 29-VOICE-STUDIO.md.
                  voiceStudioUrl = null, voiceStudioOptions = null } = {}) {
        /**
         * Whether to build a kernel worker pool for photo warps. `null`
         * means "yes in a browser, no in Node"; see `_attachPainters`.
         */
        this.parallel = parallel;
        /**
         * Per-unit frame costs for the budget model. Starts at the measured
         * defaults and is replaced by `render`'s own preflight, which times
         * the shot the estimate called heaviest. Stored, because the thing
         * being measured is the machine: once fitted here, every later
         * estimate in this browser is anchored rather than borrowed.
         */
        this.calibration = loadCalibration() ?? CALIBRATION;
        this.sampleRate = sampleRate;
        this.muxerFactory = muxerFactory;
        this.onLog = onLog;
        const decode = (input) => decodeAudio(input, sampleRate);

        this.voices = new VoiceRegistry();
        this.mic = new MicProvider({ decode, sampleRate });
        this.upload = new UploadProvider({ decode });
        this.tts = new TtsVitsProvider({
            decode, sampleRate,
            ...(ttsModuleUrl ? { moduleUrl: ttsModuleUrl } : {}),
            onProgress: (p) => this.log(`voice model: ${describeProgress(p)}`),
        });
        // A locally-running VoiceStudio, if one was configured. Registered
        // FIRST so a cloned voice wins, and entirely optional so the render
        // stays self-contained when it is absent -- `available()` returns
        // false and the ladder falls through to Piper. See 29-VOICE-STUDIO.md.
        if (voiceStudioUrl) {
            this.voiceStudio = new VoiceStudioProvider({
                baseUrl: voiceStudioUrl, decode, sampleRate,
                ...(voiceStudioOptions ?? {}),
            });
            this.voices.register(this.voiceStudio);
        }
        // Order is the fallback order: a film authored for TTS still renders
        // from uploaded or recorded takes if TTS cannot load.
        this.voices.register(this.tts);
        this.voices.register(this.upload);
        this.voices.register(this.mic);
        this.decode = decode;

        // Art providers, same seam as voices: a film does not care whether a
        // picture came from a URL or a file picker.
        this.art = new AssetRegistry();
        this.art.register(new FileProvider());
        this.art.register(new UrlProvider());
    }

    log(msg) { this.onLog?.(msg); }

    /** Register a remote/cloning TTS endpoint as an additional provider. */
    useRemoteTts({ endpoint, voices = [], headers, id = 'remote', label }) {
        this.voices.register(new TtsHttpProvider({
            endpoint, voices, headers, id, label, decode: this.decode,
        }));
        return this;
    }

    parseScript(text, opts) { return parseScreenplay(text, opts); }

    /**
     * Everything up to (but not including) pixels: compile, voice, mix,
     * lipsync. Separated from the render so a caller can preview, retime, or
     * inspect diagnostics before committing to a two-minute encode.
     */
    async prepare(film, { assets = null, audioBuffers = {}, onProgress = null,
                          retime = true, baseUrl = '' } = {}) {
        let working = film;
        const notes = [];

        /**
         * Load the film's declared images that the caller has not already
         * supplied.
         *
         * MERGE, not either-or. The first version skipped loading entirely
         * whenever `assets` was passed at all -- and `film.html` passes a map
         * it fills with uploads, which starts as `{}` and is therefore
         * always truthy. So every film opened in the authoring page declared
         * its images, validated clean and drew none of them, with no
         * diagnostic anywhere: the one place a caller supplies SOME assets is
         * exactly the place that needs the rest fetched.
         */
        const supplied = assets ?? {};
        const wanted = pendingImageAssets(film, supplied);
        let images = supplied;
        if (wanted.length) {
            const loaded = await loadAssets(film, {
                registry: this.art, baseUrl,
                onProgress: (p) => { this.log(`asset ${p.done}/${p.total}: ${p.id}`); onProgress?.(p); },
            });
            // The caller's own images win: an upload held as a File is fresher
            // than anything a URL would return.
            images = { ...loaded.assets, ...supplied };
            notes.push(...loaded.diagnostics);
        }

        // Music beds and sound effects. Declared since the first phase and
        // never fetched by anything, so a film could name a score, validate
        // clean and render silent.
        const sound = await loadAudioAssets(film, {
            baseUrl, decode: (b) => decodeAudio(b, this.sampleRate),
            onProgress: (p) => { this.log(`audio ${p.done}/${p.total}: ${p.id}`); onProgress?.(p); },
        });
        notes.push(...sound.diagnostics);
        const allBuffers = { ...sound.buffers, ...audioBuffers };

        // Pass 1: synthesize so real line durations are known.
        let first = compileFilm(working, { assets: images });
        if (!first.timeline) return { ...first, audio: null };

        const voiced = await synthesizeDialogue({
            lipsyncJobs: first.lipsyncJobs,
            registry: this.voices,
            buffers: { ...allBuffers },
            fps: first.meta.fps,
            sampleRate: this.sampleRate,
            onProgress: (p) => {
                this.log(`voicing ${p.done}/${p.total}: ${String(p.text ?? '').slice(0, 44)}`);
                onProgress?.({ stage: 'voice', ...p });
            },
        });
        notes.push(...voiced.diagnostics);

        // Pass 2: a shot shorter than its own dialogue would cut the speech
        // off, so retime to the audio that actually exists, then recompile.
        if (retime) {
            const durations = {};
            for (const job of first.lipsyncJobs) {
                const cue = voiced.cues.find((c) => c.id === `${job.nodeId}@${job.at}`);
                const buf = cue ? voiced.buffers[cue.assetId] : null;
                if (buf && job.text) durations[job.text] = buf.duration;
            }
            // Shots authored by hand keep their pacing (grow-only); shots whose
            // durations came from a word-count estimate may also tighten.
            const estimated = film.meta?.estimatedTiming === true;
            const { film: retimed, changed, changes } =
                retimeToAudio(working, durations, { shrink: estimated });
            if (changed > 0) {
                this.log(`extended ${changed} shot(s) to fit the recorded audio: `
                    + changes.map((c) => `${c.shot ?? '?'} ${c.from}s->${c.to}s`).join(', '));
                working = retimed;
                first = compileFilm(working, { assets: images });
                // Re-key lipsync at the corrected offsets without
                // re-synthesizing: the audio itself has not changed.
                const again = await synthesizeDialogue({
                    lipsyncJobs: first.lipsyncJobs,
                    registry: this.voices,
                    buffers: voiced.buffers,
                    fps: first.meta.fps,
                    sampleRate: this.sampleRate,
                });
                voiced.cues = again.cues;
                voiced.tracks = again.tracks;
                voiced.buffers = again.buffers;
            }
        }

        // Lipsync + subtitle tracks join the timeline.
        for (const track of voiced.tracks) first.timeline.tracks.push(track);
        attachSubtitles(first, voiced);

        const cues = [...first.audioCues, ...voiced.cues];
        onProgress?.({ stage: 'mix' });
        this.log('rendering audio mix offline');
        const mix = cues.length
            ? await renderMix({
                cues, buffers: voiced.buffers,
                sampleRate: this.sampleRate,
                durationSec: first.meta.duration,
            })
            : null;

        // Drawings and photos arrive from the compiler as *unrasterised*
        // specs, by design -- compilation is pure and may not touch a
        // canvas. Nothing else resolved them, so until now a film with a
        // `drawings` or `photos` block validated clean, rendered every
        // other node, and left its artwork blank with no error anywhere.
        const painters = await this._attachPainters(first.scene, notes);

        return {
            ...first,
            film: working,
            diagnostics: [...first.diagnostics, ...notes],
            audio: mix,
            audioBuffers: voiced.buffers,
            cues,
            painters,
        };
    }

    /**
     * Resolve every paint and photo node to a painter.
     *
     * The kernels are loaded lazily and only when a film actually contains
     * artwork, because that is a wasm fetch and most films do not. A
     * failure is a diagnostic rather than a throw: the rest of the film is
     * still worth rendering, and saying so beats taking the whole render
     * down over one drawing.
     */
    async _attachPainters(scene, notes) {
        let wanted = false;
        scene.walk((node) => {
            if (node.kind === 'paint' || node.kind === 'photo') wanted = true;
            // A node carrying a chart of DRAWINGS is still a `group` until the
            // swap pass runs, so its artwork is invisible to a check that only
            // looks at `kind`. Missing it meant the kernels were never loaded
            // and every drawn hand, mouth and head-turn rendered blank, with
            // no diagnostic -- the film simply had a hole in it.
            for (const set of Object.values(node.props?.swapSets ?? {})) {
                for (const member of Object.values(set)) {
                    if (member?.kind === 'paint' || member?.kind === 'photo') wanted = true;
                }
            }
        });
        if (!wanted) return [];

        if (this._kernels === undefined) {
            try {
                // A worker pool when the page is cross-origin isolated:
                // a photo warp is the heaviest thing in a frame and runs
                // 2.8x faster across six workers, bit-identically. Its
                // `serial` kernels own the shared heap, so buffers must be
                // allocated there for a pointer to be valid in a worker.
                //
                // Browser only by default. In Node the studio is being
                // driven by a test or a check, where spawning six workers
                // per instance oversubscribes the machine for work that is
                // never rendered -- the suite went from 40 seconds to not
                // finishing. `parallel: true` forces it either way.
                const wantPool = this.parallel
                    ?? (typeof window !== 'undefined' && typeof Worker !== 'undefined');
                this._pool = wantPool ? await loadParallelKernels().catch(() => null) : null;
                this._kernels = this._pool ? this._pool.serial : await loadKernels();
                // Say which path is in use, always. A missing pool is a 2.8x
                // slowdown on photo warps and it used to be announced by
                // nothing at all, so the usual cause -- a host that sends no
                // cross-origin isolation headers -- went uninvestigated
                // because the app still worked.
                if (this._pool) {
                    this.log(`kernel worker pool ready (${this._pool.workerCount} workers)`);
                } else if (wantPool) {
                    this.log(parallelAvailable()
                        ? 'kernel worker pool unavailable; running single-threaded'
                        : 'not cross-origin isolated, so no SharedArrayBuffer and no kernel '
                            + 'worker pool -- photo warps run single-threaded, about 2.8x slower. '
                            + 'Serve with the COOP/COEP headers (npm run serve), or let the '
                            + 'service worker supply them and reload.', 'warn');
                }
            } catch (error) {
                this._kernels = null;
                notes.push({
                    severity: 'warning', path: '',
                    message: `Paint kernels failed to load (${error.message}); `
                        + 'drawings and photos will render blank.',
                });
            }
        }
        if (!this._kernels) return [];

        const painters = attachPainters(scene, this._kernels, { pool: this._pool ?? null });
        this.log(`${painters.length} drawing/photo painter(s) attached`);
        return painters;
    }

    /**
     * Render a prepared film to video.
     *
     * Sink selection is the fallback ladder in code: WebCodecs when a muxer
     * is available (exact timestamps, faster than real time), otherwise the
     * paced MediaRecorder path, which is slower but needs no dependency and
     * still carries audio.
     */
    async render(prepared, {
        canvas, width, height, fps, sink = null, onProgress = null, signal = null,
        preferWebCodecs = true, format = 'auto',
    } = {}) {
        const meta = prepared.meta;
        const w = width ?? meta.width;
        const h = height ?? meta.height;
        const rate = fps ?? meta.fps;

        const backend = new Canvas2DBackend({ width: w, height: h });
        backend.mount(canvas, { width: w, height: h });

        // One frame hook, used by both the measurement and the render, so
        // preflight cannot measure a different frame than the one drawn.
        const beforeFrame = async () => {
            applySwapSets(prepared.scene);
            await preparePhotos(prepared.scene);
        };

        // Measure the shot the estimate says is heaviest, not the opening
        // two seconds, and feed the result back into the model so the next
        // estimate is anchored to this machine instead of to the hardware
        // the defaults were measured on.
        const estimate = estimateFrameCost(prepared, prepared.film,
            { trackValueAt, calibration: this.calibration });
        const span = worstSpan(estimate);
        const pf = await preflight({
            scene: prepared.scene, timeline: prepared.timeline,
            backend, cameraId: prepared.cameraId, fps: rate, beforeFrame,
            startSec: span?.startSec ?? 0, endSec: span?.endSec ?? null,
        });
        this.log(`preflight: mean ${pf.meanMs}ms, median ${pf.medianMs}ms, p95 ${pf.p95Ms}ms per frame `
            + `(ceiling ${pf.ceilingMs}ms${span ? `, sampled from ${span.startSec.toFixed(1)}s, `
                + `shot "${span.shotId}"` : ''})${pf.withinBudget ? '' : ' -- OVER BUDGET'}`);
        if (span) {
            // The mean, not the median: the estimate is amortised over a
            // held warp and so is the mean, while the median of a bimodal
            // sample is whichever mode happens to be more common.
            const fitted = calibrate(span.ms, pf.meanMs, this.calibration);
            this.log(`budget: predicted ${span.ms.toFixed(1)}ms, measured ${pf.meanMs}ms `
                + `(${fitted.ratio.toFixed(2)}x) -- calibration updated for this machine`);
            this.calibration = fitted;
            saveCalibration(fitted);
        }

        let chosen = sink;
        if (!chosen) {
            const muxerFactory = this.muxerFactory
                ?? (format === 'webm' ? null : mp4MuxerFactory);
            const wantWebCodecs = preferWebCodecs && format !== 'webm';
            // MP4 means H.264 specifically. `pickCodec` would otherwise
            // happily return vp09, which is legal in the container and
            // undecodable on most phones.
            const container = format === 'webm' ? 'webm' : 'mp4';
            const canWebCodecs = wantWebCodecs
                && await WebCodecsSink.available({ muxerFactory, container, width: w, height: h });
            if (canWebCodecs) {
                chosen = new WebCodecsSink({ muxerFactory, container });
                this.log('encoder: WebCodecs H.264/mp4 (exact timestamps, faster than real time)');
            } else if (format === 'mp4') {
                // Asked for MP4 by name. Falling back to WebM silently would
                // hand back a file with the wrong extension's worth of
                // expectations attached.
                throw new Error('MP4 was requested but this browser cannot encode H.264 '
                    + 'through WebCodecs. Use format: "webm", or render a PNG sequence.');
            } else if (await MediaRecorderSink.available()) {
                chosen = new MediaRecorderSink();
                this.log(`encoder: paced MediaRecorder webm -- this takes about `
                    + `${Math.round(meta.duration)}s of real time. Keep this tab visible.`);
            } else {
                throw new Error('No video encoder available in this browser');
            }
        }
        chosen.audioBuffer = prepared.audio ?? null;

        const wakeLock = await requestWakeLock(this.log.bind(this));
        try {
            const blob = await renderOffline({
                scene: prepared.scene, timeline: prepared.timeline, backend,
                cameraId: prepared.cameraId,
                fps: rate, width: w, height: h,
                durationSec: meta.duration,
                sink: chosen, signal,
                // Async, so photo warps run across the worker pool before
                // the synchronous draw. Without a pool `preparePhotos`
                // returns immediately and the sync path does the work.
                beforeFrame,
                onProgress: (p) => { onProgress?.({ stage: 'render', ...p, preflight: pf }); },
            });
            return { blob, preflight: pf, meta, sink: chosen.constructor.name };
        } finally {
            wakeLock?.release?.().catch(() => {});
        }
    }

    /** Compile + prepare + render in one call. */
    async produce(film, { assets = null, audioBuffers = {}, canvas, onProgress,
                          baseUrl = '', ...rest } = {}) {
        // `null`, not `{}`: an empty object means "the caller loaded them and
        // there were none", which would silently skip loading.
        const prepared = await this.prepare(film, { assets, audioBuffers, onProgress, baseUrl });
        if (!prepared.timeline) {
            throw new Error('Film did not compile: '
                + prepared.diagnostics.filter((d) => d.severity === 'fatal')
                    .map((d) => d.message).join('; '));
        }
        const out = await this.render(prepared, { canvas, onProgress, ...rest });
        return { ...out, prepared };
    }

    /** Audio-only export: the fallback rung when muxing is unavailable. */
    audioAsWav(prepared) {
        return prepared.audio ? audioBufferToWav(prepared.audio) : null;
    }
}

/**
 * Dialogue text becomes a discrete track on the single subtitle node.
 *
 * Exported because subtitles are attached HERE and not in the compiler, so
 * anything that poses a scene without rendering it -- `grab2d`, a contact
 * sheet, an editor preview -- shows no subtitle at all. Most viewers watch
 * muted, which makes the subtitle part of the picture, and until now there
 * was no way to check it was inside the frame without a full render.
 */
export function attachSubtitles(compiled, voiced) {
    const jobs = compiled.lipsyncJobs.filter((j) => j.subtitle && j.text);
    if (!jobs.length) return;
    const track = {
        target: '__subtitle', path: 'props.text', type: 'discrete',
        keys: [{ t: 0, v: '', ease: 'step' }],
    };
    for (const job of jobs) {
        const cue = voiced.cues.find((c) => c.id === `${job.nodeId}@${job.at}`);
        const buf = cue ? voiced.buffers[cue.assetId] : null;
        const dur = buf?.duration ?? job.durationSec ?? estimateFallback(job.text);
        track.keys.push({ t: job.at, v: job.text, ease: 'step' });
        track.keys.push({ t: job.at + dur + 0.25, v: '', ease: 'step' });
    }
    track.keys.sort((a, b) => a.t - b.t);
    compiled.timeline.tracks.push(track);
}

const estimateFallback = (text) =>
    Math.max(1.4, String(text).trim().split(/\s+/).length / 2.6);

async function requestWakeLock(log) {
    try {
        if (navigator.wakeLock?.request) {
            const lock = await navigator.wakeLock.request('screen');
            return lock;
        }
    } catch { log('wake lock unavailable; keep the tab visible during render'); }
    return null;
}

const describeProgress = (p) => {
    if (!p) return '';
    if (p.total) return `${Math.round((p.loaded / p.total) * 100)}%`;
    return p.url ? String(p.url).split('/').pop() : '';
};

export {
    compileFilm, parseScreenplay, retimeToAudio,
    MemorySink, MediaRecorderSink, WebCodecsSink, PngSequenceSink,
    Mp4Muxer, mp4MuxerFactory,
    Canvas2DBackend, renderOffline, preflight, audioBufferToWav, trackValueAt,
};

/**
 * The fitted calibration, kept per machine in `localStorage`.
 *
 * A ratio measured on this hardware is worth more than the defaults, and
 * it does not change between sessions -- so re-deriving it on every reload
 * would mean the first render of every session is the one that pays for
 * the measurement. Every access is wrapped: storage is absent in Node,
 * throws in a private window, and comes back empty after a site-data
 * clear, and none of that may take a render down.
 *
 * A stored ratio outside 0.1x..10x is rejected rather than trusted: that
 * range covers every real machine, and a number outside it came from a
 * backgrounded tab or a thermal stall, not from hardware.
 */
const CALIBRATION_KEY = 'jirex.calibration';

function loadCalibration() {
    try {
        const raw = globalThis.localStorage?.getItem(CALIBRATION_KEY);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (!(saved.ratio > 0.1 && saved.ratio < 10)) return null;
        return { ...CALIBRATION, ...saved };
    } catch { return null; }
}

function saveCalibration(calibration) {
    try {
        if (!(calibration.ratio > 0.1 && calibration.ratio < 10)) return;
        globalThis.localStorage?.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
    } catch { /* unavailable or full: the fit still holds for this session */ }
}
