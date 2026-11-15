import { describe, expect, it } from "vitest";
import { boundsOf, descriptorCounts, groupNearTop, measuresOf, t1DescriptorCount, t2DescriptorCount, T1_MEASURES, T2_MEASURES, tierOf, unorderedMembers } from "./candidates";
import evidence from "../evidence/evidence.fixture.json";

describe("boundsOf", () => {
  it("frames scattered points with the shortest longitude arc", () => {
    const b = boundsOf([{ lat: -10.5, lon: 33.7 }, { lat: 32.8, lon: 93.1 }, { lat: 13.7, lon: 99.2 }])!;
    expect(b).toEqual({ west: 33.7, south: -10.5, east: 99.2, north: 32.8 });
  });
  it("crosses the antimeridian instead of spanning the globe", () => {
    const b = boundsOf([{ lat: 0, lon: 170 }, { lat: 5, lon: -175 }])!;
    expect(b.west).toBe(170);
    expect(b.east).toBe(-175);
  });
  it("uses cell boxes when present", () => {
    const b = boundsOf([{ lat: 1, lon: 1, bbox: [0.5, 0.8, 1.5, 1.2] }])!;
    expect(b).toEqual({ west: 0.5, south: 0.8, east: 1.5, north: 1.2 });
  });
  it("returns null for nothing to frame", () => expect(boundsOf([])).toBeNull());
});

describe("groupNearTop", () => {
  it("groups cells within 0.05 of the top as not ranked against each other", () => {
    const rows = [{ score: 0.909 }, { score: 0.87 }, { score: 0.859 }, { score: 0.85 }, { score: null }];
    const { near, rest } = groupNearTop(rows, 0.909);
    expect(near.map((r) => r.score)).toEqual([0.909, 0.87, 0.859]);
    expect(rest.map((r) => r.score)).toEqual([0.85, null]);
  });
});

describe("ties and measures", () => {
  it("orders tied members geographically, not by score", () => {
    const m = unorderedMembers([{ id: "a", lon: 99, S: 0.7 }, { id: "b", lon: 33, S: 0.6 }]);
    expect(m.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("never invents a measure count", () => {
    expect(measuresOf(1, 8)).toBe(8);
    expect(measuresOf(0.875, 8)).toBe(7);
    expect(measuresOf(null, 8)).toBeNull();
  });
  it("reads the descriptor counts from the payloads, never a default", () => {
    // Tier 2: the evidence record's method lists the descriptors S is computed from.
    expect(t2DescriptorCount(evidence)).toBe((evidence as { method: { features: string[] } }).method.features.length);
    expect(t2DescriptorCount(evidence)).toBe(T2_MEASURES); // the deprecated constant still agrees with the record
    expect(t2DescriptorCount(null)).toBeNull();
    expect(t2DescriptorCount({ method: { features: [] } })).toBeNull();
    // Tier 1: one weight per global-screen descriptor.
    const weights = { slope_mean: 1, slope_p90: 1, relief: 1, roughness: 1, curvature: 1, tpi: 1, hurst: 1 };
    expect(t1DescriptorCount(weights)).toBe(7);
    expect(t1DescriptorCount(weights)).toBe(T1_MEASURES);
    expect(t1DescriptorCount({})).toBeNull();
    expect(t1DescriptorCount(null)).toBeNull();
    expect(descriptorCounts(null, null)).toEqual({ t1: null, t2: null });
    expect(descriptorCounts({ tier1: { weights: { a: 1, b: 2 } } } as never, evidence)).toEqual({ t1: 2, t2: T2_MEASURES });
  });
  it("knows the tier of an id", () => {
    expect(tierOf("t1:gmted25k:1")).toBe(1);
    expect(tierOf("t2:Atacama Yungay")).toBe(2);
    expect(tierOf(null)).toBeNull();
  });
});
