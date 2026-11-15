import { describe, expect, it } from "vitest";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { basisFor, compareTargets, earthName, poolKindLabel, verdictFor } from "./model";
import { deltaPos, groupRows, ratioPos, ratioRow, S_AT_TOLERANCE } from "./science";

describe("ratio chart geometry", () => {
  it("maps the 0.5×–2× log axis to 0..1 with 1× in the middle", () => {
    expect(ratioPos(0.5)).toBeCloseTo(0);
    expect(ratioPos(1)).toBeCloseTo(0.5);
    expect(ratioPos(2)).toBeCloseTo(1);
    expect(deltaPos(0)).toBeCloseTo(0.5);
    expect(deltaPos(0.3)).toBeCloseTo(1);
  });

  it("draws the band at [1/(1+τ), 1+τ] and agrees with the kernel's 1/e rule", () => {
    // mean slope τ = 0.3. Kernel: s = exp(-|ln r| / ln(1+τ)).
    const tau = 0.3;
    const s = (r: number) => Math.exp(-Math.abs(Math.log(r)) / Math.log(1 + tau));
    const inside = ratioRow("mean_slope_deg", 2, 2 * 1.29, s(1.29));
    const outside = ratioRow("mean_slope_deg", 2, 2 * 1.31, s(1.31));
    expect(inside.within).toBe(true);
    expect(outside.within).toBe(false);
    expect(inside.band[0]).toBeCloseTo(ratioPos(1 / 1.3));
    expect(inside.band[1]).toBeCloseTo(ratioPos(1.3));
    expect(s(1.3)).toBeCloseTo(S_AT_TOLERANCE);
  });

  it("uses a linear Δ axis with a ±0.08 band for Hurst", () => {
    const r = ratioRow("hurst_2pt", 0.64, 0.66, 0.78);
    expect(r.transform).toBe("linear");
    expect(r.value).toBeCloseTo(0.02);
    expect(r.band[0]).toBeCloseTo(deltaPos(-0.08));
    expect(r.relation).toBe("+0.02 on Earth");
  });

  it("pins values beyond the axis to its edge and never invents missing values", () => {
    const far = ratioRow("relative_relief_m", 100, 900, 0.01);
    expect(far.pos).toBe(1);
    expect(far.clipped).toBe(true);
    const missing = ratioRow("relative_relief_m", null, 900, null);
    expect(missing.pos).toBeNull();
    expect(missing.within).toBeNull();
    const g = groupRows([far, missing, ratioRow("hurst_2pt", 0.6, 0.6, 1)]);
    expect(g.different).toHaveLength(1);
    expect(g.missing).toHaveLength(1);
    expect(g.similar).toHaveLength(1);
  });
});

const t2cand = (id: string, S: number): CandidateView => ({
  id: `t2:${id}`, tier: 2, lat: -24.09, lon: -69.99, label: id, score: S, coverage: 1,
  t2: { id, lat: -24.09, lon: -69.99, window_km: 50, S, coverage: 1 },
});

function search(decision: AnalogSearch["tier2"]["decision"]): AnalogSearch {
  return {
    id: "x", status: "available",
    request: { lat: 17.6756, lon: 77.0127, mission: "landing_site", footprint_km: 25 },
    mars: { status: "available", site: "Jezero", site_name: "Jezero", coordinate: { lat: 17.6756, lon: 77.0127 }, footprint_km: 25, tier1_features: [], ez_features: [], unavailable_factors: [], observation_support: null, quality_flags: [], unavailable: null },
    tier1: null,
    tier2: {
      tier: 2, source: "research_record", target: { site: "Jezero", lat: 17.6756, lon: 77.0127, window_km: 50, observed_fraction_native: 0.3 },
      representation: "mars_observation_space", operator: { status: "ok" }, landcover_gate: null, decision, candidates: [],
      as_measured_baseline: null, candidate_pool: null, validation_status: "synthetic_twins_only", disclaimers: [], live_refinement: { status: "unavailable", missing_inputs: [] },
    },
  } as unknown as AnalogSearch;
}

describe("verdict", () => {
  it("names a stable leader with the verbatim G5 label", () => {
    const v = verdictFor(search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: G5.leader }), t2cand("Atacama Yungay", 0.614));
    expect(v.kind).toBe("leader");
    expect(v.detail).toBe(G5.leader);
  });

  it("never presents a tie member as a winner", () => {
    const s = search({ type: "tied_set", members: ["rand_d8_233", "rand_d8_217", "rand_d8_224"], rotations_checked: 4, label: G5.tied });
    const v = verdictFor(s, t2cand("rand_d8_217", 0.703));
    expect(v.kind).toBe("tie_member");
    // Numbered in the shared unordered display order (here by name: no located candidates), never by S.
    expect(v.headline).toBe("Member of a tie (1 of 3)");
    expect(v.headline.toLowerCase()).not.toContain("leader");
    expect(v.detail).toBe(G5.tied);
  });

  it("labels tier-1 cells as screening, not a decision", () => {
    const c: CandidateView = { id: "t1:gmted25k:1", tier: 1, rank: 3, lat: 0, lon: 0, label: "Cell 1", score: 0.9, coverage: 1 };
    const v = verdictFor(search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null }), c);
    expect(v.kind).toBe("screening");
    expect(v.headline).toContain("not a decision");
    expect(basisFor(c)).toContain("Global screen");
    // No cell size in the record → no size in the basis line (never a default).
    expect(basisFor(c)).not.toMatch(/\d+ km/);
    expect(v.detail).not.toMatch(/\d+ km/);
  });

  it("does not hide abstention", () => {
    const v = verdictFor(search({ type: "insufficient_evidence", members: [], rotations_checked: 0, label: null }), t2cand("x", 0));
    expect(v.kind).toBe("insufficient");
    expect(v.headline).toBe("Not enough evidence");
  });
});

describe("targets", () => {
  it("binds Mars to the research target and both footprints to the 50 km window", () => {
    const s = search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null });
    const t = compareTargets(s, t2cand("Atacama Yungay", 0.614))!;
    expect(t.mars.name).toBe("Jezero");
    expect(t.mars.km).toBe(50);
    expect(t.earth.km).toBe(50);
    expect(basisFor(t2cand("Atacama Yungay", 0.614))).toBe("Research comparison · Earth as MOLA would observe it · 8/8 measures");
  });

  it("names random research windows without inventing a place", () => {
    expect(earthName(t2cand("rand_d8_233", 0.7)).name).toBe("Research window 233");
  });
});

describe("names and footprints", () => {
  it("never prints a raw window id for the stable leader", () => {
    const s = search({ type: "named_leader", members: ["rand_d8_233"], rotations_checked: 4, label: G5.leader });
    const v = verdictFor(s, t2cand("rand_d3_12", 0.5));
    expect(v.kind).toBe("not_member");
    expect(v.detail).toContain("Research window 233");
    expect(v.detail).not.toContain("rand_");
  });

  it("explains the pool kind of named controls in plain words", () => {
    expect(poolKindLabel("documented analog (non-terrain)")).toContain("reasons other than its terrain");
    expect(poolKindLabel("negative control")).toContain("negative control");
    expect(poolKindLabel(null)).toBeNull();
  });

  it("labels each square with the same size its footprint line states", () => {
    const s = search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null });
    const t2 = compareTargets(s, t2cand("Atacama Yungay", 0.614))!;
    expect(t2.mars.size).toBe("50 km");
    expect(t2.earth.size).toBe("50 km");
    expect(t2.earth.footprint.startsWith(t2.earth.size)).toBe(true);
    // An approximate screening cell (25.07 km N–S, 24.74 km E–W): one nominal figure everywhere, never "25.1 km".
    const cell = {
      id: "t1:gmted25k:207754", tier: 1, rank: 1, lat: 52.787, lon: -124.883, label: "Cell at 52.79° N 124.88° W", score: 0.909, coverage: 1,
      t1: { region_id: "gmted25k:207754", known_analog: { status: "none", name: null }, footprint: { kind: "approx_cell", cell_km_ns: 25.06776, cell_km_ew: 24.73774, bbox: [0, 0, 1, 1] } },
    } as unknown as CandidateView;
    const t1 = compareTargets(s, cell)!;
    expect(t1.earth.size).toBe("25 km");
    expect(t1.mars.size).toBe("25 km");
    expect(t1.earth.footprint).toBe("25 km screening cell");
    expect(t1.earth.km).toBeCloseTo(25.06776);
  });

  it("does not call the Mars square the compared cell for a tier-1 zone target", () => {
    const s = search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null });
    const c = {
      id: "t1:gmted25k:1", tier: 1, rank: 1, lat: 0, lon: 0, label: "Cell 1", score: 0.9, coverage: 1,
      t1: { region_id: "gmted25k:1", footprint: { kind: "cell", cell_km_ns: 25, cell_km_ew: 25, bbox: [0, 0, 1, 1] } },
    } as unknown as CandidateView;
    const t = compareTargets(s, c)!;
    expect(t.earth.footprint).toBe("25 km screening cell");
    expect(t.mars.footprint).toContain("zone median");
  });
});
