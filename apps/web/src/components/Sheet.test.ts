import { describe, expect, it } from "vitest";
import { project, rubberband } from "./Sheet";

describe("sheet physics", () => {
  it("projects momentum like scroll deceleration", () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(499, 0); // 1000 px/s → ~499 px with d = 0.998
    expect(project(-1000)).toBeCloseTo(-499, 0);
  });
  it("rubber-bands with diminishing returns", () => {
    const a = rubberband(50, 800), b = rubberband(500, 800);
    expect(a).toBeLessThan(50);
    expect(b).toBeLessThan(500);
    expect(b / 500).toBeLessThan(a / 50);
  });
});
