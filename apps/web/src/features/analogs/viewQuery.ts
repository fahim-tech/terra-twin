import { R_EARTH_MEAN_M } from "../../lib/geodesy";
import { lonSpan } from "../../globes/ground";
import type { CameraTelemetry } from "../../globes/protocol";
import { Tier1Result, type Tier1Candidate } from "../../types/contracts";
import { getJson } from "./earthApi";

export interface ViewBox { west: number; south: number; east: number; north: number }

/** Widest box worth querying: half the globe across in longitude, a quarter in latitude (as before). */
const MAX_SPAN = { lat: 90, lon: 180 };

/**
 * The ground box of the view, as a query region (approximate by nature, not a measurement). Taken from the
 * ground the globe reports as visible in the free area (telemetry `view`: the free area's border projected on
 * the planet, out to the horizon), which holds for tilted views too — there every row up the screen covers more
 * ground than the one below it, so a box from the centre's metres per pixel held only part of the view. A globe
 * that does not report it falls back to that box, which is right looking straight down. Null when the centre is
 * off the planet or the view is too wide for a box to mean anything.
 */
export function viewBox(cam: CameraTelemetry | null, freeW: number, freeH: number): ViewBox | null {
  if (!cam?.center) return null;
  if (cam.view !== undefined) {
    const v = cam.view;
    if (!v || v.north - v.south > MAX_SPAN.lat || lonSpan(v) > MAX_SPAN.lon) return null;
    return { west: v.west, south: v.south, east: v.east, north: v.north };
  }
  if (!cam.metersPerPixel || freeW <= 0 || freeH <= 0) return null;
  const halfW = (cam.metersPerPixel * freeW) / 2, halfH = (cam.metersPerPixel * freeH) / 2;
  const dLat = (halfH / R_EARTH_MEAN_M) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos((cam.center.lat * Math.PI) / 180), 0.05);
  const dLon = (halfW / (R_EARTH_MEAN_M * cosLat)) * (180 / Math.PI);
  if (2 * dLat > MAX_SPAN.lat || 2 * dLon > MAX_SPAN.lon) return null;
  const wrap = (l: number) => ((l + 540) % 360) - 180;
  return {
    west: wrap(cam.center.lon - dLon), east: wrap(cam.center.lon + dLon),
    south: Math.max(-90, cam.center.lat - dLat), north: Math.min(90, cam.center.lat + dLat),
  };
}

/**
 * Tier-1 cells inside a box, keeping their global ranks (same endpoint and contract as paging).
 * TODO(shared): belongs in `services/api.tier1Page` as an optional bbox once the shared layer opens.
 */
export function tier1InView(site: string, mission: string, box: ViewBox, limit = 100): Promise<Tier1Result> {
  const q = new URLSearchParams({ site, mission, offset: "0", limit: String(limit), west: box.west.toFixed(4), south: box.south.toFixed(4), east: box.east.toFixed(4), north: box.north.toFixed(4) });
  return getJson(`/api/analysis/tier1/candidates?${q}`, Tier1Result);
}

/** Merge cells into a loaded list by global rank, without duplicates. */
export function mergeByRank(a: Tier1Candidate[], b: Tier1Candidate[]): Tier1Candidate[] {
  const seen = new Map(a.map((c) => [c.region_id, c]));
  for (const c of b) if (!seen.has(c.region_id)) seen.set(c.region_id, c);
  return [...seen.values()].sort((x, y) => x.rank - y.rank);
}

/** Length of the unbroken run of ranks 1..n at the start — the offset for the next "Load more" page. */
export function contiguousCount(cands: { rank: number }[]): number {
  let n = 0;
  for (const c of cands) { if (c.rank === n + 1) n++; else if (c.rank > n + 1) break; }
  return n;
}
