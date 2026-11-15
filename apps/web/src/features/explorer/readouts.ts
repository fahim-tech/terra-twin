/**
 * Pure helpers behind the Mars explorer's readouts: scales quoted in copy (read from API payloads,
 * never defaulted), availability marks, the search list's keyboard model and callout geometry.
 */

/** The global screen's cell size, the research window size and the zone count the explorer quotes. */
export interface Scales {
  /** Global-screen cell edge in km (`/api/evidence` coverage.tier1.cell_km). */
  cellKm: number | null;
  /** Research-comparison window edge in km (coverage.tier2.window_km). */
  windowKm: number | null;
  /** Number of Mars research zones (coverage.mars.n_targets; the shell prefers the sites list). */
  zones: number | null;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Reads the scales from the `/api/evidence` payload. Anything absent or malformed stays null. */
export function scalesFromEvidence(evidence: unknown): Scales {
  const cov = obj(obj(evidence)?.coverage);
  return {
    cellKm: positive(obj(cov?.tier1)?.cell_km),
    windowKm: positive(obj(cov?.tier2)?.window_km),
    zones: positive(obj(cov?.mars)?.n_targets),
  };
}

/** Grid spacing in whole metres shared by a set of measures (463 for MOLA); null when absent or mixed. */
export function gridMetres(features: { native_resolution_m?: number | null }[]): number | null {
  const v = features.map((f) => f.native_resolution_m).filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  const r = Math.round(v[0]);
  return v.every((x) => Math.round(x) === r) ? r : null;
}

/** The baseline an API explanation quotes ("…between points ~1.85 km apart…" → "1.85 km"); null if none. */
export function baselineFromExplanation(text: string | null | undefined): string | null {
  const m = text?.match(/~\s*(\d+(?:\.\d+)?)\s*(km|m)\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Short labels for the API's evidence factors (unknown keys keep the API label). */
export const FACTOR_SHORT: Record<string, string> = {
  thermal_inertia: "Thermal", geologic_unit: "Geology", water_ice: "Ice", surface_temperature: "Climate",
  rock_abundance: "Rocks", solar_energy: "Solar",
};
const FACTOR_ORDER = ["thermal_inertia", "geologic_unit", "water_ice", "surface_temperature", "rock_abundance", "solar_energy"];

export interface AvailItem { key: string; label: string; on: boolean }

/**
 * Evidence availability for a zone, in a fixed reading order: terrain, observation support, then the
 * other factors (known ones in FACTOR_ORDER, unknown ones after them in API order). `on` is true only
 * when the API returned a value; nothing is inferred.
 */
export function availabilityItems(a: {
  tier1_features: { value: number | null }[];
  ez_features: { value: number | null }[];
  observation_support: unknown;
  unavailable_factors: { key: string; label: string; value: number | null }[];
}): AvailItem[] {
  const terrain = a.tier1_features.some((f) => f.value !== null) || a.ez_features.some((f) => f.value !== null);
  const rank = (k: string) => { const i = FACTOR_ORDER.indexOf(k); return i < 0 ? FACTOR_ORDER.length : i; };
  const factors = a.unavailable_factors.slice().sort((x, y) => rank(x.key) - rank(y.key));
  return [
    { key: "terrain", label: "Terrain", on: terrain },
    { key: "observation_support", label: "Observation support", on: !!a.observation_support },
    ...factors.map((f) => ({ key: f.key, label: FACTOR_SHORT[f.key] ?? f.label, on: f.value !== null })),
  ];
}

/**
 * Listbox keyboard model for the search: the active index after a key, or null when the key does not
 * move it. ArrowDown/ArrowUp step and stop at the ends; Home/End and PageDown/PageUp jump.
 */
export function nextActive(key: string, active: number, count: number, page = 8): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const clamp = (i: number) => Math.max(0, Math.min(last, i));
  switch (key) {
    case "ArrowDown": return clamp(active + 1);
    case "ArrowUp": return clamp(active - 1);
    case "Home": return 0;
    case "End": return last;
    case "PageDown": return clamp(active + page);
    case "PageUp": return clamp(active - page);
    default: return null;
  }
}

/**
 * How far a scroller must move so a row is fully visible inside it, keeping `pad` px clear at each edge
 * (the faded scroll edges). Negative scrolls up; 0 when it is already visible.
 */
export function revealDelta(row: { top: number; bottom: number }, view: { top: number; bottom: number }, pad = 0): number {
  if (row.top < view.top + pad) return row.top - (view.top + pad);
  if (row.bottom > view.bottom - pad) return row.bottom - (view.bottom - pad);
  return 0;
}

export type CalloutSide = "ne" | "nw" | "se" | "sw";
export interface Pt { x: number; y: number }

/** Horizontal reach of a callout leader from its point, px. */
export const LEADER_DX = 44;

/** Where a leader leaves its point: the edge of a square mark (half size, px) or of a round globe marker (radius, px). */
export type CalloutStart = { square: number } | { circle: number };

/**
 * A callout's leader: a dogleg from the point to a short shelf that carries the label. `dy` is the
 * vertical reach (the shared `leaderDy`). The leader starts on the edge of whatever marks the point, so
 * it never crosses the mark.
 */
export function calloutGeometry(a: Pt, side: CalloutSide, dy: number, from: CalloutStart = { square: 4.5 }) {
  const sx = side.endsWith("e") ? 1 : -1;
  const sy = side.startsWith("n") ? -1 : 1;
  const elbow = { x: a.x + sx * LEADER_DX * 0.55, y: a.y + sy * dy };
  const end = { x: a.x + sx * LEADER_DX, y: elbow.y };
  const vx = elbow.x - a.x, vy = elbow.y - a.y;
  const t = "circle" in from
    ? from.circle / Math.max(Math.hypot(vx, vy), 1e-9)
    : from.square / Math.max(Math.abs(vx), Math.abs(vy), 1e-9);
  const start = { x: a.x + vx * t, y: a.y + vy * t };
  return { sx, sy, start, elbow, end };
}

const D2R = Math.PI / 180;

/**
 * Orthographic projection of a planetocentric point onto a disc of radius `r` seen from above
 * (lat0, lon0): x east, y north. `front` is false on the far hemisphere.
 */
export function orthographic(lat: number, lon: number, lat0: number, lon0: number, r: number): { x: number; y: number; front: boolean } {
  const p = lat * D2R, l = (lon - lon0) * D2R, p0 = lat0 * D2R;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return {
    x: r * Math.cos(p) * Math.sin(l),
    y: r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
    front: cosc >= 0,
  };
}

/**
 * Graticule of an orthographic disc as SVG path data (screen y down): parallels and meridians every
 * `step` degrees on the near hemisphere, each line broken where it passes behind the limb.
 */
export function graticulePaths(lat0: number, lon0: number, r: number, step = 30, sample = 5): string[] {
  const out: string[] = [];
  const trace = (pts: [number, number][]) => {
    let d = "";
    let pen = false;
    for (const [la, lo] of pts) {
      const q = orthographic(la, lo, lat0, lon0, r);
      if (!q.front) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${q.x.toFixed(2)} ${(-q.y).toFixed(2)}`;
      pen = true;
    }
    if (d.includes("L")) out.push(d);
  };
  for (let la = -90 + step; la < 90; la += step) {
    const pts: [number, number][] = [];
    for (let lo = -180; lo <= 180; lo += sample) pts.push([la, lo]);
    trace(pts);
  }
  for (let lo = -180; lo < 180; lo += step) {
    const pts: [number, number][] = [];
    for (let la = -90; la <= 90; la += sample) pts.push([la, lo]);
    trace(pts);
  }
  return out;
}
