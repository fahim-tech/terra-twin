import { describe, expect, it } from "vitest";
import { G5 } from "../../lib/glossary";
import type { DiscoveryRun } from "../../services/gis";
import { liveCompareActive } from "../../store/app";
import { asMeasured, descriptorRows, liveBasis, livePair, liveRatioRows, liveTargets, liveVerdict, liveVersions, liveView } from "./live";

const feats = { mean_slope_deg: 0.23, hurst_H: 0.72 };
const cand = (id: string, lon: number, S: number | null, extra: Record<string, unknown> = {}) => ({
  id, lat: 20, lon, S, coverage: 1, origin: "global_tier1_shortlist", n_features_used: 2, S_by_rotation: [S, 0.7, null, 0.69],
  S_range_over_rotations: [0.69, 0.74], landcover: { gate: "pass", frac_bare_like: 1, frac_vegetated: 0, available: true },
  features: { mars: feats, earth_as_mola_would_see: { mean_slope_deg: 0.25, hurst_H: null }, earth_as_measured: { mean_slope_deg: 0.28 } },
  per_feature_similarity: { mean_slope_deg: 0.7, hurst_H: null },
  as_measured_comparison: { S: 0.55, rank: 14, label: "diagnostic baseline (Earth as measured); not the OOM result" },
  ...extra,
});
const run = (type: "tied_set" | "named_leader" | "no_convincing_analog", members: string[]): DiscoveryRun => ({
  run_id: "3e66a1ed234c", status: "ok",
  refinement: {
    contract_version: "gis-contract-1.0", method_version: "oom-1.0", processing_version: "terratwin-gis-0.1.0",
    target: { site: "InSight_Elysium", lat: 4.5, lon: 135.6, window_km: 50 }, representation: "mars_observation_space", mission: "rover_mobility", window_km: 50,
    operator: { status: "ok" }, landcover_gate: { mode: "exclude", bare_min: 0.5, veg_max: 0.2, status: "hypothesis" },
    decision: { type, members }, candidates: [cand("a", 64, 0.74), cand("b", -0.4, 0.73), cand("c", 24, 0.6)],
    number_of_windows_refined: 40, candidate_pool_scope: "global_tier1_shortlist", disclaimers: ["terrain_only"], limitations: ["Validation is synthetic."],
  },
}) as DiscoveryRun;

describe("live discovery comparison model", () => {
  it("follows the Live discovery tab only with a selected window", () => {
    expect(liveCompareActive({ liveOpen: true, liveRunId: "x", liveCandidate: "a" })).toBe(true);
    expect(liveCompareActive({ liveOpen: true, liveRunId: "x", liveCandidate: null })).toBe(false);
    expect(liveCompareActive({ liveOpen: false, liveRunId: "x", liveCandidate: "a" })).toBe(false);
  });

  it("finds the pair, or nothing for an unknown window", () => {
    expect(livePair(run("tied_set", ["a", "b"]), "zz")).toBeNull();
    expect(livePair(run("tied_set", ["a", "b"]), "a")?.c.id).toBe("a");
  });

  it("words a tie without a position and keeps the G5 label verbatim", () => {
    const v = liveVerdict(livePair(run("tied_set", ["a", "b"]), "b")!);
    expect(v.kind).toBe("tie_member");
    expect(v.headline).toBe("One of 2 tied windows (listed west to east)");
    expect(v.detail).toBe(G5.tied);
    expect(liveVerdict(livePair(run("named_leader", ["a"]), "a")!).detail).toBe(G5.leader);
    expect(liveVerdict(livePair(run("named_leader", ["a"]), "c")!).kind).toBe("not_member");
    expect(liveVerdict(livePair(run("no_convincing_analog", ["a"]), "a")!).kind).toBe("no_convincing");
  });

  it("reads sizes from the payload and names no toponym", () => {
    const t = liveTargets(livePair(run("tied_set", ["a"]), "a")!);
    expect(t.earth.km).toBe(50);
    expect(t.footprintLabel).toBe("50 km discovery window");
    expect(t.mars.name).toBe("InSight Elysium");
    expect(t.earth.name).toBe("Discovery window");
    expect(liveBasis(livePair(run("tied_set", ["a"]), "a")!)).toBe("Live discovery · 50 km windows · Earth as MOLA would observe it · 2/2 measures");
  });

  it("keeps missing values missing (never 0)", () => {
    const rows = descriptorRows(livePair(run("tied_set", ["a"]), "a")!.c);
    const h = rows.find((r) => r.key === "hurst_H")!;
    expect(h.oom).toBeNull();
    expect(h.measured).toBeNull();
    expect(h.s).toBeNull();
    expect(liveRatioRows(livePair(run("tied_set", ["a"]), "a")!.c).find((r) => r.key === "hurst_H")!.within).toBeNull();
  });

  it("carries versions, the diagnostic baseline and land cover from the payload", () => {
    const p = livePair(run("tied_set", ["a"]), "a")!;
    expect(liveVersions(p.r)).toEqual({ contract: "gis-contract-1.0", method: "oom-1.0", processing: "terratwin-gis-0.1.0" });
    expect(asMeasured(p.c)).toEqual({ S: 0.55, rank: 14, label: "diagnostic baseline (Earth as measured); not the OOM result" });
    const v = liveView(p);
    expect(v.tier).toBe(2);
    expect(v.score).toBe(0.74);
    expect(v.t2?.landcover?.frac_bare_like).toBe(1);
  });
});
