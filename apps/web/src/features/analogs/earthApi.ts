import { z } from "zod";
import { API_BASE } from "../../services/api";
import { Tier1Candidate } from "../../types/contracts";

/**
 * Local, Zod-validated GET for the two endpoints this feature needs that `services/api` does not expose yet
 * (tier-1 cells inside a box, and the cell at any Earth coordinate). Same error wording as `services/api`.
 * TODO(shared): move into `services/api` (e.g. `tier1Page` with an optional bbox, and `earthRegion`) when
 * the shared layer opens; this file then shrinks to re-exports.
 */
export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`); } catch { throw new Error("Scientific API is not reachable"); }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : d?.reason ?? `Request failed (${res.status})`);
  }
  return parseOrThrow(schema, body);
}

export function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("API response violated the scientific data contract");
  return parsed.data;
}

/**
 * `/api/earth/region?lat&lon`: the nearest 25 km cell of the global screen to any Earth coordinate, with its
 * descriptors as measured. It is not ranked against a Mars target — the rank comes from the screen itself.
 */
export const EarthRegion = Tier1Candidate.pick({
  region_id: true, planet: true, lat: true, lon: true, footprint: true, features: true, quality_flags: true, known_analog: true, novelty_claim: true,
}).extend({
  valid_data_fraction: z.number().nullable().optional(),
  requested: z.object({ lat: z.number(), lon: z.number() }),
  distance_km: z.number(),
  describes_requested_point: z.boolean(),
}).loose();
export type EarthRegion = z.infer<typeof EarthRegion>;

/** Parse a typed "lat, lon" pair; longitudes are normalised to −180..180. Null when out of range or not numbers. */
export function parseLatLon(latText: string, lonText: string): { lat: number; lon: number } | null {
  const clean = (s: string) => s.trim().replace(/[−–]/g, "-").replace(/°/g, "");
  const signed = (s: string, neg: string, pos: string) => {
    const t = clean(s).toUpperCase();
    const m = /^(-?\d+(?:\.\d+)?)\s*([NSEW])?$/.exec(t);
    if (!m) return NaN;
    const v = Number(m[1]);
    if (m[2] === neg) return -Math.abs(v);
    if (m[2] && m[2] !== pos) return NaN;
    return v;
  };
  const lat = signed(latText, "S", "N");
  const lonRaw = signed(lonText, "W", "E");
  if (!Number.isFinite(lat) || !Number.isFinite(lonRaw) || Math.abs(lat) > 90 || Math.abs(lonRaw) > 360) return null;
  const lon = ((((lonRaw + 180) % 360) + 360) % 360) - 180;
  return { lat, lon };
}

/** A box strictly inside a cell (so the bbox query cannot return its neighbours), as west/south/east/north. */
export function innerBox(bbox: [number, number, number, number], shrink = 0.25) {
  const [w, s, e, n] = bbox;
  const dx = (e - w) * shrink, dy = (n - s) * shrink;
  return { west: w + dx, south: s + dy, east: e - dx, north: n - dy };
}

export const regionPath = (p: { lat: number; lon: number }) => `/api/earth/region?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}`;
