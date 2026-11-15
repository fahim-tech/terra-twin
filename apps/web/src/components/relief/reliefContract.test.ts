import { describe, expect, it } from "vitest";
import { Relief } from "../../types/contracts";

const ok = {
  id: "Arcadia gated #1", lat: 26.512, lon: -7.875, kind: "prior gated candidate", planet: "earth",
  rows: 2, cols: 3, cell_m: 463.0935415503709, window_km: 50, units: "m", z_min: 365.1, z_max: 443.8, valid_fraction: 5 / 6,
  elevation: [365.1, 400.2, null, 410, 443.8, 420.5],
  orientation: { row0: "north", col0: "west", order: "row-major", frame: "local azimuthal-equidistant grid" },
  source: { dataset: "earth_pool_463m", title: "Tier-2 research pool", representation: "as_measured", note: "Earth as measured" },
};

describe("Relief contract", () => {
  it("accepts a grid and keeps missing cells as null", () => {
    const r = Relief.parse(ok);
    expect(r.elevation[2]).toBeNull();
  });
  it("rejects an elevation list that does not fill rows × cols", () => {
    expect(Relief.safeParse({ ...ok, elevation: ok.elevation.slice(1) }).success).toBe(false);
  });
  it("rejects any orientation other than north-up, west-left", () => {
    expect(Relief.safeParse({ ...ok, orientation: { ...ok.orientation, row0: "south" } }).success).toBe(false);
    expect(Relief.safeParse({ ...ok, orientation: { ...ok.orientation, col0: "east" } }).success).toBe(false);
  });
  it("needs metres and a representation", () => {
    expect(Relief.safeParse({ ...ok, units: "ft" }).success).toBe(false);
    expect(Relief.safeParse({ ...ok, source: { ...ok.source, representation: "guess" } }).success).toBe(false);
  });
});
