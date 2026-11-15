import { describe, expect, it } from "vitest";
import { pickActive } from "./scrollspy";

describe("dossier index scrollspy", () => {
  it("marks the last section whose heading has passed the reading line", () => {
    expect(pickActive([40, 600, 1400], 200, false)).toBe(0);
    expect(pickActive([-900, 120, 800], 200, false)).toBe(1);
    expect(pickActive([-2000, -1200, 150], 200, false)).toBe(2);
  });

  it("keeps the first section before any heading reaches the line", () => {
    expect(pickActive([700, 1500], 200, false)).toBe(0);
  });

  it("marks the last section at the end of the page, where short closing sections never reach the line", () => {
    expect(pickActive([-800, 260, 520], 200, true)).toBe(2);
    expect(pickActive([], 200, true)).toBe(-1);
  });
});
