/**
 * Camera geometry for the globe frames, kept free of Cesium so it can be tested.
 *
 * The globes look straight down for whole-planet views and approach sites obliquely (about −50°, the
 * "3D view"). Every placement keeps one ground target exactly on the centre of the free area (the part
 * of the frame not covered by shell UI), so the reticle, Enter-to-pick and the scale bar keep reading
 * the target whether the camera is pitched or not.
 *
 * Vectors are planet-fixed Cartesian metres. A view is the canvas in CSS pixels with Cesium's vertical
 * field of view and the focus point (centre of the free area).
 */
import type { Planet } from "./protocol";

export type Vec3 = readonly [number, number, number];
export interface Enu { east: Vec3; north: Vec3; up: Vec3 }
export interface View { w: number; h: number; fovy: number; focus: { x: number; y: number } }
export interface Pose { position: Vec3; direction: Vec3; up: Vec3; right: Vec3 }

/** Pitch of the oblique approach, degrees below the target's horizon. */
export const OBLIQUE_PITCH_DEG = -50;

/**
 * Flights end tilted only at site scale: when the camera ends at most this far from its target. Wider
 * framings (a continent, the whole planet) keep looking straight down, where a tilt would only show the
 * limb. Mars: up to the 100 km footprint flight (3,000 km); Earth: candidate and window flights (≤ 1,100 km)
 * and small fits, while the phone framings of spread sets (planned for a nadir camera, ≥ ~4,500 km) stay
 * top-down.
 */
export const SITE_SCALE_KM: Record<Planet, number> = { mars: 3_200, earth: 3_000 };

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** Final pitch of a programmatic flight that ends `depthKm` from its target. */
export function flightPitchDeg(planet: Planet, depthKm: number, tiltOn: boolean): number {
  return tiltOn && depthKm <= SITE_SCALE_KM[planet] ? OBLIQUE_PITCH_DEG : -90;
}

/** Whether a camera pitch (telemetry, relative to the camera's own horizon) reads as the 3D view. */
export function isTilted(pitchDeg: number | null | undefined): boolean {
  return typeof pitchDeg === "number" && Number.isFinite(pitchDeg) && pitchDeg > -80;
}

/**
 * 0 when looking straight down, 1 once clearly oblique. Drives what only makes sense in 3D: scan-volume
 * walls and marker stems fade in as the camera tilts, so top-down views stay clean squares and dots.
 */
export function tiltWeight(pitchDeg: number): number {
  const t = Math.min(1, Math.max(0, (pitchDeg + 87) / 13));
  return t * t * (3 - 2 * t);
}

/** Centre of the free area, CSS px. */
export function focusOf(w: number, h: number, insets: { top: number; right: number; bottom: number; left: number }) {
  const freeW = Math.max(40, w - insets.left - insets.right);
  const freeH = Math.max(40, h - insets.top - insets.bottom);
  return { x: insets.left + freeW / 2, y: insets.top + freeH / 2, freeW, freeH };
}

function tans(v: View) {
  const tanY = Math.tan(v.fovy / 2);
  return { tanY, tanX: tanY * (v.w / v.h) };
}

/**
 * Camera pose that looks at `target` with the given pitch (below the target's horizon) and heading
 * (clockwise from north), `depthM` from it along the view direction, and puts it exactly on the
 * focus point. The camera keeps its orientation and is translated sideways, so the ground scale at the
 * target is that of a camera `depthM` above it (the scale bar and matched-scale comparisons stay valid).
 */
export function poseAt(target: Vec3, enu: Enu, depthM: number, pitchDeg: number, headingDeg: number, v: View): Pose {
  const p = pitchDeg * D2R, hd = headingDeg * D2R;
  const horiz = norm(add(scale(enu.east, Math.sin(hd)), scale(enu.north, Math.cos(hd))));
  const direction = norm(add(scale(horiz, Math.cos(p)), scale(enu.up, Math.sin(p))));
  const up = norm(add(scale(horiz, -Math.sin(p)), scale(enu.up, Math.cos(p))));
  const right = cross(direction, up);
  const { tanX, tanY } = tans(v);
  const nx = (v.focus.x - v.w / 2) / (v.w / 2);
  const ny = (v.h / 2 - v.focus.y) / (v.h / 2);
  const ray = add(direction, add(scale(right, nx * tanX), scale(up, ny * tanY)));
  return { position: sub(target, scale(ray, depthM)), direction, up, right };
}

/** Screen position (CSS px) of a world point for a pose; null when it is behind the camera. */
export function project(pose: Pose, X: Vec3, v: View): { x: number; y: number; z: number } | null {
  const d = sub(X, pose.position);
  const z = dot(d, pose.direction);
  if (!(z > 0)) return null;
  const { tanX, tanY } = tans(v);
  return {
    x: v.w / 2 + (dot(d, pose.right) / (z * tanX)) * (v.w / 2),
    y: v.h / 2 - (dot(d, pose.up) / (z * tanY)) * (v.h / 2),
    z,
  };
}

/** Pitch (below the target's horizon) and heading of a camera, measured in a target's local frame. */
export function attitudeAt(direction: Vec3, up: Vec3, enu: Enu): { pitchDeg: number; headingDeg: number } {
  const pitch = Math.asin(Math.max(-1, Math.min(1, dot(direction, enu.up))));
  // direction + up has a horizontal part along the heading for any pitch in [−90°, 0°], including nadir.
  const h = add(direction, up);
  const heading = Math.atan2(dot(h, enu.east), dot(h, enu.north));
  return { pitchDeg: pitch * R2D, headingDeg: ((heading * R2D) % 360 + 360) % 360 };
}

/** A surface point (on a body centred at the origin) faces a camera at C, i.e. is not behind the limb. */
export function facesCamera(X: Vec3, C: Vec3): boolean {
  return dot(X, sub(C, X)) >= 0;
}

/**
 * The smallest depth (between lo and hi, metres) at which every point projects inside `box` (CSS px) for
 * a camera posed with poseAt around `target`. Returns hi when even hi does not fit. Bisection is on a
 * log scale: points converge on the focus point as the camera backs away, so the test is monotonic.
 */
export function fitDepth(
  points: Vec3[], target: Vec3, enu: Enu, pitchDeg: number, headingDeg: number, v: View,
  box: { x0: number; x1: number; y0: number; y1: number }, lo: number, hi: number,
): number {
  const fits = (depth: number) => {
    const pose = poseAt(target, enu, depth, pitchDeg, headingDeg, v);
    for (const X of points) {
      if (!facesCamera(X, pose.position)) return false;
      const s = project(pose, X, v);
      if (!s || s.x < box.x0 || s.x > box.x1 || s.y < box.y0 || s.y > box.y1) return false;
    }
    return true;
  };
  if (!fits(hi)) return hi;
  if (fits(lo)) return lo;
  for (let i = 0; i < 48 && hi / lo > 1.002; i++) {
    const mid = Math.sqrt(lo * hi);
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Nadir that puts a target on the focus point for a camera looking straight down from `heightM` with a
 * heading (clockwise from north). `mpp` is the ground scale at nadir. Offsets are small next to the
 * planet, so a local flat-earth step on a sphere of radius `R` is enough.
 */
export function nadirFor(lat: number, lon: number, mpp: number, v: { w: number; h: number; focus: { x: number; y: number } }, headingDeg: number, R: number) {
  const dx = (v.focus.x - v.w / 2) * mpp; // target right of centre, metres
  const dy = (v.focus.y - v.h / 2) * mpp; // target below centre, metres
  const h = headingDeg * D2R;
  const north = dx * Math.sin(h) + dy * Math.cos(h);
  const east = -dx * Math.cos(h) + dy * Math.sin(h);
  const dLat = (north / R) * R2D;
  const dLon = (east / (R * Math.max(Math.cos(lat * D2R), 0.05))) * R2D;
  const outLon = lon + dLon;
  return { lat: Math.max(-89.5, Math.min(89.5, lat + dLat)), lon: ((outLon + 540) % 360 + 360) % 360 - 180 };
}

/** Pose of a camera straight above a ground point (Cesium: pitch −90°, heading clockwise from north). */
export function nadirPose(ground: Vec3, enu: Enu, heightM: number, headingDeg: number): Pose {
  const h = headingDeg * D2R;
  const direction = scale(enu.up, -1);
  const up = norm(add(scale(enu.north, Math.cos(h)), scale(enu.east, Math.sin(h))));
  return { position: add(ground, scale(enu.up, heightM)), direction, up, right: cross(direction, up) };
}

/**
 * nadirFor, refined until the target lands on the focus point to a hundredth of a pixel: each pass
 * projects the target through the actual nadir camera and moves the nadir by the residual. `site` gives
 * the surface point and local axes for a lat/lon on the rendering ellipsoid.
 */
export function exactNadir(
  target: Vec3, lat: number, lon: number, heightM: number, mpp: number, v: View, headingDeg: number, R: number,
  site: (lat: number, lon: number) => { ground: Vec3; enu: Enu },
) {
  let n = nadirFor(lat, lon, mpp, v, headingDeg, R);
  const h = headingDeg * D2R;
  for (let i = 0; i < 12; i++) {
    const { ground, enu } = site(n.lat, n.lon);
    const s = project(nadirPose(ground, enu, heightM, headingDeg), target, v);
    if (!s) break;
    const dx = (s.x - v.focus.x) * mpp, dy = (s.y - v.focus.y) * mpp;
    if (Math.hypot(dx, dy) < mpp * 0.01) break;
    // The target sits right/below the focus: move the camera that way on the ground.
    const east = dx * Math.cos(h) - dy * Math.sin(h);
    const north = -dx * Math.sin(h) - dy * Math.cos(h);
    const nLat = Math.max(-89.5, Math.min(89.5, n.lat + (north / R) * R2D));
    const nLon = n.lon + (east / (R * Math.max(Math.cos(n.lat * D2R), 0.05))) * R2D;
    n = { lat: nLat, lon: ((nLon + 540) % 360 + 360) % 360 - 180 };
  }
  return n;
}

/**
 * Height in metres of a marker stem that projects to about `px` CSS pixels for a camera `distanceM` away,
 * scaled by how oblique the view is (0 when looking straight down, so a stem never displaces its glyph
 * in a top-down view). Visual only: never a measurement.
 */
export function stemHeightM(distanceM: number, canvasH: number, fovy: number, pitchDeg: number, px = 44): number {
  const k = canvasH / 2 / Math.tan(fovy / 2);
  return (px * distanceM / k) * tiltWeight(pitchDeg);
}
