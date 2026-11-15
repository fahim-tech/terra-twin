import { describe, expect, it } from "vitest";
import { G5 } from "../../lib/glossary";
import type { DiscoveryJob, DiscoveryRun } from "../../services/gis";
import { windowChoices } from "./DiscoveryAction";
import {
  cellLabel, decisionMembers, descriptorUnit, disclaimerText, elapsedText, formatValue, jobPhase, otherCandidates, scopeText, westToEast, windowsProgress,
} from "./discoveryModel";

const cand = (id: string, lon: number, S: number | null) => ({ id, lat: 10, lon, S, coverage: 1 });
const run = (type: "tied_set" | "named_leader" | "no_convincing_analog", members: string[]): DiscoveryRun => ({
  run_id: "r", status: "ok",
  refinement: {
    target: { lat: 0, lon: 0, window_km: 50 }, representation: "mars_observation_space", mission: "rover_mobility", window_km: 50,
    operator: { status: "ok" }, decision: { type, members },
    // Highest S is the easternmost: a tie must still come out west to east.
    candidates: [cand("east", 120, 0.74), cand("west", -60, 0.70), cand("mid", 10, 0.72), cand("other", 30, 0.5)],
    number_of_windows_refined: 4, candidate_pool_scope: "global_tier1_shortlist", disclaimers: [],
  },
});
const job = (p: Partial<DiscoveryJob>): DiscoveryJob => ({ job_id: "j", status: "running", state_label: "Running", run_id: null, cached: false, params: { lat: 0, lon: 0, mission: "m", n_refine: 20, window_km: 50 }, ...p });

describe("tied sets are unordered", () => {
  it("lists members west to east, never by S", () => {
    expect(decisionMembers(run("tied_set", ["east", "west", "mid"])).map((c) => c.id)).toEqual(["west", "mid", "east"]);
  });
  it("keeps members out of the context list", () => {
    expect(otherCandidates(run("tied_set", ["east", "west", "mid"])).map((c) => c.id)).toEqual(["other"]);
  });
  it("a decision that names no analog lists no members", () => {
    expect(decisionMembers(run("no_convincing_analog", ["east", "west"]))).toEqual([]);
    expect(otherCandidates(run("no_convincing_analog", ["east", "west"]))).toHaveLength(4);
  });
  it("westToEast does not mutate its input", () => {
    const xs = [{ lon: 5 }, { lon: -5 }];
    westToEast(xs);
    expect(xs[0].lon).toBe(5);
  });
});

describe("values", () => {
  it("never prints a missing value as 0", () => {
    expect(formatValue(null, "m")).toBe("—");
    expect(formatValue(undefined)).toBe("—");
    expect(formatValue(Number.NaN, "°")).toBe("—");
    expect(formatValue(0, "m")).toBe("0.0 m");
  });
  it("reads units from the payload, else from the key", () => {
    expect(descriptorUnit("mean_slope_deg", { mean_slope_deg: "deg" })).toBe("°");
    expect(descriptorUnit("hurst_H", { hurst_H: "1" })).toBe("");
    expect(descriptorUnit("rmsdev_926m")).toBe("m");
    expect(descriptorUnit("hurst_2pt")).toBe("");
  });
  it("labels a cell by its coordinates", () => expect(cellLabel(30.7624, 64.779)).toMatch(/30\.76° N.*64\.78° E/));
});

describe("scope and disclaimers", () => {
  it("words the candidate pool scope", () => {
    expect(scopeText("global_tier1_shortlist")).toBe("Global tier-1 shortlist");
    expect(scopeText("global_tier1_shortlist + research_pool_230 (fixed regression sample)")).toBe("Global tier-1 shortlist + research pool 230 (fixed regression sample)");
  });
  it("uses the G5 sentences verbatim", () => {
    expect(disclaimerText("synthetic_validation_only")).toBe(G5.validation);
    expect(disclaimerText("terrain_only")).toBe(G5.scope);
    expect(disclaimerText("footprint_dependent")).toBe(G5.scale);
    expect(disclaimerText("no_gravity_atmosphere_radiation")).toBe("No gravity atmosphere radiation");
  });
});

describe("job progress comes only from the payload", () => {
  it("reads k of n windows", () => {
    expect(windowsProgress(job({ progress: { stage: "windows", stage_label: "x", cells_scored: 1, windows_ready: 7, windows_target: 20 } }))).toEqual({ k: 7, n: 20, frac: 0.35 });
  });
  it("is null when the job does not say", () => {
    expect(windowsProgress(job({ progress: null }))).toBeNull();
    expect(windowsProgress(job({ progress: { stage: "tier1", stage_label: "x", cells_scored: 5, windows_ready: null, windows_target: null } }))).toBeNull();
  });
  it("maps states", () => {
    expect(jobPhase(job({ status: "pending" }))).toBe("queued");
    expect(jobPhase(job({ status: "paused" }))).toBe("busy");
    expect(jobPhase(job({ status: "blocked" }))).toBe("busy");
    expect(jobPhase(job({ status: "failed" }))).toBe("failed");
  });
  it("formats elapsed time", () => {
    expect(elapsedText(42)).toBe("42 s");
    expect(elapsedText(187)).toBe("3 min 07 s");
    expect(elapsedText(null)).toBe("—");
  });
  it("offers only the server's 20/40 choices", () => {
    expect(windowChoices([20, 40, 30])).toEqual([20, 40]);
    expect(windowChoices(undefined)).toEqual([]);
  });
});
