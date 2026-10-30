/**
 * How many samples of priming does this platform's audio encoder prepend?
 *
 * AAC encoders emit a lead-in of samples before the real signal, and nothing
 * in the WebCodecs API reports how many. Measured on Chrome 156: **2112
 * samples, 44.0 ms at 48 kHz** -- which is where the sync probe found the
 * click when the container said nothing about it, against 0.007 s on the
 * MediaRecorder path. Audio 44 ms late is a frame out at 24 fps.
 *
 * MP4 declares that lead-in with an edit list, so the number has to be known
 * before the tables are written. It is measured rather than hard-coded
 * because it belongs to the encoder, not to us: a different Chrome, a
 * different codec or a different platform may well prime differently, and a
 * stale constant would silently desynchronise every film.
 *
 * The round trip costs one 40-frame encode and decode, about 50 ms, once per
 * configuration per page.
 */

const cache = new Map();

/** A 1 kHz burst at sample 0, which is unambiguous after a lossy round trip. */
function impulse(total, sampleRate) {
    const out = new Float32Array(total);
    for (let i = 0; i < 480 && i < total; i++) {
        out[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
    }
    return out;
}

/**
 * @returns the priming length in samples, or 0 if it could not be measured --
 *          in which case no edit list is written and the audio plays late,
 *          which is still better than refusing to render.
 */
export async function measureAudioPriming({ codec, sampleRate, channels }) {
    const key = `${codec}/${sampleRate}/${channels}`;
    if (cache.has(key)) return cache.get(key);
    const measured = await measure({ codec, sampleRate, channels }).catch(() => 0);
    cache.set(key, measured);
    return measured;
}

async function measure({ codec, sampleRate, channels }) {
    if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') return 0;
    // Opus in WebM is handled by MediaRecorder, and Opus pre-skip is carried
    // in its own header; this path only ever needs AAC.
    if (!codec.startsWith('mp4a')) return 0;

    const FRAME = 1024;
    const FRAMES = 40;
    const config = { codec, sampleRate, numberOfChannels: channels, bitrate: 128_000 };
    const source = impulse(FRAME * FRAMES, sampleRate);

    const packets = [];
    let description = null;
    const encoder = new AudioEncoder({
        output: (chunk, meta) => {
            if (!description && meta?.decoderConfig?.description) {
                description = new Uint8Array(meta.decoderConfig.description);
            }
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            packets.push({ type: chunk.type, timestamp: chunk.timestamp, data });
        },
        error: () => {},
    });
    encoder.configure(config);
    for (let offset = 0; offset < source.length; offset += FRAME) {
        // The same mono signal on every channel: priming is a property of the
        // encoder's lookahead, not of the content.
        const interleaved = new Float32Array(FRAME * channels);
        for (let i = 0; i < FRAME; i++) {
            for (let c = 0; c < channels; c++) interleaved[i * channels + c] = source[offset + i];
        }
        const data = new AudioData({
            format: 'f32', sampleRate, numberOfFrames: FRAME, numberOfChannels: channels,
            timestamp: Math.round((offset / sampleRate) * 1e6), data: interleaved,
        });
        encoder.encode(data);
        data.close();
    }
    await encoder.flush();
    encoder.close();
    if (!packets.length || !description) return 0;

    let decodedSamples = [];
    const decoder = new AudioDecoder({
        output: (frame) => {
            const buf = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
            frame.copyTo(buf, { planeIndex: 0, format: 'f32' });
            decodedSamples.push(buf);
            frame.close();
        },
        error: () => {},
    });
    decoder.configure({ codec, sampleRate, numberOfChannels: channels, description });
    for (const p of packets) {
        decoder.decode(new EncodedAudioChunk({
            type: p.type, timestamp: p.timestamp, data: p.data }));
    }
    await decoder.flush();
    decoder.close();

    let index = 0;
    for (const block of decodedSamples) {
        for (let i = 0; i < block.length; i++, index++) {
            // 0.5 is well clear of codec ringing and is reached within a few
            // samples of a 1 kHz sine's start.
            if (Math.abs(block[i]) > 0.5) return Math.floor(index / channels);
        }
    }
    return 0;
}

/** Test seam: forget what was measured. */
export function resetPrimingCache() {
    cache.clear();
}
