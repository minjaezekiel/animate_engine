import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDelivery, clampDelivery, resample, timeStretch,
         isPlainDelivery, DELIVERY_RANGE } from '../../src/core/audio/delivery.js';

const SR = 48000;

/** A pure tone. */
function tone(freq, seconds, sampleRate = SR, amp = 0.5) {
    const n = Math.round(seconds * sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    return out;
}

/**
 * A glottal pulse train with formant-ish decay: periodic like voiced speech
 * and much less forgiving than a sine, because a splice at the wrong phase
 * destroys the pulse shape rather than just denting a smooth curve.
 */
function voiced(f0, seconds, sampleRate = SR) {
    const n = Math.round(seconds * sampleRate);
    const out = new Float32Array(n);
    const period = sampleRate / f0;
    for (let i = 0; i < n; i++) {
        const phase = (i % period) / period;
        out[i] = 0.6 * Math.exp(-6 * phase)
            * Math.sin(2 * Math.PI * 3.5 * phase)
            * (1 + 0.15 * Math.sin((2 * Math.PI * 2 * i) / sampleRate));
    }
    return out;
}

/**
 * Fundamental by autocorrelation, searching 60-500Hz. This is the measuring
 * instrument for every pitch claim below, so it is checked against a known
 * tone first.
 */
function fundamental(samples, sampleRate = SR) {
    const lagMin = Math.floor(sampleRate / 500);
    const lagMax = Math.floor(sampleRate / 60);
    const n = Math.min(samples.length, sampleRate);     // one second is plenty
    let best = lagMin, bestScore = -Infinity;
    for (let lag = lagMin; lag <= lagMax; lag++) {
        let dot = 0, ea = 0, eb = 0;
        for (let i = 0; i + lag < n; i++) {
            const a = samples[i], b = samples[i + lag];
            dot += a * b; ea += a * a; eb += b * b;
        }
        const score = (ea && eb) ? dot / Math.sqrt(ea * eb) : 0;
        if (score > bestScore) { bestScore = score; best = lag; }
    }
    return { freq: sampleRate / best, confidence: bestScore };
}

const peakOf = (s) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const near = (a, b, tolFrac, what) =>
    assert.ok(Math.abs(a - b) / b <= tolFrac,
        `${what}: expected ~${b.toFixed(2)}, got ${a.toFixed(2)} (>${(tolFrac * 100).toFixed(0)}% off)`);

// ---------------------------------------------------------------------------
// The instrument
// ---------------------------------------------------------------------------

test('the pitch detector reads a known tone, so later claims mean something', () => {
    near(fundamental(tone(200, 0.5)).freq, 200, 0.02, 'detected tone');
    near(fundamental(voiced(120, 0.5)).freq, 120, 0.02, 'detected pulse train');
});

// ---------------------------------------------------------------------------
// Identity: an unused feature must cost nothing
// ---------------------------------------------------------------------------

test('rate 1 pitch 1 returns the very same array, not a copy', () => {
    const x = voiced(140, 0.3);
    assert.equal(applyDelivery(x, SR, { rate: 1, pitch: 1 }), x);
    assert.equal(applyDelivery(x, SR, {}), x);
    assert.ok(isPlainDelivery({}));
    assert.ok(!isPlainDelivery({ rate: 1.1 }));
});

test('resample and timeStretch are identities at ratio 1', () => {
    const x = voiced(140, 0.2);
    assert.equal(resample(x, 1), x);
    assert.equal(timeStretch(x, 1), x);
});

// ---------------------------------------------------------------------------
// Rate changes length and ONLY length
// ---------------------------------------------------------------------------

test('rate 1.25 shortens by a quarter and leaves pitch alone', () => {
    const x = voiced(130, 1.0);
    const y = applyDelivery(x, SR, { rate: 1.25 });
    near(y.length, x.length / 1.25, 0.02, 'length');
    near(fundamental(y).freq, 130, 0.02, 'pitch after speeding up');
});

test('rate 0.8 lengthens and leaves pitch alone', () => {
    const x = voiced(130, 1.0);
    const y = applyDelivery(x, SR, { rate: 0.8 });
    near(y.length, x.length / 0.8, 0.02, 'length');
    near(fundamental(y).freq, 130, 0.02, 'pitch after slowing down');
});

// ---------------------------------------------------------------------------
// Pitch changes frequency and ONLY frequency
// ---------------------------------------------------------------------------

test('pitch 1.5 raises a 200Hz tone to 300Hz without changing the duration', () => {
    const x = tone(200, 1.0);
    const y = applyDelivery(x, SR, { pitch: 1.5 });
    near(fundamental(y).freq, 300, 0.02, 'shifted frequency');
    near(y.length, x.length, 0.02, 'duration must not move');
});

test('pitch 0.8 lowers it, duration still unchanged', () => {
    const x = voiced(150, 1.0);
    const y = applyDelivery(x, SR, { pitch: 0.8 });
    near(fundamental(y).freq, 120, 0.03, 'shifted fundamental');
    near(y.length, x.length, 0.02, 'duration must not move');
});

// ---------------------------------------------------------------------------
// Both at once: the case a wrong composition order gets away with singly
// ---------------------------------------------------------------------------

test('rate and pitch compose independently', () => {
    const x = voiced(140, 1.0);
    const y = applyDelivery(x, SR, { rate: 1.1, pitch: 1.2 });
    near(y.length, x.length / 1.1, 0.03, 'length follows rate alone');
    near(fundamental(y).freq, 140 * 1.2, 0.03, 'pitch follows pitch alone');
});

test('the elder preset: slower and lower together', () => {
    const x = voiced(135, 1.0);
    const y = applyDelivery(x, SR, { rate: 0.86, pitch: 0.84 });
    near(y.length, x.length / 0.86, 0.03, 'length');
    near(fundamental(y).freq, 135 * 0.84, 0.03, 'pitch');
});

// ---------------------------------------------------------------------------
// The assertion that separates WSOLA from plain overlap-add
// ---------------------------------------------------------------------------

test('periodicity SURVIVES the stretch, it is not smeared away', () => {
    // A naive fixed-hop overlap-add splices at an arbitrary relative phase
    // and partially cancels the pitch period every hop. Length and average
    // frequency both still look right; what collapses is the CONFIDENCE of
    // the autocorrelation peak. This is the test that would have caught
    // shipping the naive version.
    const x = voiced(120, 1.0);
    const before = fundamental(x);
    const after = fundamental(timeStretch(x, 1.3, { sampleRate: SR }));
    near(after.freq, before.freq, 0.02, 'fundamental held');
    assert.ok(after.confidence > 0.8,
        `the pulse train must stay periodic; correlation fell to ${after.confidence.toFixed(3)}`);
    assert.ok(after.confidence > before.confidence - 0.15,
        `periodicity degraded too far: ${before.confidence.toFixed(3)} -> ${after.confidence.toFixed(3)}`);
});

test('a stretch of a silent buffer does not divide by zero or produce NaN', () => {
    const y = timeStretch(new Float32Array(SR), 1.4, { sampleRate: SR });
    assert.ok(y.every(Number.isFinite), 'silence must stay silent and finite');
});

test('a buffer too short to splice still comes out at the right length', () => {
    const x = voiced(200, 0.01);                 // 480 samples, well under one frame
    const y = applyDelivery(x, SR, { rate: 0.8 });
    near(y.length, x.length / 0.8, 0.1, 'short-line length');
    assert.ok(y.every(Number.isFinite));
});

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

test('overlap-add does not push the peak into clipping', () => {
    for (const d of [{ rate: 1.3 }, { pitch: 1.4 }, { rate: 0.7, pitch: 1.5 }]) {
        const y = applyDelivery(voiced(130, 0.6), SR, d);
        assert.ok(peakOf(y) <= 1.0,
            `peak ${peakOf(y).toFixed(4)} would clip the encoder for ${JSON.stringify(d)}`);
    }
});

test('a loud input stays loud: delivery is not a volume control', () => {
    const x = voiced(130, 0.6);
    const y = applyDelivery(x, SR, { rate: 1.1, pitch: 1.1 });
    near(peakOf(y), peakOf(x), 0.25, 'peak roughly preserved');
});

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

test('a delivery outside the band is clamped AND reported', () => {
    const { rate, pitch, diagnostics } = clampDelivery({ rate: 3, pitch: 0.1 }, 'voices.x');
    assert.equal(rate, DELIVERY_RANGE.max);
    assert.equal(pitch, DELIVERY_RANGE.min);
    assert.equal(diagnostics.length, 2);
    assert.ok(diagnostics.every((d) => d.severity === 'warning' && d.path === 'voices.x'));
    assert.match(diagnostics[0].message, /clamped/);
});

test('a sane delivery is passed through with nothing to report', () => {
    const { rate, pitch, diagnostics } = clampDelivery({ rate: 1.08, pitch: 1.14 });
    assert.equal(rate, 1.08);
    assert.equal(pitch, 1.14);
    assert.deepEqual(diagnostics, []);
});

test('nonsense is refused rather than propagated as NaN', () => {
    const { rate, pitch, diagnostics } = clampDelivery({ rate: 0, pitch: NaN });
    assert.equal(rate, 1);
    assert.equal(pitch, 1);
    assert.equal(diagnostics.length, 2);
});

test('every preset in the doc sits inside the band', () => {
    for (const d of [{ rate: 1.00, pitch: 1.00 }, { rate: 1.10, pitch: 1.16 },
                     { rate: 0.86, pitch: 0.84 }, { rate: 0.94, pitch: 0.92 },
                     { rate: 1.14, pitch: 1.30 }]) {
        assert.deepEqual(clampDelivery(d).diagnostics, [], JSON.stringify(d));
    }
});
