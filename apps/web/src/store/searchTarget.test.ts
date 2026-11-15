import { describe, expect, it } from "vitest";
import { resultsAreStale, searchTarget } from "./searchTarget";

const search = {
  id: "x", status: "available",
  request: { lat: 17.6756, lon: 77.0127, mission: "landing_site", footprint_km: 25 },
  mars: { site: "Jezero", site_name: "Jezero", coordinate: { lat: 17.6756, lon: 77.0127 }, footprint_km: 25 },
} as never;

describe("searchTarget", () => {
  it("labels results with the searched target, not the live selection", () => {
    expect(searchTarget(search)).toMatchObject({ label: "Jezero", siteId: "Jezero", mission: "landing_site", footprintKm: 25 });
  });
  it("detects stale results after the selection moves", () => {
    expect(resultsAreStale(search, { lat: 17.6756, lon: 77.0127, siteId: "Jezero", label: "Jezero" })).toBe(false);
    expect(resultsAreStale(search, { lat: -60, lon: 10, siteId: null, label: "x" })).toBe(true);
  });
});
