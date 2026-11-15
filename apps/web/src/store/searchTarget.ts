import { formatLat, formatLon } from "../lib/geodesy";
import type { AnalogSearch } from "../types/contracts";
import type { Selection } from "./app";

export interface SearchTarget {
  label: string;
  siteId: string | null;
  lat: number;
  lon: number;
  mission: string;
  footprintKm: number;
}

/**
 * The Mars target a set of results belongs to. Result surfaces (Earth, Compare, Report, exports,
 * URLs) must read this — never the live selection, which may have moved on since the search ran.
 */
export function searchTarget(search: AnalogSearch | null): SearchTarget | null {
  if (!search) return null;
  const req = search.request as { lat?: number; lon?: number; mission?: string; footprint_km?: number } | undefined;
  const lat = req?.lat ?? search.mars.coordinate.lat;
  const lon = req?.lon ?? search.mars.coordinate.lon;
  const siteName = (search.mars as { site_name?: string }).site_name;
  return {
    label: search.mars.site ? siteName ?? search.mars.site.replace(/_/g, " ") : `${formatLat(lat, 2)}, ${formatLon(lon, 2)}`,
    siteId: search.mars.site ?? null,
    lat, lon,
    mission: req?.mission ?? "landing_site",
    footprintKm: req?.footprint_km ?? search.mars.footprint_km,
  };
}

/** True when the live selection is no longer the target the current results were computed for. */
export function resultsAreStale(search: AnalogSearch | null, selection: Selection | null): boolean {
  const t = searchTarget(search);
  if (!t || !selection) return false;
  return Math.abs(t.lat - selection.lat) > 1e-6 || Math.abs(t.lon - selection.lon) > 1e-6;
}
