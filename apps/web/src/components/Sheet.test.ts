import { describe, expect, it } from "vitest";
import { cleanCut, cleanCutShowing, project, rubberband } from "./Sheet";

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

describe("cleanCut", () => {
  const rows = [{ top: 0, bottom: 20 }, { top: 32, bottom: 52 }, { top: 88, bottom: 132 }];
  it("moves a detent line up out of a row it would slice", () => {
    expect(cleanCut(rows, 112, 72)).toBe(88);
  });
  it("keeps a line that already falls between rows", () => {
    expect(cleanCut(rows, 70, 40)).toBe(70);
  });
  it("shows a sliced figure whole when a clean line lies below, before hiding it", () => {
    const figs = [{ top: 0, bottom: 20 }, { top: 40, bottom: 120 }];
    expect(cleanCutShowing(figs, 80, 200, 0)).toBe(120);
    expect(cleanCutShowing(figs, 80, 100, 0)).toBe(40);
  });
  it("gives up at the floor and keeps the target when every line cuts a row", () => {
    expect(cleanCut([{ top: 0, bottom: 300 }], 150, 100)).toBe(150);
  });
});
