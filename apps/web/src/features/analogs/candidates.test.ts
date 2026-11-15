import { describe, expect, it } from "vitest";
import { boundsOf, groupNearTop, measuresOf, tierOf, unorderedMembers } from "./candidates";

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
  it("knows the tier of an id", () => {
    expect(tierOf("t1:gmted25k:1")).toBe(1);
    expect(tierOf("t2:Atacama Yungay")).toBe(2);
    expect(tierOf(null)).toBeNull();
  });
});
