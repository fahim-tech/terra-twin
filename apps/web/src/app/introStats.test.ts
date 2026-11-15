import { describe, expect, it } from "vitest";
import { firstInt, readoutGroups } from "./introStats";

describe("intro figures", () => {
  it("reads the first integer from a dataset text, and nothing when it is absent", () => {
    expect(firstInt("249,165 land cells, lat -89.5..83.6", /([\d,]+)\s+land cells/)).toBe(249165);
    expect(firstInt("463 m MOLA grid, 25 km cells", /(\d+)\s*m MOLA/)).toBe(463);
    expect(firstInt("no figure here", /([\d,]+)\s+land cells/)).toBeNull();
    expect(firstInt(null, /(\d+)/)).toBeNull();
    expect(firstInt(undefined, /(\d+)/)).toBeNull();
  });

  it("groups the figures by planet and keeps missing values missing, never 0", () => {
    const g = readoutGroups({ zones: 39, gridM: null, cells: 249165, windows: null });
    expect(g.map((x) => x.planet)).toEqual(["mars", "earth"]);
    const all = g.flatMap((x) => x.items);
    expect(all.map((r) => r.value)).toEqual([39, null, 249165, null]);
    expect(all.find((r) => r.label === "MOLA grid")?.unit).toBe("m");
  });

  it("keeps the on-screen labels short enough for one telemetry line and the full meaning as the term", () => {
    const all = readoutGroups({ zones: 1, gridM: 1, cells: 1, windows: 1 }).flatMap((x) => x.items);
    for (const r of all) {
      expect(r.label.length).toBeLessThanOrEqual(16);
      expect(r.term.length).toBeGreaterThan(r.label.length);
    }
  });
});
