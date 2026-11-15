/**
 * Orbit camera physics for the relief view, after Apple's fluid-interface rules: a drag tracks the
 * pointer 1:1 from where it was grabbed; release hands the measured velocity to a scroll-like
 * momentum glide; limits are rubber-banded while held and spring back critically damped, carrying
 * the velocity; every animation starts from the current value, so the view can be grabbed again at
 * any instant. With reduced motion there is no glide, no fly-in and no animated transition.
 */
import { rubberband } from "../Sheet";
import type { Pose } from "./reliefMath";

/** UIScrollView "normal" deceleration rate, per millisecond (scroll-like glide). */
export const DECEL_PER_MS = 0.998;
/** Orbit glide: firmer than a scroll, so a flick turns the block by tens of degrees, not whole turns. */
export const ORBIT_DECEL_PER_MS = 0.995;
const lnK = (rate: number) => 1000 * Math.log(rate); // per second

/** Critically damped spring frequency for a given response (seconds): ω = 2π / response. */
export const omega = (response: number) => (2 * Math.PI) / response;
const UI = omega(0.38);
const MORPH = omega(0.45);
const ESTABLISH = omega(1.25);

/** Exact step of a critically damped spring toward `target` (never overshoots from rest). */
export function springStep(x: number, v: number, target: number, w: number, dt: number): [number, number] {
  const d = x - target;
  const e = Math.exp(-w * dt);
  const c2 = v + w * d;
  return [target + (d + c2 * dt) * e, (c2 - w * (d + c2 * dt)) * e];
}

/** Momentum glide over `dt` seconds under exponential decay (at 0.998 it integrates to Apple's projection, v·0.499 s). */
export function glide(x: number, v: number, dt: number, rate = DECEL_PER_MS): [number, number] {
  const L = lnK(rate), k = Math.exp(L * dt);
  return [x + (v * (k - 1)) / L, v * k];
}

/** Where a released glide comes to rest. */
export function glideRest(x: number, v: number, rate = DECEL_PER_MS): number {
  return x - v / lnK(rate);
}

/** Value past [min, max] with progressive resistance (rubber band). `dim` is the axis' natural span. */
export function rubberClamp(x: number, min: number, max: number, dim: number): number {
  if (x < min) return min - rubberband(min - x, dim);
  if (x > max) return max + rubberband(x - max, dim);
  return x;
}

export interface Sample { t: number; x: number }

/**
 * Release velocity (units per second) from the last pointer samples (ms timestamps). A pointer that
 * rested before lifting has no velocity.
 */
export function releaseVelocity(samples: Sample[], now: number, windowMs = 100, restMs = 50): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (now - last.t > restMs) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0 && last.t - samples[i].t <= windowMs; i--) first = samples[i];
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

export interface Axis {
  x: number;
  v: number;
  target: number | null;
  /** Spring frequency used for the current target. */
  w: number;
  min: number;
  max: number;
  /** Hard stops a little past [min, max]: no rubber band, glide or spring ever carries the value beyond them. */
  hardMin: number;
  hardMax: number;
}

const axis = (x: number, min = -Infinity, max = Infinity, band = Infinity): Axis =>
  ({ x, v: 0, target: null, w: UI, min, max, hardMin: min - band, hardMax: max + band });
const clamp = (x: number, a: Axis) => Math.min(a.max, Math.max(a.min, x));
const MAX_V = 9; // rad/s: a flick never spins the block faster than this

/**
 * Tilt and zoom limits. Tilt gives way by at most `elBand` past its limits (rubber band while held,
 * overshoot after a flick), so the camera never passes overhead (which would mirror the scene) and never
 * drops under the block's floor.
 */
export const LIMITS = {
  elMin: (8 * Math.PI) / 180, elMax: (88 * Math.PI) / 180, elBand: (1.5 * Math.PI) / 180,
  zoomMin: Math.log(0.42), zoomMax: Math.log(2.2),
};

/** Stop at the hard limits, dropping any velocity that pushes further out. */
function hardStop(a: Axis): void {
  if (a.x > a.hardMax) { a.x = a.hardMax; if (a.v > 0) a.v = 0; }
  else if (a.x < a.hardMin) { a.x = a.hardMin; if (a.v < 0) a.v = 0; }
}

export class Orbit {
  readonly az: Axis;
  readonly el: Axis;
  /** Natural log of the zoom multiple. */
  readonly zoom: Axis;
  readonly ve: Axis;
  reduced: boolean;
  private home: Pose;
  private drag: { x0: number; y0: number; az0: number; el0: number; az: Sample[]; el: Sample[] } | null = null;
  private pinch: { span0: number; angle0: number; zoom0: number; az0: number } | null = null;
  private wheelRaw = 0;
  private lastWheel = -Infinity;

  constructor(home: Pose, reduced: boolean) {
    this.home = home;
    this.reduced = reduced;
    this.az = axis(home.az);
    this.el = axis(home.el, LIMITS.elMin, LIMITS.elMax, LIMITS.elBand);
    this.zoom = axis(Math.log(home.zoom), LIMITS.zoomMin, LIMITS.zoomMax);
    this.ve = axis(home.ve, 1, 8);
  }

  get pose(): Pose {
    return { az: this.az.x, el: this.el.x, zoom: Math.exp(this.zoom.x), ve: this.ve.x };
  }

  get held(): boolean {
    return !!this.drag || !!this.pinch;
  }

  /** Establishing move on first show: from a high, wide, turned view down to the home pose. */
  establish(): void {
    if (this.reduced) return;
    this.az.x = this.home.az - 0.7;
    this.el.x = 1.2;
    this.zoom.x = Math.log(1.55);
    for (const a of [this.az, this.el, this.zoom]) { a.v = 0; a.w = ESTABLISH; }
    this.az.target = this.home.az;
    this.el.target = this.home.el;
    this.zoom.target = Math.log(this.home.zoom);
  }

  private stopAll(): void {
    for (const a of [this.az, this.el, this.zoom]) { a.v = 0; a.target = null; }
  }

  beginDrag(px: number, py: number, t: number): void {
    this.stopAll();
    this.pinch = null;
    this.drag = { x0: px, y0: py, az0: this.az.x, el0: this.el.x, az: [{ t, x: this.az.x }], el: [{ t, x: this.el.x }] };
  }

  /** 1:1: half a turn per drag across the view (clamped for very small and very large views). */
  moveDrag(px: number, py: number, t: number, widthPx: number): void {
    const d = this.drag;
    if (!d) return;
    const k = Math.PI / Math.min(1200, Math.max(480, widthPx));
    this.az.x = d.az0 + (px - d.x0) * k; // drag right: the camera walks left round the block, the terrain follows the pointer
    this.el.x = rubberClamp(d.el0 + (py - d.y0) * k, this.el.min, this.el.max, LIMITS.elBand); // drag down: the camera rises
    d.az.push({ t, x: this.az.x });
    d.el.push({ t, x: this.el.x });
    if (d.az.length > 8) { d.az.shift(); d.el.shift(); }
  }

  endDrag(t: number): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const cap = (v: number) => Math.max(-MAX_V, Math.min(MAX_V, v));
    this.az.v = this.reduced ? 0 : cap(releaseVelocity(d.az, t));
    this.el.v = this.reduced ? 0 : cap(releaseVelocity(d.el, t));
    this.settleLimits(this.el);
  }

  beginPinch(span: number, angle: number): void {
    this.stopAll();
    this.drag = null;
    this.pinch = { span0: Math.max(1, span), angle0: angle, zoom0: this.zoom.x, az0: this.az.x };
  }

  /** Two fingers: spread zooms 1:1 with the finger distance; a twist turns the block with the fingers. */
  movePinch(span: number, angle: number): void {
    const p = this.pinch;
    if (!p) return;
    this.zoom.x = rubberClamp(p.zoom0 + Math.log(p.span0 / Math.max(1, span)), this.zoom.min, this.zoom.max, 0.8);
    this.az.x = p.az0 - (angle - p.angle0);
  }

  endPinch(): void {
    if (!this.pinch) return;
    this.pinch = null;
    this.settleLimits(this.zoom);
  }

  /** Wheel / trackpad zoom, rubber-banded at the limits; springs back once the wheel rests. */
  wheel(deltaY: number, t: number): void {
    if (t - this.lastWheel > 150) this.wheelRaw = this.zoom.x;
    this.lastWheel = t;
    this.wheelRaw += deltaY * 0.0016;
    this.zoom.x = rubberClamp(this.wheelRaw, this.zoom.min, this.zoom.max, 0.8);
    this.zoom.v = 0;
    this.zoom.target = null;
  }

  /** Keyboard and button steps: animated toward the accumulated target (instant with reduced motion). */
  nudge(which: "az" | "el" | "zoom", delta: number): void {
    const a = this[which];
    const to = which === "az" ? (a.target ?? a.x) + delta : clamp((a.target ?? a.x) + delta, a);
    this.to(a, to, UI);
  }

  /** Turn so the view looks due north (camera south of the block). */
  faceNorth(): void {
    this.to(this.az, nearestTurn(Math.PI, this.az.x), UI);
  }

  reset(): void {
    this.to(this.az, nearestTurn(this.home.az, this.az.x), UI);
    this.to(this.el, this.home.el, UI);
    this.to(this.zoom, Math.log(this.home.zoom), UI);
  }

  setVE(ve: number): void {
    this.to(this.ve, ve, MORPH);
  }

  private to(a: Axis, target: number, w: number): void {
    if (this.reduced) { a.x = target; a.v = 0; a.target = null; return; }
    a.target = target;
    a.w = w;
  }

  private settleLimits(a: Axis): void {
    if (a.x < a.min || a.x > a.max) {
      if (this.reduced) { a.x = clamp(a.x, a); a.v = 0; a.target = null; } else { a.target = clamp(a.x, a); a.w = UI; }
    }
  }

  /**
   * Advance by dt seconds. Returns true while anything still animates (a held drag is driven by its
   * pointer events, so it does not keep the frame loop running by itself).
   */
  step(dt: number, now: number): boolean {
    const wheelActive = now - this.lastWheel <= 150;
    const all = [this.az, this.el, this.zoom, this.ve];
    if (dt <= 0) return wheelActive || all.some((a) => a.target !== null || a.v !== 0);
    let moving = false;
    if (!wheelActive && !this.pinch) this.settleLimits(this.zoom);
    for (const a of all) {
      if (this.held && a !== this.ve) continue;
      if (a === this.zoom && wheelActive) continue;
      if (a.target !== null) {
        [a.x, a.v] = springStep(a.x, a.v, a.target, a.w, dt);
        if (Math.abs(a.x - a.target) < 1e-5 && Math.abs(a.v) < 1e-4) { a.x = a.target; a.v = 0; a.target = null; a.w = UI; }
        else moving = true;
      } else if (a.v !== 0) {
        [a.x, a.v] = glide(a.x, a.v, dt, ORBIT_DECEL_PER_MS);
        if (a.x < a.min || a.x > a.max) { a.target = clamp(a.x, a); a.w = UI; moving = true; }
        else if (Math.abs(a.v) < 2e-3) a.v = 0;
        else moving = true;
      }
      hardStop(a);
    }
    return moving || wheelActive;
  }
}

/** The angle equivalent to `target` (mod 2π) nearest to `current`, so a reset never spins whole turns. */
export function nearestTurn(target: number, current: number): number {
  return target + 2 * Math.PI * Math.round((current - target) / (2 * Math.PI));
}
