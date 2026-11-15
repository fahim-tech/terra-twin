/**
 * Camera framing for the comparison: one camera distance for both planets, so their ground scales match.
 *
 * Both halves fly to the same pitch — oblique when the 3D preference is on, straight down when it is off — and
 * the framing is measured on the compared square as the camera will actually show it: its four corners
 * projected for that pitch (the globes' own camera model, globes/camera.ts). Looking straight down that is the
 * square's ground size over the metres per pixel; tilted, the near edge is wider and the far edge narrower than
 * that, so a framing from top-down metres per pixel let the near edge run past the room beside the Why brief.
 */
import { focusOf, poseAt, project, type Enu, type Vec3, type View } from "../../globes/camera";
import { destination, squareFootprint } from "../../lib/geodesy";

/** Fallback camera distance when the stage has not been measured yet, km. */
export const COMPARE_HEIGHT_KM = 420;

/** Share of the smaller free-area side the compared footprint should span on screen. */
export const FILL = 0.3;
/** Cesium default frustum (60°), vertical for these landscape/portrait frames. */
export const FOVY = Math.PI / 3;

/**
 * The camera height (same on both planets, so ground scale matches) that makes a `km` footprint span
 * FILL of the smaller free-area side, and at most `capPx` (the room beside the Why brief, when the
 * Earth window is shown there), looking straight down. mpp = 2·h·tan(fovy/2) / canvasHeight (see globe-entry
 * mppAtHeight). `matchedDepthKm` is the general rule; this is its top-down case.
 */
export function matchedHeightKm(km: number, canvasH: number, freePx: number, capPx = Infinity): number {
  if (!(canvasH > 0) || !(freePx > 40)) return COMPARE_HEIGHT_KM;
  const targetPx = Math.max(48, Math.min(capPx, Math.max(60, freePx * FILL)));
  const mpp = (km * 1000) / targetPx;
  return Math.round((mpp * canvasH) / (2 * Math.tan(FOVY / 2)) / 1000);
}

/** On-screen size of a `km` footprint seen from `heightKm` in a frame `canvasH` px tall, px (straight down). */
export function footprintPx(km: number, heightKm: number, canvasH: number): number {
  const mpp = (2 * heightKm * 1000 * Math.tan(FOVY / 2)) / canvasH;
  return (km * 1000) / mpp;
}

/** Cesium's PerspectiveFrustum: its 60° field of view spans the wider side of the canvas. */
export function fovyFor(w: number, h: number): number {
  const fov = Math.PI / 3;
  return w / h <= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) / (w / h));
}

export interface Insets { top: number; right: number; bottom: number; left: number }
/** One half of the comparison: its globe canvas (CSS px) and the part of it covered by the strip and plates. */
export interface HalfFrame { w: number; h: number; insets: Insets }

/** A compared square: its centre, side (km, from the record) and the radius of the sphere the globe draws it on. */
export interface ComparedSquare { lat: number; lon: number; km: number; radiusM: number }

export interface ScreenBox { left: number; right: number; top: number; bottom: number; w: number; h: number }

const D2R = Math.PI / 180;

/** A point on a sphere of radius R and its local east / north / up axes. */
function onSphere(lat: number, lon: number, R: number): { X: Vec3; enu: Enu } {
  const la = lat * D2R, lo = lon * D2R;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  return {
    X: [up[0] * R, up[1] * R, up[2] * R],
    enu: { east: [-Math.sin(lo), Math.cos(lo), 0], north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], up },
  };
}

function viewOf(frame: HalfFrame): View {
  const f = focusOf(frame.w, frame.h, frame.insets);
  return { w: frame.w, h: frame.h, fovy: fovyFor(frame.w, frame.h), focus: { x: f.x, y: f.y } };
}

/**
 * The compared square on screen for a camera `depthKm` from its aim point at `pitchDeg` (heading north), the aim
 * point on the centre of the free area: the box around its four projected corners (squareFootprint, the square
 * the globe draws). The aim point is the square's centre moved `aimEastM` metres east (the Why-brief shift).
 * Null when a corner falls behind the camera.
 */
export function projectedSquare(sq: ComparedSquare, depthKm: number, pitchDeg: number, frame: HalfFrame, aimEastM = 0): ScreenBox | null {
  const v = viewOf(frame);
  const aim = aimEastM ? destination(sq.lat, sq.lon, 90, aimEastM, sq.radiusM) : { lat: sq.lat, lon: sq.lon };
  const a = onSphere(aim.lat, aim.lon, sq.radiusM);
  const pose = poseAt(a.X, a.enu, depthKm * 1000, pitchDeg, 0, v);
  const pts = squareFootprint(sq.lat, sq.lon, sq.km, sq.radiusM).map((c) => project(pose, onSphere(c.lat, c.lon, sq.radiusM).X, v));
  if (pts.some((p) => !p)) return null;
  const xs = pts.map((p) => p!.x), ys = pts.map((p) => p!.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, right, top, bottom, w: right - left, h: bottom - top };
}

/** The free area's smaller side, px. */
function freeSide(frame: HalfFrame): number {
  const f = focusOf(frame.w, frame.h, frame.insets);
  return Math.min(f.freeW, f.freeH);
}

/** Camera distance at which the projected square spans `targetPx` (its wider extent), km: bisection on a log scale. */
function depthForSpan(sq: ComparedSquare, pitchDeg: number, frame: HalfFrame, targetPx: number): number {
  const span = (d: number) => {
    const b = projectedSquare(sq, d, pitchDeg, frame);
    return b ? Math.max(b.w, b.h) : Infinity;
  };
  let lo = 1, hi = 40_000;
  if (span(hi) > targetPx) return hi;
  for (let i = 0; i < 60 && hi / lo > 1.0005; i++) {
    const mid = Math.sqrt(lo * hi);
    if (span(mid) > targetPx) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** One side of the comparison to frame: its square, its half and, beside the Why brief, the room it must fit, px. */
export interface CompareSide { square: ComparedSquare; frame: HalfFrame; capPx?: number }

/**
 * The camera distance both halves fly to, km: the smallest at which each compared square, as projected for the
 * shared pitch, spans no more than FILL of the smaller free side of the two halves (at least 60 px) and no more
 * than its own cap. Equal distances keep the ground scale at both reticles equal, pitched or not (camera.ts
 * poseAt). Looking straight down this is matchedHeightKm.
 */
export function matchedDepthKm(sides: CompareSide[], pitchDeg: number, fill = FILL): number {
  if (!sides.length || sides.some((s) => !(s.frame.w > 0) || !(s.frame.h > 0))) return COMPARE_HEIGHT_KM;
  const freePx = Math.min(...sides.map((s) => freeSide(s.frame)));
  if (!(freePx > 40)) return COMPARE_HEIGHT_KM;
  let depth = 0;
  for (const s of sides) {
    const targetPx = Math.max(48, Math.min(s.capPx ?? Infinity, Math.max(60, freePx * fill)));
    depth = Math.max(depth, depthForSpan(s.square, pitchDeg, s.frame, targetPx));
  }
  return Math.round(depth);
}

/**
 * How far east of the compared square to aim, metres, so that the square as projected sits `shiftPx` left of the
 * free area's centre (into the room beside the Why brief). Solved on the projected corners (secant steps), so
 * pitch, perspective and the canvas's field of view are all accounted for.
 */
export function aimEastForShift(sq: ComparedSquare, depthKm: number, pitchDeg: number, frame: HalfFrame, shiftPx: number): number {
  if (!shiftPx) return 0;
  const v = viewOf(frame);
  const target = v.focus.x - shiftPx;
  const centreX = (d: number) => {
    const b = projectedSquare(sq, depthKm, pitchDeg, frame, d);
    return b ? (b.left + b.right) / 2 : NaN;
  };
  // First guess: the ground scale along the screen horizontal at the aim point.
  let d0 = 0, x0 = centreX(0);
  let d1 = (shiftPx * 2 * depthKm * 1000 * Math.tan(v.fovy / 2)) / v.h, x1 = centreX(d1);
  for (let i = 0; i < 6 && Number.isFinite(x0) && Number.isFinite(x1) && Math.abs(x1 - target) > 0.05 && x1 !== x0; i++) {
    const d2 = d1 + ((target - x1) * (d1 - d0)) / (x1 - x0);
    d0 = d1; x0 = x1;
    d1 = d2; x1 = centreX(d2);
  }
  return Number.isFinite(x1) ? d1 : (shiftPx * 2 * depthKm * 1000 * Math.tan(v.fovy / 2)) / v.h;
}
