import { describe, expect, it } from "vitest";
import { footprintDimension, kmLabel } from "./gauge";

const pt = (x: number, y: number, visible = true) => ({ x, y, visible });

describe("footprint dimension", () => {
  // Ring order as squareFootprint returns it: NE, SE, SW, NW (north up on screen).
  const square = [pt(200, 100), pt(200, 200), pt(100, 200), pt(100, 100)];

  it("hangs from the lowest edge, offset away from the square, reading left to right", () => {
    const d = footprintDimension(square, { offset: 16, gap: 5, overshoot: 5 })!;
    expect(d.line).toEqual([100, 216, 200, 216]);
    expect(d.ext[0]).toEqual([100, 205, 100, 221]);
    expect(d.ext[1]).toEqual([200, 205, 200, 221]);
    expect(d.label).toEqual({ x: 150, y: 216, angle: 0 });
    expect(d.length).toBe(100);
    expect(d.n[0]).toBeCloseTo(0);
    expect(d.n[1]).toBeCloseTo(1);
  });

  it("follows a rotated or tilted projection and keeps the label upright", () => {
    // A square turned 30° on screen: the lowest edge is no longer horizontal.
    const r = (deg: number) => (deg * Math.PI) / 180;
    const corners = [45, 135, 225, 315].map((b) => pt(300 + 70 * Math.sin(r(b + 30)), 300 - 70 * Math.cos(r(b + 30))));
    const d = footprintDimension(corners)!;
    expect(d).not.toBeNull();
    expect(Math.abs(d.label.angle)).toBeLessThanOrEqual(90);
    // The dimension sits outside the square: further from the centre than the edge midpoint.
    const dist = (x: number, y: number) => Math.hypot(x - 300, y - 300);
    expect(dist(d.label.x, d.label.y)).toBeGreaterThan(70 * Math.SQRT1_2);
  });

  it("draws nothing when a corner is hidden or the square is too small to label", () => {
    expect(footprintDimension([pt(200, 100), pt(200, 200, false), pt(100, 200), pt(100, 100)])).toBeNull();
    expect(footprintDimension([square[0], square[1], undefined, square[3]])).toBeNull();
    expect(footprintDimension([pt(110, 100), pt(110, 110), pt(100, 110), pt(100, 100)])).toBeNull();
  });

  it("labels the record's size without padding or invented precision", () => {
    expect(kmLabel(50)).toBe("50 km");
    expect(kmLabel(24.66)).toBe("24.7 km");
  });
});

