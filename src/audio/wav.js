/**
 * AudioBuffer -> 16-bit PCM WAV. Zero dependencies.
 *
 * This is a rung on the export fallback ladder: if A/V muxing is unavailable,
 * the film still ships as a silent video plus a wav the user can combine in
 * one ffmpeg command.
 */
export function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;
    const blockAlign = channels * 2;
    const dataBytes = frames * blockAlign;

    const out = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(out);
    const ascii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

    ascii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);              // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, dataBytes, true);

    const planes = [];
    for (let c = 0; c < channels; c++) planes.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            const s = Math.max(-1, Math.min(1, planes[c][i]));
            view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            off += 2;
        }
    }
    return new Blob([out], { type: 'audio/wav' });
}
