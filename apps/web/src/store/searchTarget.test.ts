import { describe, expect, it } from "vitest";
import { zoneName } from "../lib/glossary";
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
  it("names a zone with zoneName(id), never the API's site_name", () => {
    for (const id of ["Acidalia_Plantia", "Coprates_EMelas_Chasm", "Deuteronilus1_2", "Hellas3", "Hellas_Hellas2"]) {
      const s = { ...(search as object), mars: { site: id, site_name: id.replace(/_/g, " "), coordinate: { lat: 0, lon: 0 }, footprint_km: 25 } } as never;
      expect(searchTarget(s)!.label).toBe(zoneName(id));
    }
    expect(searchTarget({ ...(search as object), mars: { site: "Acidalia_Plantia", site_name: "Acidalia Plantia", coordinate: { lat: 0, lon: 0 }, footprint_km: 25 } } as never)!.label).toBe("Acidalia Planitia");
  });
  it("detects stale results after the selection moves", () => {
    expect(resultsAreStale(search, { lat: 17.6756, lon: 77.0127, siteId: "Jezero", label: "Jezero" })).toBe(false);
    expect(resultsAreStale(search, { lat: -60, lon: 10, siteId: null, label: "x" })).toBe(true);
  });
});
