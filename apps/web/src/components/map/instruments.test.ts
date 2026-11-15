import { describe, expect, it } from "vitest";
import { unwrapDeg } from "./Instruments";

describe("north needle turns", () => {
  it("crosses north the short way", () => {
    expect(unwrapDeg(359.9, 0.1)).toBeCloseTo(360.1, 9);
    expect(unwrapDeg(0.1, 359.9)).toBeCloseTo(-0.1, 9);
  });

  it("keeps turning continuously over several turns", () => {
    let a = 0;
    for (const h of [90, 180, 270, 359, 10, 100, 200, 300, 20]) a = unwrapDeg(a, h);
    expect(a).toBe(20 + 720);
  });

  it("leaves a heading alone when it is already near the last one", () => {
    expect(unwrapDeg(45, 50)).toBe(50);
    expect(unwrapDeg(-30, 340)).toBe(-20);
  });
});
