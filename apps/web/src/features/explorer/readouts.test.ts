import { describe, expect, it } from "vitest";
import {
  availabilityItems, baselineFromExplanation, CALLOUT_MIN_W, calloutGeometry, graticulePaths, gridMetres, LEADER_DX, nextActive, orthographic,
  placeCallout, revealDelta, scalesFromEvidence,
} from "./readouts";

describe("orthographic", () => {
  it("puts the view centre at the disc centre and the limb at the radius", () => {
    expect(orthographic(10, 40, 10, 40, 20)).toMatchObject({ x: 0, front: true });
    expect(orthographic(10, 40, 10, 40, 20).y).toBeCloseTo(0);
    const east = orthographic(0, 90, 0, 0, 20);
    expect(east.x).toBeCloseTo(20);
    expect(east.y).toBeCloseTo(0);
    expect(orthographic(90, 0, 0, 0, 20).y).toBeCloseTo(20);
  });
  it("marks the far hemisphere", () => {
    expect(orthographic(0, 180, 0, 0, 20).front).toBe(false);
    expect(orthographic(0, -100, 0, 0, 20).front).toBe(false);
    expect(orthographic(-60, 10, 0, 10, 20).front).toBe(true);
  });
});

describe("graticulePaths", () => {
  it("draws only near-side lines, all inside the disc", () => {
    const paths = graticulePaths(20, 77, 23);
    expect(paths.length).toBeGreaterThan(5);
    for (const d of paths) {
      const nums = d.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
      for (let i = 0; i < nums.length; i += 2) expect(Math.hypot(nums[i], nums[i + 1])).toBeLessThanOrEqual(23.01);
    }
  });
});

describe("scalesFromEvidence", () => {
  it("reads cell, window and zone counts from the evidence coverage", () => {
    const ev = { coverage: { tier1: { n_cells: 249165, cell_km: 25 }, tier2: { n_windows: 230, window_km: 50 }, mars: { n_targets: 39 } } };
    expect(scalesFromEvidence(ev)).toEqual({ cellKm: 25, windowKm: 50, zones: 39 });
  });
  it("never invents a default for missing or malformed values", () => {
    expect(scalesFromEvidence(undefined)).toEqual({ cellKm: null, windowKm: null, zones: null });
    expect(scalesFromEvidence({ coverage: { tier1: { cell_km: "25" }, tier2: { window_km: 0 }, mars: null } }))
      .toEqual({ cellKm: null, windowKm: null, zones: null });
    expect(scalesFromEvidence({ coverage: [] })).toEqual({ cellKm: null, windowKm: null, zones: null });
  });
});

describe("gridMetres", () => {
  it("rounds a shared grid spacing", () => {
    expect(gridMetres([{ native_resolution_m: 463.0935 }, { native_resolution_m: 463.2 }])).toBe(463);
  });
  it("is null when absent or when the measures disagree", () => {
    expect(gridMetres([])).toBeNull();
    expect(gridMetres([{ native_resolution_m: null }, {}])).toBeNull();
    expect(gridMetres([{ native_resolution_m: 463 }, { native_resolution_m: 926 }])).toBeNull();
  });
});

describe("baselineFromExplanation", () => {
  it("takes the quoted baseline from the API text", () => {
    expect(baselineFromExplanation("Height change between points ~1.85 km apart (N-S, directional screen statistic).")).toBe("1.85 km");
    expect(baselineFromExplanation("points ~926 m apart")).toBe("926 m");
  });
  it("is null when the text quotes none", () => {
    expect(baselineFromExplanation("Average terrain inclination at the stated baseline.")).toBeNull();
    expect(baselineFromExplanation(null)).toBeNull();
  });
});

describe("availabilityItems", () => {
  const base = { tier1_features: [{ value: 2.7 }], ez_features: [], observation_support: { observed_fraction: 0.31 } };
  it("orders terrain, observation support, then known factors, then unknown ones in API order", () => {
    const items = availabilityItems({
      ...base,
      unavailable_factors: [
        { key: "solar_energy", label: "Solar energy", value: null },
        { key: "zz_new", label: "New factor", value: 3 },
        { key: "thermal_inertia", label: "Thermal inertia", value: null },
        { key: "aa_new", label: "Other factor", value: null },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(["terrain", "observation_support", "thermal_inertia", "solar_energy", "zz_new", "aa_new"]);
    expect(items.map((i) => i.label)).toEqual(["Terrain", "Observation support", "Thermal", "Solar", "New factor", "Other factor"]);
    expect(items.map((i) => i.on)).toEqual([true, true, false, false, true, false]);
  });
  it("marks terrain and observation support off when the API has no values", () => {
    const items = availabilityItems({ tier1_features: [{ value: null }], ez_features: [{ value: null }], observation_support: null, unavailable_factors: [] });
    expect(items).toEqual([{ key: "terrain", label: "Terrain", on: false }, { key: "observation_support", label: "Observation support", on: false }]);
  });
});

describe("nextActive", () => {
  it("steps and stops at the ends", () => {
    expect(nextActive("ArrowDown", 0, 3)).toBe(1);
    expect(nextActive("ArrowDown", 2, 3)).toBe(2);
    expect(nextActive("ArrowUp", 0, 3)).toBe(0);
    expect(nextActive("Home", 2, 3)).toBe(0);
    expect(nextActive("End", 0, 3)).toBe(2);
    expect(nextActive("PageDown", 1, 30)).toBe(9);
    expect(nextActive("PageUp", 3, 30)).toBe(0);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextActive("a", 1, 3)).toBeNull();
    expect(nextActive("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("revealDelta", () => {
  const view = { top: 100, bottom: 300 };
  it("is 0 for a visible row and moves just enough otherwise", () => {
    expect(revealDelta({ top: 150, bottom: 180 }, view, 12)).toBe(0);
    expect(revealDelta({ top: 290, bottom: 320 }, view, 12)).toBe(32);
    expect(revealDelta({ top: 90, bottom: 120 }, view, 12)).toBe(-22);
  });
});

describe("calloutGeometry", () => {
  it("runs up and right for a north-east label, starting on the mark's edge", () => {
    const g = calloutGeometry({ x: 100, y: 200 }, "ne", 38, { square: 4.5 });
    expect(g.sx).toBe(1);
    expect(g.sy).toBe(-1);
    expect(g.end).toEqual({ x: 100 + LEADER_DX, y: 162 });
    expect(g.elbow.y).toBe(162);
    // The start lies on the square mark's boundary (|dy| = half size, since the leg is steeper than 45°).
    expect(Math.abs(g.start.y - 200)).toBeCloseTo(4.5);
    expect(g.start.x).toBeGreaterThan(100);
  });
  it("mirrors for a south-west label", () => {
    const g = calloutGeometry({ x: 100, y: 200 }, "sw", 60);
    expect(g.end).toEqual({ x: 100 - LEADER_DX, y: 260 });
    expect(g.start.x).toBeLessThan(100);
    expect(g.start.y).toBeGreaterThan(200);
  });
  it("starts outside a round globe marker at its radius", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "se", 38, { circle: 12 });
    expect(Math.hypot(g.start.x, g.start.y)).toBeCloseTo(12);
    expect(g.start.x).toBeGreaterThan(0);
    expect(g.start.y).toBeGreaterThan(0);
  });
  it("starts on the edge of a footprint square drawn around the point", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "ne", 60, { square: 30 });
    expect(Math.max(Math.abs(g.start.x), Math.abs(g.start.y))).toBeCloseTo(30);
  });
  it("never starts past the elbow, however large the mark", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "ne", 38, { square: 80 });
    expect(Math.abs(g.start.y)).toBeLessThan(Math.abs(g.elbow.y));
    expect(Math.abs(g.start.x)).toBeLessThan(Math.abs(g.elbow.x));
  });
});

describe("placeCallout", () => {
  const desktop = { left: 0, top: 56, right: 1036, bottom: 848 }; // 1440 frame less a 404 px inspector
  const dy = { n: 38, s: 38 };
  it("keeps the preferred side when the label has room there", () => {
    const p = placeCallout({ x: 524, y: 474 }, "ne", desktop, dy);
    expect(p.side).toBe("ne");
    expect(p.maxW).toBe(1036 - 8 - (524 + LEADER_DX + 2));
  });
  it("moves a label away from the inspector instead of sliding under it", () => {
    expect(placeCallout({ x: 1000, y: 474 }, "ne", desktop, dy).side).toBe("nw");
    expect(placeCallout({ x: 900, y: 474 }, "ne", desktop, dy).side).toBe("nw");
  });
  it("on a phone takes the wider side and caps the width to the room left, so long names wrap", () => {
    const phone = { left: 0, top: 56, right: 330, bottom: 380 }; // 390 frame less the nav column and sheet
    const p = placeCallout({ x: 195, y: 272 }, "ne", phone, { n: 60, s: 60 });
    expect(p.side).toBe("nw");
    expect(p.maxW).toBe(195 - LEADER_DX - 2 - 8);
  });
  it("never makes a label narrower than its coordinate line", () => {
    expect(placeCallout({ x: 60, y: 474 }, "nw", { ...desktop, right: 140 }, dy).maxW).toBe(CALLOUT_MIN_W);
  });
  it("flips north/south only when the preferred shelf leaves the bounds and the other side leaves them less", () => {
    expect(placeCallout({ x: 524, y: 100 }, "ne", desktop, dy)).toMatchObject({ side: "se", dy: 38 });
    expect(placeCallout({ x: 524, y: 820 }, "sw", desktop, dy).side).toBe("nw");
    expect(placeCallout({ x: 524, y: 474 }, "ne", desktop, dy)).toMatchObject({ side: "ne", dy: 38 });
  });
  it("shortens the reach to stay inside when neither shelf fits, but never below the minimum", () => {
    // Phone: the zone outline needs 131 px either way; north overflows by 5 px, south by more.
    const phone = { left: 0, top: 56, right: 330, bottom: 380 };
    const p = placeCallout({ x: 195, y: 220 }, "ne", phone, { n: 131, s: 131 });
    expect(p.side).toBe("nw");
    expect(p.dy).toBe(131 - 5);
    expect(placeCallout({ x: 195, y: 120 }, "ne", phone, { n: 131, s: 400 }, { minDy: 50 })).toMatchObject({ side: "nw", dy: 50 });
    // …and takes the other shelf when that one overflows less.
    expect(placeCallout({ x: 195, y: 120 }, "ne", phone, { n: 131, s: 300 })).toMatchObject({ side: "sw", dy: 300 - 78 });
  });
});
