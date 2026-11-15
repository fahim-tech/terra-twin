import { describe, expect, it } from "vitest";
import { project } from "../Sheet";
import { glide, glideRest, LIMITS, nearestTurn, omega, Orbit, releaseVelocity, rubberClamp, springStep } from "./orbit";

const HOME = { az: (205 * Math.PI) / 180, el: (30 * Math.PI) / 180, zoom: 0.94, ve: 4 };
const run = (o: Orbit, seconds: number, t0 = 0) => {
  let t = t0;
  for (let i = 0; i < seconds * 120; i++) { t += 1000 / 120; o.step(1 / 120, t); }
  return t;
};

describe("springStep", () => {
  it("settles critically damped: no overshoot from rest, and starts at the handed-off velocity", () => {
    let x = 0, v = 0, peak = 0;
    for (let i = 0; i < 240; i++) { [x, v] = springStep(x, v, 1, omega(0.38), 1 / 120); peak = Math.max(peak, x); }
    expect(x).toBeCloseTo(1, 5);
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    const [x1] = springStep(0, 2, 1, omega(0.38), 1e-4);
    expect(x1 / 1e-4).toBeCloseTo(2, 1); // continuous with the gesture
  });
});

describe("glide", () => {
  it("coasts as far as Apple's projection for the same release velocity", () => {
    expect(glideRest(0, 1000)).toBeCloseTo(project(1000), -1); // ≈ 499 px
    let x = 0, v = 1000;
    for (let i = 0; i < 600; i++) [x, v] = glide(x, v, 1 / 120);
    expect(x).toBeCloseTo(glideRest(0, 1000), 0);
  });
});

describe("rubberClamp", () => {
  it("passes values inside the limits and resists progressively outside", () => {
    expect(rubberClamp(0.5, 0, 1, 1)).toBe(0.5);
    const a = rubberClamp(1.2, 0, 1, 1), b = rubberClamp(1.6, 0, 1, 1);
    expect(a).toBeGreaterThan(1);
    expect(a - 1).toBeLessThan(0.2);
    expect(b).toBeGreaterThan(a);
    expect(b - 1).toBeLessThan(0.6);
  });
});

describe("releaseVelocity", () => {
  it("measures the last ~100 ms and drops a pointer that rested before lifting", () => {
    const s = Array.from({ length: 8 }, (_, i) => ({ t: i * 10, x: i * 0.1 }));
    expect(releaseVelocity(s, 72)).toBeCloseTo(10, 6); // 0.1 per 10 ms
    expect(releaseVelocity(s, 200)).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 0 }], 1)).toBe(0);
  });
});

describe("Orbit", () => {
  it("tracks a drag 1:1, then glides with the release velocity and stops", () => {
    const o = new Orbit(HOME, false);
    o.beginDrag(100, 100, 0);
    for (let i = 1; i <= 10; i++) o.moveDrag(100 + i * 12, 100, i * 8, 960);
    expect(o.az.x - HOME.az).toBeCloseTo((120 * Math.PI) / 960, 9); // half a turn per 960 px view
    o.endDrag(82);
    expect(o.az.v).toBeGreaterThan(0);
    const released = o.az.x;
    run(o, 4, 82);
    expect(o.az.x).toBeGreaterThan(released);
    expect(o.az.v).toBe(0);
  });

  it("has no glide with reduced motion", () => {
    const o = new Orbit(HOME, true);
    o.beginDrag(0, 0, 0);
    for (let i = 1; i <= 10; i++) o.moveDrag(i * 20, 0, i * 8, 960);
    o.endDrag(82);
    expect(o.az.v).toBe(0);
    expect(o.step(1 / 60, 100)).toBe(false);
  });

  it("rubber-bands tilt past its limit while held and springs back on release", () => {
    const o = new Orbit(HOME, false);
    o.beginDrag(0, 0, 0);
    o.moveDrag(0, 2000, 500, 960); // far past the top limit
    expect(o.el.x).toBeGreaterThan(LIMITS.elMax);
    expect(o.el.x).toBeLessThan(HOME.el + (2000 * Math.PI) / 960);
    o.endDrag(1000);
    run(o, 3, 1000);
    expect(o.el.x).toBeCloseTo(LIMITS.elMax, 4);
  });

  it("never tilts past overhead or under the floor, however far the drag goes", () => {
    const o = new Orbit(HOME, false);
    o.beginDrag(0, 0, 0);
    for (const dy of [400, 2000, 20000]) {
      o.moveDrag(0, dy, 10, 480);
      expect(o.el.x).toBeGreaterThan(LIMITS.elMax);
      expect(o.el.x).toBeLessThanOrEqual(LIMITS.elMax + LIMITS.elBand);
      expect(o.el.x).toBeLessThan(Math.PI / 2); // still looking down: the scene never mirrors
    }
    for (const dy of [-400, -2000, -20000]) {
      o.moveDrag(0, dy, 20, 480);
      expect(o.el.x).toBeLessThan(LIMITS.elMin);
      expect(o.el.x).toBeGreaterThanOrEqual(LIMITS.elMin - LIMITS.elBand);
      expect(o.el.x).toBeGreaterThan(0); // camera stays above the floor
    }
  });

  it("stops a fast flick at the tilt band and settles on the limit", () => {
    // Released inside the limits at 6.5–9 rad/s: the glide crosses the limit fast enough that an
    // unguarded spring would carry the camera overhead or to the floor.
    for (const [dir, px] of [[1, 11], [-1, 8]] as const) {
      const o = new Orbit(HOME, false);
      o.beginDrag(0, 300, 0);
      for (let i = 1; i <= 6; i++) o.moveDrag(0, 300 + dir * i * px, i * 8, 480);
      expect(o.el.x).toBeGreaterThan(LIMITS.elMin);
      expect(o.el.x).toBeLessThan(LIMITS.elMax);
      o.endDrag(50);
      expect(Math.abs(o.el.v)).toBeGreaterThan(6);
      let lo = Infinity, hi = -Infinity, t = 50;
      for (let i = 0; i < 480; i++) { t += 1000 / 120; o.step(1 / 120, t); lo = Math.min(lo, o.el.x); hi = Math.max(hi, o.el.x); }
      expect(hi).toBeLessThanOrEqual(LIMITS.elMax + LIMITS.elBand + 1e-12);
      expect(lo).toBeGreaterThanOrEqual(LIMITS.elMin - LIMITS.elBand - 1e-12);
      expect(o.el.x).toBeCloseTo(dir > 0 ? LIMITS.elMax : LIMITS.elMin, 4);
    }
  });

  it("rubber-bands wheel zoom and returns to the limit once the wheel rests", () => {
    const o = new Orbit(HOME, false);
    for (let i = 0; i < 40; i++) o.wheel(120, i * 16);
    expect(o.zoom.x).toBeGreaterThan(LIMITS.zoomMax);
    run(o, 2, 40 * 16);
    expect(o.zoom.x).toBeCloseTo(LIMITS.zoomMax, 4);
  });

  it("zooms 1:1 with two fingers and turns with a twist", () => {
    const o = new Orbit(HOME, false);
    o.beginPinch(100, 0);
    o.movePinch(200, 0.3);
    expect(Math.exp(o.zoom.x)).toBeCloseTo(HOME.zoom / 2, 9);
    expect(o.az.x).toBeCloseTo(HOME.az - 0.3, 9);
  });

  it("accumulates keyboard steps and resets along the shortest turn", () => {
    const o = new Orbit(HOME, false);
    o.nudge("az", 0.25);
    o.nudge("az", 0.25);
    expect(o.az.target).toBeCloseTo(HOME.az + 0.5, 9);
    run(o, 2);
    expect(o.az.x).toBeCloseTo(HOME.az + 0.5, 4);
    o.az.x += 4 * Math.PI; // two whole turns later
    o.reset();
    expect(o.az.target).toBeCloseTo(HOME.az + 4 * Math.PI, 9);
    o.nudge("el", 10);
    expect(o.el.target).toBe(LIMITS.elMax); // keyboard never pushes past a limit
  });

  it("applies steps instantly with reduced motion", () => {
    const o = new Orbit(HOME, true);
    o.setVE(8);
    o.faceNorth();
    expect(o.ve.x).toBe(8);
    expect(o.az.x).toBeCloseTo(Math.PI, 9);
    o.establish();
    expect(o.az.target).toBeNull();
  });

  it("morphs the vertical exaggeration with a spring", () => {
    const o = new Orbit(HOME, false);
    o.setVE(8);
    expect(o.ve.x).toBe(4);
    run(o, 2);
    expect(o.ve.x).toBeCloseTo(8, 4);
  });
});

describe("nearestTurn", () => {
  it("never spins whole turns", () => {
    expect(nearestTurn(0, 6.1)).toBeCloseTo(2 * Math.PI, 9);
    expect(nearestTurn(1, -0.2)).toBe(1);
  });
});
