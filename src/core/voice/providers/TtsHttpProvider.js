import { createVoice } from '../VoiceRegistry.js';

/**
 * Any HTTP TTS endpoint: a self-hosted Piper, a cloud service, or a voice
 * cloning model that needs a GPU.
 *
 * Kept generic on purpose -- it is the seam through which voice cloning
 * arrives later without the engine growing a vendor dependency. Supply an
 * endpoint that takes {text, voice} and returns audio bytes, plus optionally a
 * phoneme-timing array, and lipsync automatically upgrades to the exact tier.
 */
export class TtsHttpProvider {
    constructor({ endpoint, voices = [], decode, headers = {}, id = 'http',
                  label = 'Remote TTS', parseResponse = null } = {}) {
        this.id = id;
        this.label = label;
        this.source = 'tts';
        this.endpoint = endpoint;
        this.decode = decode;
        this.headers = headers;
        this._voices = voices;
        this.parseResponse = parseResponse;
    }

    async available() {
        return !!this.endpoint && typeof fetch !== 'undefined';
    }

    async listVoices() {
        return this._voices.map((v) => (typeof v === 'string'
            ? createVoice({ id: v, name: v, source: 'tts', provider: this.id })
            : createVoice({ ...v, source: 'tts', provider: this.id })));
    }

    async synthesize({ text, voice, lang }) {
        const res = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this.headers },
            body: JSON.stringify({ text, voice: voice?.id, lang }),
        });
        if (!res.ok) throw new Error(`TtsHttpProvider: ${res.status} ${res.statusText}`);

        if (this.parseResponse) {
            const { audio, phonemes } = await this.parseResponse(res);
            return { audioBuffer: await this.decode(audio), phonemes: phonemes ?? null };
        }

        const type = res.headers.get('content-type') ?? '';
        if (type.includes('application/json')) {
            const body = await res.json();
            const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
            return {
                audioBuffer: await this.decode(bytes.buffer),
                phonemes: body.phonemes ?? null,
            };
        }
        return { audioBuffer: await this.decode(await res.arrayBuffer()), phonemes: null };
    }
}
