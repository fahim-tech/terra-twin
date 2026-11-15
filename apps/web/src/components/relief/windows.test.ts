import { describe, expect, it } from "vitest";
import { candidateList, selectedCandidate } from "../../features/analogs/candidates";
import { resolveCandidate } from "../../features/report/model";
import type { AnalogSearch } from "../../types/contracts";
import { reliefWindowId } from "./windows";

/** Pool ids as `GET /api/earth/pool` publishes them: random windows and named controls (spaces and "#" included). */
const POOL = [{ id: "rand_d8_233" }, { id: "rand_d8_217" }, { id: "Atacama Yungay" }, { id: "Arcadia gated #1" }];

const t2 = (id: string, lon: number) => ({ id, lat: 10, lon, kind: "random", window_km: 50, S: 0.7, coverage: 1 });
const search = {
  id: "a1",
  status: "available",
  mars: { site: "Jezero" },
  tier1: { candidates: [{ region_id: "rand_d8_233", lat: 1, lon: 2, rank: 1, similarity: 0.5, coverage: 1, footprint: { bbox: [0, 0, 1, 1] }, known_analog: { name: null } }] },
  tier2: {
    decision: { type: "tied_set", members: ["rand_d8_233", "Arcadia gated #1"] },
    candidates: [t2("rand_d8_233", 33.7), t2("Arcadia gated #1", -171.2), t2("rand_d9_999", 12)],
  },
} as unknown as AnalogSearch;

describe("relief window identity", () => {
  it("uses the record's own research-window id, exactly as the pool lists it", () => {
    expect(reliefWindowId({ tier: 2, t2: { id: "rand_d8_233" } }, POOL)).toBe("rand_d8_233");
    expect(reliefWindowId({ tier: 2, t2: { id: "Arcadia gated #1" } }, POOL)).toBe("Arcadia gated #1");
    expect(reliefWindowId({ tier: 2, t2: { id: "Atacama Yungay" } }, POOL)).toBe("Atacama Yungay");
  });

  it("maps a selected comparison candidate (CandidateView) by its record id, not its prefixed key or label", () => {
    const c = selectedCandidate(search, "t2:Arcadia gated #1")!;
    expect(c.id).toBe("t2:Arcadia gated #1");
    expect(reliefWindowId(c, POOL)).toBe("Arcadia gated #1");
    const w = candidateList(search).find((x) => x.id === "t2:rand_d8_233")!;
    expect(w.label).toBe("Window 233 · roughness decile 8");
    expect(reliefWindowId(w, POOL)).toBe("rand_d8_233");
  });

  it("maps a report candidate the same way", () => {
    expect(reliefWindowId(resolveCandidate(search, "t2:rand_d8_233"), POOL)).toBe("rand_d8_233");
    expect(reliefWindowId(resolveCandidate(search, "Arcadia gated #1"), POOL)).toBe("Arcadia gated #1"); // legacy bare id
  });

  it("gives a screening cell no relief, even when its id looks like a pool window", () => {
    const cell = selectedCandidate(search, "t1:rand_d8_233")!;
    expect(cell.tier).toBe(1);
    expect(reliefWindowId(cell, POOL)).toBeNull();
    expect(reliefWindowId(resolveCandidate(search, "t1:rand_d8_233"), POOL)).toBeNull();
  });

  it("shows nothing for a window the pool does not list, or before the pool is known", () => {
    expect(reliefWindowId({ tier: 2, t2: { id: "rand_d9_999" } }, POOL)).toBeNull();
    expect(reliefWindowId({ tier: 2, t2: { id: "rand_d8_233" } }, undefined)).toBeNull();
    expect(reliefWindowId({ tier: 2, t2: { id: "rand_d8_233" } }, null)).toBeNull();
    expect(reliefWindowId(null, POOL)).toBeNull();
    expect(reliefWindowId({ tier: 2 }, POOL)).toBeNull();
  });

  it("never matches loosely: no case folding, trimming, labels or prefixes", () => {
    for (const id of ["arcadia gated #1", "Arcadia gated #1 ", "Arcadia_gated_#1", "Window 233", "t2:rand_d8_233", "rand_d8_23"]) {
      expect(reliefWindowId({ tier: 2, t2: { id } }, POOL)).toBeNull();
    }
  });
});
