import { describe, expect, it } from "vitest";
import { firstInt, readoutGroups, storyLines } from "./introStats";

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

  it("calls the zones research zones, as every other view does, and names each figure's payload", () => {
    const all = readoutGroups({ zones: 39, gridM: 463, cells: 1, windows: 1 }).flatMap((x) => x.items);
    expect(all[0].label).toBe("Research zones");
    expect(all.map((r) => r.source)).toEqual(["mars/sites", "mars_ez_tier1", "earth_global_screen", "earth_pool_463m"]);
  });

  it("keeps the on-screen labels short enough for one telemetry line and the full meaning as the term", () => {
    const all = readoutGroups({ zones: 1, gridM: 1, cells: 1, windows: 1 }).flatMap((x) => x.items);
    for (const r of all) {
      expect(r.label.length).toBeLessThanOrEqual(16);
      expect(r.term.length).toBeGreaterThan(r.label.length);
    }
  });
});

describe("storyLines", () => {
  const base = { jezeroObserved: 0.3132, cells: 249165, finding: { type: "named_leader", members: ["Atacama Yungay"], leader_S: 0.614 }, mrr: { baseline: 0.2997, oom: 0.9726 } };
  it("states problem, method and the verified Jezero finding from API figures", () => {
    const s = storyLines(base);
    expect(s.problem).toContain("69 % at Jezero");
    expect(s.method).toContain("all 249,165 Earth land cell");
    expect(s.finding).toBe("Jezero (landing site): Atacama Yungay, S 0.614, stable under all four orientations — research record over the fixed 230-window pool.");
    expect(s.caveat).toBe("Method benefit is shown on synthetic twins only (twin recovery MRR 0.30 → 0.97); real rankings are not field-validated.");
  });
  it("leaves out what the API has not given and never invents a finding", () => {
    const s = storyLines({ jezeroObserved: null, cells: null, finding: null, mrr: { baseline: null, oom: null } });
    expect(s.problem).not.toContain("%");
    expect(s.method).toContain("every Earth land cell");
    expect(s.finding).toBeNull();
    expect(storyLines({ ...base, finding: { type: "tied_set", members: ["a", "b"], leader_S: 0.7 } }).finding).toContain("a tie of 2 windows");
  });
});
