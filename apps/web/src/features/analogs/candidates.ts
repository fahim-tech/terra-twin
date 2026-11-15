import { formatLat, formatLon } from "../../lib/geodesy";
import type { AnalogSearch, Tier1Candidate, Tier2Candidate, Tier2Result } from "../../types/contracts";

/** A flattened, display-ready candidate from either tier. */
export interface CandidateView {
  id: string;
  tier: 1 | 2;
  lat: number;
  lon: number;
  label: string;
  rank?: number;
  score: number | null;
  coverage: number | null;
  bbox?: [number, number, number, number];
  t1?: Tier1Candidate;
  t2?: Tier2Candidate;
}

/** Research-pool window ids (`rand_d8_233`) as plain names; named windows keep their name. */
export function prettyWindow(id: string) {
  const m = /^rand_d(\d)_(\d+)$/.exec(id);
  return m ? `Window ${m[2]} · roughness decile ${m[1]}` : id;
}

/** Coordinates in the row format of the design spec: `17.68° N 77.01° E`. */
export function coord(lat: number, lon: number, digits = 2) {
  return `${formatLat(lat, digits)} ${formatLon(lon, digits)}`;
}

/** Tier-1 cells have no place names; name them by a documented analog nearby or by position, never by internal id. */
export function cellLabel(c: Tier1Candidate) {
  return c.known_analog.name ? `Cell near ${c.known_analog.name}` : `Cell at ${coord(c.lat, c.lon, 2)}`;
}

export function candidateList(search: AnalogSearch | null): CandidateView[] {
  if (!search) return [];
  const out: CandidateView[] = [];
  for (const c of search.tier2?.candidates ?? []) {
    if (c.lat === null || c.lon === null) continue;
    out.push({ id: `t2:${c.id}`, tier: 2, lat: c.lat, lon: c.lon, label: prettyWindow(c.id), score: c.S, coverage: c.coverage, t2: c });
  }
  for (const c of search.tier1?.candidates ?? []) {
    out.push({ id: `t1:${c.region_id}`, tier: 1, lat: c.lat, lon: c.lon, label: cellLabel(c), rank: c.rank, score: c.similarity, coverage: c.coverage, bbox: c.footprint.bbox, t1: c });
  }
  return out;
}

export function selectedCandidate(search: AnalogSearch | null, id: string | null): CandidateView | null {
  if (!id) return null;
  const norm = id.startsWith("t1:") || id.startsWith("t2:") ? id : null;
  return candidateList(search).find((c) => c.id === (norm ?? `t2:${id}`) || c.id === `t1:${id}`) ?? null;
}

/** Which tier a candidate id belongs to (`t1:` / `t2:` prefixes). */
export function tierOf(id: string | null): 1 | 2 | null {
  if (!id) return null;
  return id.startsWith("t1:") ? 1 : id.startsWith("t2:") ? 2 : null;
}

/** Number of descriptors a coverage fraction stands for (tier 2 uses 8, tier 1 uses 7). */
export function measuresOf(coverage: number | null | undefined, total: number): number | null {
  if (coverage === null || coverage === undefined || Number.isNaN(coverage)) return null;
  return Math.round(coverage * total);
}

/** Tier-2 descriptors per research window (see `coverage_basis`). */
export const T2_MEASURES = 8;

/**
 * The research windows the decision is about. A named leader or a tied set lists its members;
 * other decisions have none (the candidates are context, not a verdict).
 */
export function decisionMembers(t2: Tier2Result): Tier2Candidate[] {
  const ids = new Set(t2.decision.members);
  return t2.candidates.filter((c) => ids.has(c.id));
}

/**
 * Tied members as an unordered group: sorted west to east so the list order carries no rank.
 * (The API returns them by S, which would read as a ranking the research does not support.)
 */
export function unorderedMembers<T extends { lon: number | null; id: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => (a.lon ?? 0) - (b.lon ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Splits a tier-1 page into the cells within `tol` of the top score (not ranked against each other)
 * and the rest. Uses the global leader similarity from the summary when available, so the group is
 * correct even on later pages.
 */
export function groupNearTop<T extends { score: number | null }>(rows: T[], top: number | null | undefined, tol = 0.05): { near: T[]; rest: T[] } {
  if (top === null || top === undefined || !rows.length) return { near: [], rest: rows };
  const near: T[] = [], rest: T[] = [];
  for (const r of rows) (r.score !== null && r.score >= top - tol - 1e-12 ? near : rest).push(r);
  return { near, rest };
}

/** Spherical centroid (mean of unit vectors) of a set of points; null when they cancel out. */
export function centroidOf(points: { lat: number; lon: number }[]): { lat: number; lon: number } | null {
  if (!points.length) return null;
  const r = Math.PI / 180;
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    x += Math.cos(p.lat * r) * Math.cos(p.lon * r);
    y += Math.cos(p.lat * r) * Math.sin(p.lon * r);
    z += Math.sin(p.lat * r);
  }
  const h = Math.hypot(x, y);
  if (Math.hypot(h, z) < 1e-9 * points.length) return null;
  return { lat: Math.atan2(z, h) / r, lon: Math.atan2(y, x) / r };
}

/**
 * Smallest lon/lat box around a set of points, handling the antimeridian: the box spans the
 * shortest longitude arc (west may be greater than east when it crosses 180°).
 */
export function boundsOf(points: { lat: number; lon: number; bbox?: [number, number, number, number] }[]): { west: number; south: number; east: number; north: number } | null {
  if (!points.length) return null;
  const lons: number[] = [];
  let south = 90, north = -90;
  for (const p of points) {
    if (p.bbox) {
      const [w, s, e, n] = p.bbox;
      lons.push(w, e);
      south = Math.min(south, s); north = Math.max(north, n);
    } else {
      lons.push(p.lon);
      south = Math.min(south, p.lat); north = Math.max(north, p.lat);
    }
  }
  const sorted = [...new Set(lons.map((l) => (l >= -180 && l <= 180 ? l : ((l + 540) % 360) - 180)))].sort((a, b) => a - b);
  // The box is the complement of the largest empty gap between consecutive longitudes.
  let gap = sorted.length === 1 ? 360 : sorted[0] + 360 - sorted[sorted.length - 1];
  let west = sorted[0], east = sorted[sorted.length - 1];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > gap) { gap = g; west = sorted[i]; east = sorted[i - 1]; }
  }
  return { west, south, east, north };
}
