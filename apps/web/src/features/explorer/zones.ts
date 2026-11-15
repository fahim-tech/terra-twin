import { R_MARS_M, distanceKm, formatLat, formatLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { nearestSite } from "../../lib/instruments";
import type { Selection } from "../../store/app";
import type { MarsSite } from "../../types/contracts";

/** Requested footprints offered in the inspector (km). A footprint is not a data resolution. */
export const FOOTPRINTS = [1, 5, 25, 100] as const;

/** The research zone whose footprint contains the point (closest centre wins when footprints overlap). */
export function siteContaining(sites: MarsSite[] | undefined, lat: number, lon: number): MarsSite | null {
  if (!sites) return null;
  const hits = sites.filter((s) => lat >= s.bbox.lat_min && lat <= s.bbox.lat_max && lon >= s.bbox.lon_min && lon <= s.bbox.lon_max);
  hits.sort((a, b) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2 - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2));
  return hits[0] ?? null;
}

/** "1,540 km" — distances rounded to 10 km above 100 km so they don't read as survey precision. */
export function formatKm(km: number): string {
  const v = km >= 100 ? Math.round(km / 10) * 10 : Math.round(km);
  return `${v.toLocaleString("en-US")} km`;
}

/** Coordinates as the spec writes them: `17.68° N 77.01° E`. */
export function formatCoord(lat: number, lon: number, digits = 2): string {
  return `${formatLat(lat, digits)} ${formatLon(lon, digits)}`;
}

export interface ZoneReadout {
  inside: boolean;
  /** Zone the point lies in, or the nearest zone centre when outside. */
  site: MarsSite;
  name: string;
  /** Great-circle distance to the nearest zone centre (outside only). */
  km: number | null;
}

/** Client-side classification of any Mars point against the 39 research zones (no API call). */
export function readZone(sites: MarsSite[] | undefined, lat: number, lon: number): ZoneReadout | null {
  const inside = siteContaining(sites, lat, lon);
  if (inside) return { inside: true, site: inside, name: zoneName(inside.id), km: null };
  const near = nearestSite(sites, lat, lon);
  if (!near) return null;
  return { inside: false, site: near.site, name: zoneName(near.site.id), km: near.km };
}

/** Selection for a point: named after its zone when inside one, else by its coordinates. */
export function selectionFor(sites: MarsSite[] | undefined, lat: number, lon: number): Selection {
  const site = siteContaining(sites, lat, lon);
  return { lat, lon, siteId: site?.id ?? null, label: site ? zoneName(site.id) : formatCoord(lat, lon) };
}

/**
 * A zone's outline as the globe draws it (a box of parallels and meridians), as eight points: corners and edge
 * midpoints, going round from the north-west corner. Tracked on screen, they let a label keep off the outline.
 */
export function zoneRing(site: MarsSite): { lat: number; lon: number }[] {
  const { lon_min: w, lon_max: e, lat_min: s, lat_max: n } = site.bbox;
  const mLat = (s + n) / 2, mLon = (w + e) / 2;
  return [
    { lat: n, lon: w }, { lat: n, lon: mLon }, { lat: n, lon: e }, { lat: mLat, lon: e },
    { lat: s, lon: e }, { lat: s, lon: mLon }, { lat: s, lon: w }, { lat: mLat, lon: w },
  ];
}

/** Zones whose centres lie within `km` of a point, nearest first. */
export function zonesNear(sites: MarsSite[] | undefined, lat: number, lon: number, km: number): MarsSite[] {
  if (!sites) return [];
  return sites
    .map((s) => ({ s, d: distanceKm(lat, lon, s.lat, s.lon, R_MARS_M) }))
    .filter((x) => x.d <= km)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.s);
}

/** Selection for a zone's centre. */
export function zoneSelection(site: MarsSite): Selection {
  return { lat: site.lat, lon: site.lon, siteId: site.id, label: zoneName(site.id) };
}
