/**
 * Euler <-> quaternion, in Three's default 'XYZ' order.
 *
 * Here rather than borrowed from THREE so the 3D animation path stays pure
 * and Node-testable: converting at track-build time is what lets rotation be
 * slerped AND eased, which neither of the old paths managed. The mixer
 * slerped but ignored `interp` entirely; densifying Euler keys honoured
 * `interp` but took the long way round between 350 and 10 degrees.
 */

export function quatFromEuler([x, y, z]) {
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3,
    ];
}

export function eulerFromQuat([x, y, z, w]) {
    // Rotation matrix elements needed for the XYZ decomposition.
    const m11 = 1 - 2 * (y * y + z * z);
    const m12 = 2 * (x * y - z * w);
    const m13 = 2 * (x * z + y * w);
    const m23 = 2 * (y * z - x * w);
    const m33 = 1 - 2 * (x * x + y * y);
    const m22 = 1 - 2 * (x * x + z * z);
    const m21 = 2 * (x * y + z * w);

    const clamped = Math.max(-1, Math.min(1, m13));
    const ey = Math.asin(clamped);
    // Near the pole m11 and m12 both collapse, so x and z stop being
    // separable; pick a branch rather than return NaN.
    if (Math.abs(m13) < 0.9999999) {
        return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
    }
    return [Math.atan2(m21, m22), ey, 0];
}
