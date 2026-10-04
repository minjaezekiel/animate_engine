import { createVoice } from '../VoiceRegistry.js';

/**
 * Voice-actor files: one or more recordings per voice, supplied by the user.
 *
 * A voice may hold either a per-line map (keyed by the dialogue text, so
 * different actors can read specific lines) or a single clip. Returns no
 * phoneme timings, so lipsync uses the text + envelope tier.
 */
export class UploadProvider {
    constructor({ decode } = {}) {
        this.id = 'upload';
        this.label = 'Uploaded voice files';
        this.source = 'upload';
        this.decode = decode;            // (File|ArrayBuffer) => Promise<AudioBuffer>
        this.voices = new Map();         // voiceId -> { name, lines: Map<key, AudioBuffer> }
    }

    async available() { return this.voices.size > 0; }

    async listVoices() {
        return [...this.voices.entries()].map(([id, v]) =>
            createVoice({ id, name: v.name ?? id, source: 'upload', provider: 'upload' }));
    }

    /** Register a decoded clip for a voice, optionally bound to one line. */
    addClip(voiceId, audioBuffer, { name, lineKey = '__default' } = {}) {
        let v = this.voices.get(voiceId);
        if (!v) this.voices.set(voiceId, (v = { name: name ?? voiceId, lines: new Map() }));
        v.lines.set(lineKey, audioBuffer);
        return this;
    }

    async addFile(voiceId, file, { name, lineKey } = {}) {
        if (!this.decode) throw new Error('UploadProvider: no decode function provided');
        return this.addClip(voiceId, await this.decode(file), { name, lineKey });
    }

    async synthesize({ text, voice }) {
        const v = this.voices.get(voice?.id);
        if (!v) return null;
        const buffer = v.lines.get(text) ?? v.lines.get('__default') ?? [...v.lines.values()][0];
        return buffer ? { audioBuffer: buffer, phonemes: null } : null;
    }
}
