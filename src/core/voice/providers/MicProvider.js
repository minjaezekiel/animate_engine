import { createVoice } from '../VoiceRegistry.js';

/**
 * The user's own voice, recorded per line in the browser.
 *
 * This is the Day-1 answer to "use my voice": zero ML, zero network, and
 * better sounding than any clone. It mirrors the capture pattern the engine
 * already uses in MediaManager (getUserMedia -> MediaRecorder ->
 * decodeAudioData) without modifying it.
 *
 * Recording is interactive, so a film render reads from takes captured
 * earlier rather than prompting mid-render.
 */
export class MicProvider {
    constructor({ decode, sampleRate = 48000 } = {}) {
        this.id = 'mic';
        this.label = 'My voice (microphone)';
        this.source = 'mic';
        this.decode = decode;
        this.sampleRate = sampleRate;
        this.takes = new Map();          // voiceId -> Map<lineKey, AudioBuffer>
    }

    async available() {
        return typeof navigator !== 'undefined'
            && !!navigator.mediaDevices?.getUserMedia
            && typeof MediaRecorder !== 'undefined';
    }

    async listVoices() {
        const ids = this.takes.size ? [...this.takes.keys()] : ['myvoice'];
        return ids.map((id) => createVoice({ id, name: 'My voice', source: 'mic', provider: 'mic' }));
    }

    /** Record one take; resolves to the decoded AudioBuffer. */
    async record({ voiceId = 'myvoice', lineKey = '__default', stopSignal } = {}) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        const stopped = new Promise((r) => { rec.onstop = r; });
        rec.start();

        if (stopSignal) {
            await new Promise((r) => {
                if (stopSignal.aborted) return r();
                stopSignal.addEventListener('abort', r, { once: true });
            });
        }
        rec.stop();
        await stopped;
        for (const t of stream.getTracks()) t.stop();

        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const buffer = await this.decode(blob);
        this.addTake(voiceId, buffer, { lineKey });
        return buffer;
    }

    addTake(voiceId, audioBuffer, { lineKey = '__default' } = {}) {
        let m = this.takes.get(voiceId);
        if (!m) this.takes.set(voiceId, (m = new Map()));
        m.set(lineKey, audioBuffer);
        return this;
    }

    async synthesize({ text, voice }) {
        const m = this.takes.get(voice?.id ?? 'myvoice');
        if (!m) return null;
        const buffer = m.get(text) ?? m.get('__default') ?? [...m.values()][0];
        return buffer ? { audioBuffer: buffer, phonemes: null } : null;
    }
}
