/**
 * Geometry for the four-stage process schematic. Everything here is drawing geometry, not data:
 * the measured values the figure cites come from the evidence payload (model.ts).
 *
 * Units are MEGDR bins: bin (c, r) covers [c, c + 1] × [r, r + 1], x east, y south.
 */

export interface Pt { x: number; y: number }

export const BINS = { cols: 8, rows: 6 } as const;

/** Shot spacing along a track, in bins (several shots fall in most bins a track crosses). */
const SHOT_STEP = 0.6;

/**
 * Near north–south ground tracks with a slow eastward drift and a few dropouts, the pattern that
 * leaves most MEGDR bins without a laser return.
 */
const TRACK_DEFS: { x0: number; drift: number; gaps: [number, number][] }[] = [
  { x0: 1.2, drift: 0.2, gaps: [] },
  { x0: 3.85, drift: 0.2, gaps: [[3.2, 4.4]] },
  { x0: 6.35, drift: 0.2, gaps: [[0.85, 2.0]] },
];

export interface Track { start: Pt; end: Pt; shots: Pt[] }

export const TRACKS: Track[] = TRACK_DEFS.map(({ x0, drift, gaps }) => {
  const shots: Pt[] = [];
  for (let k = 0; ; k++) {
    const y = SHOT_STEP / 2 + k * SHOT_STEP;
    if (y >= BINS.rows) break;
    if (gaps.some(([a, b]) => y >= a && y < b)) continue;
    shots.push({ x: x0 + drift * y, y });
  }
  const over = 0.45;
  return { start: { x: x0 - drift * over, y: -over }, end: { x: x0 + drift * (BINS.rows + over), y: BINS.rows + over }, shots };
});

export const binKey = (c: number, r: number) => `${c},${r}`;

/** Bins hit by at least one shot (the MEGDR counts mask, in miniature). */
export function observedBins(tracks: readonly Track[] = TRACKS, cols: number = BINS.cols, rows: number = BINS.rows): Set<string> {
  const out = new Set<string>();
  for (const t of tracks)
    for (const s of t.shots) {
      const c = Math.floor(s.x), r = Math.floor(s.y);
      if (c >= 0 && c < cols && r >= 0 && r < rows) out.add(binKey(c, r));
    }
  return out;
}

/** Centres of the given bins, north to south then west to east. */
export function binCentres(keys: Iterable<string>): Pt[] {
  return [...keys]
    .map((k) => k.split(",").map(Number))
    .map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

interface Tri { a: number; b: number; c: number; x: number; y: number; r2: number }

/**
 * Delaunay triangulation (Bowyer–Watson). Returns vertex-index triples into `pts`. Points on a regular
 * grid are nudged by a deterministic, sub-visible amount so co-circular sets resolve consistently.
 */
export function delaunay(pts: readonly Pt[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const nudge = (i: number, k: number) => (((i * 2654435761 + k * 40503) % 997) / 997 - 0.5) * span * 1e-7;
  const P: Pt[] = pts.map((p, i) => ({ x: p.x + nudge(i, 1), y: p.y + nudge(i, 2) }));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, d = span * 64;
  P.push({ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy + d });

  const make = (a: number, b: number, c: number): Tri => {
    const A = P[a], B = P[b], C = P[c];
    const den = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    const a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
    const x = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / den;
    const y = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / den;
    return { a, b, c, x, y, r2: (A.x - x) ** 2 + (A.y - y) ** 2 };
  };

  let tris: Tri[] = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const bad = tris.filter((t) => (p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r2);
    const edges = new Map<string, [number, number]>();
    for (const t of bad)
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [u, v]);
      }
    const badSet = new Set(bad);
    tris = tris.filter((t) => !badSet.has(t));
    for (const [u, v] of edges.values()) tris.push(make(u, v, i));
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

/**
 * The half-pixel east–west blend in one row: each column becomes the mean of itself and its eastern
 * neighbour (research code: b[:, :-1] = 0.5 · (z[:, :-1] + z[:, 1:])), so output i is centred half a
 * bin east of input i. Only the blended columns are returned; the code leaves the last one as it was.
 */
export function blend(z: readonly number[]): number[] {
  return z.slice(0, -1).map((v, i) => (v + z[i + 1]) / 2);
}
