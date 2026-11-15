import { describe, expect, it } from "vitest";
import { EarthRegion, innerBox, parseLatLon, parseOrThrow, regionPath } from "./earthApi";

// Shape of /api/earth/region (trimmed from a live response for 0° N 140° W, an ocean point).
const OCEAN = {
  region_id: "gmted25k:79719", planet: "earth", lat: -7.8876, lon: -140.6626,
  footprint: { kind: "approx_cell", cell_km_ns: 24.88, cell_km_ew: 24.81, bbox: [-140.775, -7.9995, -140.55, -7.7758] },
  features: { mean_slope_deg: 0.726, slope_p90_deg: 0.84, relative_relief_m: 492, elev_std_m: 59.0, rmsdev_short: 69.9, rmsdev_long: 95.6, hurst_2pt: 0.2257, mean_elev_m: 12.6 },
  baselines_m: { short: 1842.9, long: 7371.6 }, valid_data_fraction: 1,
  source_id: "earth_global_screen",
  quality_flags: [{ code: "elevation_exact_zero", severity: "warning", message: "92% of GMTED pixels are exactly 0 m; may include sea-level water." }],
  known_analog: { status: "not_in_reference_set", name: null }, novelty_claim: "not_assessed", place_name: null, country: null,
  requested: { lat: 0, lon: -140 }, distance_km: 880.1, describes_requested_point: false,
};

describe("EarthRegion contract", () => {
  it("parses the region response and keeps the distance and coverage flags", () => {
    const r = parseOrThrow(EarthRegion, OCEAN);
    expect(r.region_id).toBe("gmted25k:79719");
    expect(r.describes_requested_point).toBe(false);
    expect(r.distance_km).toBeCloseTo(880.1);
    expect(r.quality_flags[0].severity).toBe("warning");
    expect(r.features.mean_slope_deg).toBeCloseTo(0.726);
  });
  it("rejects a response without the requested point instead of guessing", () => {
    const { requested: _drop, ...bad } = OCEAN;
    expect(() => parseOrThrow(EarthRegion, bad)).toThrow(/contract/);
  });
  it("keeps missing descriptors as null rather than inventing values", () => {
    const r = parseOrThrow(EarthRegion, { ...OCEAN, features: { ...OCEAN.features, hurst_2pt: null } });
    expect(r.features.hurst_2pt).toBeNull();
  });
});

describe("parseLatLon", () => {
  it("accepts signed decimals and hemisphere letters", () => {
    expect(parseLatLon("-24.1", "-70")).toEqual({ lat: -24.1, lon: -70 });
    expect(parseLatLon("24.1 S", "70 W")).toEqual({ lat: -24.1, lon: -70 });
    expect(parseLatLon("−24.1°", "290")).toEqual({ lat: -24.1, lon: -70 });
  });
  it("rejects out-of-range or malformed input", () => {
    expect(parseLatLon("95", "0")).toBeNull();
    expect(parseLatLon("10 E", "0")).toBeNull();
    expect(parseLatLon("abc", "0")).toBeNull();
    expect(parseLatLon("", "")).toBeNull();
  });
});

describe("cell query box", () => {
  it("stays strictly inside the cell so neighbours are not returned", () => {
    const b = innerBox([-70.18, -24.17, -69.94, -23.95]);
    expect(b.west).toBeGreaterThan(-70.18);
    expect(b.east).toBeLessThan(-69.94);
    expect(b.south).toBeGreaterThan(-24.17);
    expect(b.north).toBeLessThan(-23.95);
    expect(b.west).toBeLessThan(b.east);
  });
  it("builds the region path with fixed precision", () => {
    expect(regionPath({ lat: -24.1, lon: -70 })).toBe("/api/earth/region?lat=-24.1000&lon=-70.0000");
  });
});
