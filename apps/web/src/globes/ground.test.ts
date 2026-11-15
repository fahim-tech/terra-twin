import { describe, expect, it } from "vitest";
import { borderSamples, groundBox, horizonAlong, lonSpan } from "./ground";

describe("visible ground", () => {
  it("samples every edge of the free area, corners included", () => {
    const s = borderSamples(10, 20, 110, 220, 4);
    expect(s).toHaveLength(16);
    for (const corner of [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 220 }, { x: 10, y: 220 }]) {
      expect(s).toContainEqual(corner);
    }
    for (const p of s) expect(p.x === 10 || p.x === 110 || p.y === 20 || p.y === 220).toBe(true);
  });

  it("finds the horizon along a line from a point on the planet to one past it", () => {
    // A disc of radius 100 around (0, 0): the line from the centre to x = 300 leaves it at x = 100.
    const hit = (x: number, y: number) => (Math.hypot(x, y) <= 100 ? { x, y } : null);
    const h = horizonAlong({ x: 0, y: 0 }, { x: 300, y: 0 }, hit, 12)!;
    expect(h.x).toBeLessThanOrEqual(100);
    expect(h.x).toBeGreaterThan(99.9);
    expect(horizonAlong({ x: 500, y: 0 }, { x: 600, y: 0 }, hit)).toBeNull();
  });

  it("boxes the projected border around the centre", () => {
    const b = groundBox([{ lat: -24.5, lon: -70.4 }, { lat: -21.2, lon: -69.6 }, { lat: -24.1, lon: -69.1 }], { lat: -24, lon: -70 })!;
    expect(b.west).toBeCloseTo(-70.4, 9);
    expect(b.east).toBeCloseTo(-69.1, 9);
    expect(b.south).toBe(-24.5);
    expect(b.north).toBe(-21.2);
  });

  it("keeps a box across the antimeridian west of east", () => {
    const b = groundBox([{ lat: 1, lon: 178 }, { lat: -1, lon: -177 }], { lat: 0, lon: 179.5 })!;
    expect(b.west).toBe(178);
    expect(b.east).toBe(-177);
    expect(lonSpan(b)).toBeCloseTo(5, 9);
  });

  it("opens to every longitude when a pole is in view", () => {
    const b = groundBox([{ lat: 70, lon: 10 }, { lat: 75, lon: 100 }], { lat: 80, lon: 40 }, { north: true })!;
    expect(b).toEqual({ west: -180, south: 70, east: 180, north: 90 });
    expect(lonSpan(b)).toBe(360);
  });

  it("is empty without points", () => {
    expect(groundBox([], { lat: 0, lon: 0 })).toBeNull();
  });
});
