import { describe, expect, it } from "vitest";
import { contiguousCount, mergeByRank, viewBox } from "./viewQuery";
import type { Tier1Candidate } from "../../types/contracts";

const cam = (lat: number, lon: number, mpp: number | null) => ({ heightKm: 1000, center: { lat, lon }, metersPerPixel: mpp, headingDeg: 0, pitchDeg: -90, moving: false });

describe("viewBox", () => {
  it("derives a box around the view centre from metres per pixel", () => {
    const b = viewBox(cam(0, 10, 1000), 1000, 500)!;
    // 500 km half-width at the equator ≈ 4.5°, 250 km half-height ≈ 2.25°
    expect(b.west).toBeCloseTo(10 - 4.4966, 2);
    expect(b.east).toBeCloseTo(10 + 4.4966, 2);
    expect(b.north).toBeCloseTo(2.248, 2);
  });
  it("wraps across the antimeridian", () => {
    const b = viewBox(cam(0, 179, 1000), 1000, 500)!;
    expect(b.west).toBeGreaterThan(b.east);
  });
  it("refuses views that are off the planet or too wide to mean anything", () => {
    expect(viewBox({ ...cam(0, 0, 1000), center: null }, 100, 100)).toBeNull();
    expect(viewBox(cam(0, 0, null), 100, 100)).toBeNull();
    expect(viewBox(cam(0, 0, 50_000), 1000, 800)).toBeNull();
  });
});

describe("paging by global rank", () => {
  const c = (rank: number) => ({ region_id: `r${rank}`, rank }) as unknown as Tier1Candidate;
  it("merges without duplicates, ordered by rank", () => {
    expect(mergeByRank([c(1), c(2), c(5)], [c(3), c(2)]).map((x) => x.rank)).toEqual([1, 2, 3, 5]);
  });
  it("pages from the end of the unbroken run of ranks", () => {
    expect(contiguousCount([c(1), c(2), c(3), c(40)])).toBe(3);
    expect(contiguousCount([])).toBe(0);
  });
});
