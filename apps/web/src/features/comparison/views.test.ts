import { describe, expect, it } from "vitest";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { tieScoreRange, windowLabel } from "../report/model";
import { compareTargets, documentationLine, molaGridText, poolKindLabel, poolKindShort, recordDigits, robustness } from "./model";
import { fmtNum } from "../../components/relief/reliefMath";

type Decision = AnalogSearch["tier2"]["decision"];

function search(decision: Decision, extra: { diagnostics?: Record<string, unknown>; baseline?: string | null; candidates?: { id: string; S: number | null }[]; t1?: unknown[] } = {}): AnalogSearch {
  return {
    id: "x", status: "available",
    request: { lat: 17.6756, lon: 77.0127, mission: "landing_site", footprint_km: 25 },
    mars: { status: "available", site: "Jezero", site_name: "Jezero", coordinate: { lat: 17.6756, lon: 77.0127 }, footprint_km: 25, tier1_features: extra.t1 ?? [], ez_features: [], unavailable_factors: [], observation_support: null, quality_flags: [], unavailable: null },
    tier1: null,
    tier2: {
      tier: 2, source: "research_record", target: { site: "Jezero", lat: 17.6756, lon: 77.0127, window_km: 50, observed_fraction_native: 0.3 },
      representation: "mars_observation_space", operator: { status: "ok" }, landcover_gate: null, decision,
      candidates: (extra.candidates ?? []).map((c) => ({ id: c.id, S: c.S, lat: 0, lon: 0 })),
      as_measured_baseline: extra.baseline ? { leader: extra.baseline, S: 0.5, coverage: 1, lat: 0, lon: 0, label: "x" } : null,
      candidate_pool: null, validation_status: "synthetic_twins_only", disclaimers: [], live_refinement: { status: "unavailable", missing_inputs: [] },
      diagnostics: extra.diagnostics ?? null,
    },
  } as unknown as AnalogSearch;
}

const t2 = (id: string, kind: string, lat = -24.09, lon = -69.99): CandidateView =>
  ({ id: `t2:${id}`, tier: 2, label: id, lat, lon, score: 0.6, coverage: 1, rank: null, t2: { id, kind, window_km: 50, lat, lon } } as unknown as CandidateView);

const DIAG = {
  footprint_leader_same_50_vs_25km: false, footprint_spearman_50_vs_25km: 0.81,
  leader_changed_vs_baseline: true, spearman_baseline_vs_oom: 0.76, top10_overlap_baseline_vs_oom: 2,
};

describe("robustness wording", () => {
  it("never says 'leader' for a tied set and words the diagnostics for the terrain-only ranking", () => {
    const r = robustness(search({ type: "tied_set", members: ["rand_d8_233", "rand_d8_217"], rotations_checked: 4, label: null }, { diagnostics: DIAG, baseline: "rand_d8_217" }))!;
    const text = r.lines.map((l) => `${l.text} ${l.figure ?? ""}`).join(" | ");
    expect(text).not.toMatch(/leader/i);
    expect(text).toContain("Terrain-only research ranking");
    expect(text).toContain("Spearman 0.81");
    expect(text).not.toContain("ρ");
    expect(r.lines.find((l) => l.key === "record")!.text).toContain("is one of the tied windows");
    expect(r.note).toContain("before any land-cover exclusion");
  });

  it("derives the record's own leader agreement instead of the ungated flag", () => {
    // The ungated diagnostic says the leader changed; this (gated) record names the comparator's leader itself.
    const r = robustness(search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null }, { diagnostics: DIAG, baseline: "Atacama Yungay" }))!;
    expect(r.lines[0].text).toBe("This record: the same window leads with and without observation matching");
    expect(r.lines.some((l) => /changes the leader/.test(l.text))).toBe(false);
    expect(r.lines.find((l) => l.key === "footprint")!.caution).toBe(true);
  });

  it("returns null with nothing to say", () => {
    expect(robustness(search({ type: "no_convincing_analog", members: [], rotations_checked: 4, label: null }))).toBeNull();
  });
});

describe("grid and precision from the record", () => {
  it("reads the MOLA grid spacing from the Mars descriptors, with a plain fallback", () => {
    const d: Decision = { type: "named_leader", members: ["A"], rotations_checked: 4, label: null };
    expect(molaGridText(search(d, { t1: [{ native_resolution_m: 463.0935 }] }))).toBe("the 463 m MOLA grid");
    expect(molaGridText(search(d))).toBe("the MOLA grid");
  });

  it("prints coordinates at the precision the record carries, capped at 3", () => {
    expect(recordDigits(-24.09, -69.99)).toBe(2);
    expect(recordDigits(17.6756, 77.0127)).toBe(3);
    expect(recordDigits(-24.1, -70)).toBe(1);
  });

  it("prints elevations in whole metres with a true minus (the one precision every relief key uses)", () => {
    expect(fmtNum(759.3)).toBe("759");
    expect(fmtNum(-2918.4)).toBe("−2,918");
  });
});

describe("pool names", () => {
  it("keeps the non-terrain qualifier in the short plate form", () => {
    expect(poolKindShort("documented analog (non-terrain)")).toContain("non-terrain");
    expect(poolKindShort("negative control")).toContain("negative");
    expect(poolKindLabel("random")).toBe("Stratified random");
    const t = compareTargets(search({ type: "named_leader", members: ["Atacama Yungay"], rotations_checked: 4, label: null }), t2("Atacama Yungay", "documented analog (non-terrain)"))!;
    expect(t.earth.subShort).toBe("Named control · analog for non-terrain reasons");
  });

  it("states a named control's documentation without contradicting its kind", () => {
    expect(documentationLine(t2("Atacama Yungay", "documented analog (non-terrain)"))).toContain("named control (documented analog)");
    expect(documentationLine(t2("rand_d8_233", "random"))).toContain("Not in the reference set; novelty is not assessed");
  });

  it("names a pool window the same way in the report", () => {
    expect(windowLabel("rand_d8_217")).toBe("Window 217 · stratified random · roughness decile 8");
  });
});

describe("tie score range", () => {
  it("gives one range for the set and nothing for a named leader", () => {
    const members = ["rand_d8_233", "rand_d8_217", "rand_d8_224"];
    const cands = [{ id: "rand_d8_233", S: 0.718 }, { id: "rand_d8_217", S: 0.703 }, { id: "rand_d8_224", S: 0.646 }, { id: "other", S: 0.9 }];
    expect(tieScoreRange(search({ type: "tied_set", members, rotations_checked: 4, label: null }, { candidates: cands }))).toEqual({ lo: 0.646, hi: 0.718 });
    expect(tieScoreRange(search({ type: "named_leader", members: ["rand_d8_233"], rotations_checked: 4, label: null }, { candidates: cands }))).toBeNull();
  });
});
