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
import { MicProvider } from './core/voice/providers/MicProvider.js';
import { UploadProvider } from './core/voice/providers/UploadProvider.js';
import { TtsVitsProvider } from './core/voice/providers/TtsVitsProvider.js';
import { TtsHttpProvider } from './core/voice/providers/TtsHttpProvider.js';
import { synthesizeDialogue } from './core/voice/synthesize.js';
import { renderMix, decodeAudio } from './audio/OfflineMixer.js';
import { audioBufferToWav } from './audio/wav.js';
import { Canvas2DBackend } from './backends/canvas2d/Canvas2DBackend.js';
import { renderOffline, preflight } from './render/OfflineRenderer.js';
import { MediaRecorderSink } from './render/sinks/MediaRecorderSink.js';
import { WebCodecsSink } from './render/sinks/WebCodecsSink.js';
import { MemorySink } from './render/sinks/MemorySink.js';
import { applyVisemeShapes } from './core/scene/visemeShapes.js';
import { trackValueAt } from './core/anim/Track.js';

const SAMPLE_RATE = 48000;

export class FilmStudio {
    constructor({ sampleRate = SAMPLE_RATE, muxerFactory = null, ttsModuleUrl, onLog = null } = {}) {
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
        // Order is the fallback order: a film authored for TTS still renders
        // from uploaded or recorded takes if TTS cannot load.
        this.voices.register(this.tts);
        this.voices.register(this.upload);
        this.voices.register(this.mic);
        this.decode = decode;
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
    async prepare(film, { assets = {}, audioBuffers = {}, onProgress = null, retime = true } = {}) {
        let working = film;
        const notes = [];

        // Pass 1: synthesize so real line durations are known.
        let first = compileFilm(working, { assets });
        if (!first.timeline) return { ...first, audio: null };

        const voiced = await synthesizeDialogue({
            lipsyncJobs: first.lipsyncJobs,
            registry: this.voices,
            buffers: { ...audioBuffers },
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
                first = compileFilm(working, { assets });
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

        return {
            ...first,
            film: working,
            diagnostics: [...first.diagnostics, ...notes],
            audio: mix,
            audioBuffers: voiced.buffers,
            cues,
        };
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
        preferWebCodecs = true,
    } = {}) {
        const meta = prepared.meta;
        const w = width ?? meta.width;
        const h = height ?? meta.height;
        const rate = fps ?? meta.fps;

        const backend = new Canvas2DBackend({ width: w, height: h });
        backend.mount(canvas, { width: w, height: h });

        const pf = await preflight({
            scene: prepared.scene, timeline: prepared.timeline,
            backend, cameraId: prepared.cameraId, fps: rate,
        });
        this.log(`preflight: median ${pf.medianMs}ms, p95 ${pf.p95Ms}ms per frame `
            + `(ceiling ${pf.ceilingMs}ms)${pf.withinBudget ? '' : ' -- OVER BUDGET'}`);

        let chosen = sink;
        if (!chosen) {
            const canWebCodecs = preferWebCodecs
                && await WebCodecsSink.available({ muxerFactory: this.muxerFactory });
            if (canWebCodecs) {
                chosen = new WebCodecsSink({ muxerFactory: this.muxerFactory });
                this.log('encoder: WebCodecs (exact timestamps, faster than real time)');
            } else if (await MediaRecorderSink.available()) {
                chosen = new MediaRecorderSink();
                this.log(`encoder: paced MediaRecorder -- this takes about `
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
                beforeFrame: (t) => applyVisemeShapes(prepared.scene),
                onProgress: (p) => { onProgress?.({ stage: 'render', ...p, preflight: pf }); },
            });
            return { blob, preflight: pf, meta, sink: chosen.constructor.name };
        } finally {
            wakeLock?.release?.().catch(() => {});
        }
    }

    /** Compile + prepare + render in one call. */
    async produce(film, { assets = {}, audioBuffers = {}, canvas, onProgress, ...rest } = {}) {
        const prepared = await this.prepare(film, { assets, audioBuffers, onProgress });
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

/** Dialogue text becomes a discrete track on the single subtitle node. */
function attachSubtitles(compiled, voiced) {
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
    MemorySink, MediaRecorderSink, WebCodecsSink,
    Canvas2DBackend, renderOffline, preflight, audioBufferToWav, trackValueAt,
};
