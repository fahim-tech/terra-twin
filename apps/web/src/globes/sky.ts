/**
 * Orientation of the star field behind Mars.
 *
 * The globes draw Cesium's packaged Tycho-2 star map (real star positions, J2000 equatorial frame).
 * Cesium orients it for Earth; behind Mars it is rotated into Mars's body-fixed frame with the IAU
 * WGCCRE 2000 rotation model for Mars (Seidelmann et al. 2002), so the sky seen past the Mars limb is
 * the sky as oriented from Mars at the moment of loading — Mars's pole points to RA 317.68°, Dec 52.89°.
 */

export const J2000_JD = 2_451_545.0;
/** TT − UTC (s): 32.184 s plus 37 leap seconds since 2017. */
const TT_MINUS_UTC_S = 69.184;

const D2R = Math.PI / 180;

/** Days since J2000.0 (TT) for a civil (UTC) date. */
export function daysSinceJ2000(date: Date): number {
  return (date.getTime() + TT_MINUS_UTC_S * 1000) / 86_400_000 + 2_440_587.5 - J2000_JD;
}

/** IAU 2000 Mars pole (right ascension, declination) and prime-meridian angle W, degrees. */
export function marsOrientation(date: Date): { ra: number; dec: number; W: number } {
  const d = daysSinceJ2000(date);
  const T = d / 36_525;
  return {
    ra: 317.68143 - 0.1061 * T,
    dec: 52.8865 - 0.0609 * T,
    W: ((176.63 + 350.89198226 * d) % 360 + 360) % 360,
  };
}

/**
 * Rotation from the J2000 equatorial frame to Mars body-fixed axes (x: prime meridian, z: north pole),
 * row-major. Rows are the body axes expressed in J2000 coordinates.
 */
export function icrfToMarsFixed(date: Date): number[] {
  const { ra, dec, W } = marsOrientation(date);
  const a = ra * D2R, dl = dec * D2R, w = W * D2R;
  const p = [Math.cos(dl) * Math.cos(a), Math.cos(dl) * Math.sin(a), Math.sin(dl)]; // pole
  const q = [-Math.sin(a), Math.cos(a), 0]; // ascending node of Mars's equator on the J2000 equator
  const r = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; // p × q
  const x = [0, 1, 2].map((i) => Math.cos(w) * q[i] + Math.sin(w) * r[i]);
  const y = [0, 1, 2].map((i) => -Math.sin(w) * q[i] + Math.cos(w) * r[i]);
  return [...x, ...y, ...p];
}
