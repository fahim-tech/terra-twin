import { R_EARTH_MEAN_M } from "../../lib/geodesy";
import { API_BASE } from "../../services/api";
import type { CameraTelemetry } from "../../globes/protocol";
import { Tier1Result, type Tier1Candidate } from "../../types/contracts";

export interface ViewBox { west: number; south: number; east: number; north: number }

/**
 * The ground box around the view centre, from live camera telemetry (centre + metres per pixel at the
 * centre) and the unobstructed frame size. Approximate by nature — it is a query region, not a measurement —
 * and null when the centre is off the planet or the view is too wide for metres-per-pixel to mean anything.
 */
export function viewBox(cam: CameraTelemetry | null, freeW: number, freeH: number): ViewBox | null {
  if (!cam?.center || !cam.metersPerPixel || freeW <= 0 || freeH <= 0) return null;
  const halfW = (cam.metersPerPixel * freeW) / 2, halfH = (cam.metersPerPixel * freeH) / 2;
  const dLat = (halfH / R_EARTH_MEAN_M) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos((cam.center.lat * Math.PI) / 180), 0.05);
  const dLon = (halfW / (R_EARTH_MEAN_M * cosLat)) * (180 / Math.PI);
  if (dLat > 45 || dLon > 90) return null;
  const wrap = (l: number) => ((l + 540) % 360) - 180;
  return {
    west: wrap(cam.center.lon - dLon), east: wrap(cam.center.lon + dLon),
    south: Math.max(-90, cam.center.lat - dLat), north: Math.min(90, cam.center.lat + dLat),
  };
}

/** Tier-1 cells inside a box, keeping their global ranks (same endpoint and contract as paging). */
export async function tier1InView(site: string, mission: string, box: ViewBox, limit = 100): Promise<Tier1Result> {
  const q = new URLSearchParams({ site, mission, offset: "0", limit: String(limit), west: box.west.toFixed(4), south: box.south.toFixed(4), east: box.east.toFixed(4), north: box.north.toFixed(4) });
  let res: Response;
  try { res = await fetch(`${API_BASE}/api/analysis/tier1/candidates?${q}`); } catch { throw new Error("Scientific API is not reachable"); }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const parsed = Tier1Result.safeParse(await res.json());
  if (!parsed.success) throw new Error("API response violated the scientific data contract");
  return parsed.data;
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
