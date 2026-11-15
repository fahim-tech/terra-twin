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

/** Live status of the GIS Mars factors (mars-factors-1.0) by factor id, and their reasons when not available. */
export interface LiveFactors { status: Record<string, string>; reason: Record<string, string | null | undefined> }

/**
 * Evidence availability for a zone, in a fixed reading order: terrain, observation support, then the
 * other factors (known ones in FACTOR_ORDER, unknown ones after them in API order). `on` is true only
 * when the API returned a value, or when the live GIS factor service reports the factor available
 * (`live`); nothing is inferred.
 */
export function availabilityItems(a: {
  tier1_features: { value: number | null }[];
  ez_features: { value: number | null }[];
  observation_support: unknown;
  unavailable_factors: { key: string; label: string; value: number | null }[];
}, live?: LiveFactors | null): AvailItem[] {
  const terrain = a.tier1_features.some((f) => f.value !== null) || a.ez_features.some((f) => f.value !== null);
  const rank = (k: string) => { const i = FACTOR_ORDER.indexOf(k); return i < 0 ? FACTOR_ORDER.length : i; };
  const factors = a.unavailable_factors.slice().sort((x, y) => rank(x.key) - rank(y.key));
  return [
    { key: "terrain", label: "Terrain", on: terrain },
    { key: "observation_support", label: "Observation support", on: !!a.observation_support },
    ...factors.map((f) => ({ key: f.key, label: FACTOR_SHORT[f.key] ?? f.label, on: f.value !== null || live?.status[f.key] === "available" })),
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

/** Length of the level shelf at the end of a leader that carries the label, px. */
const SHELF = LEADER_DX * 0.45;

/**
 * A callout's leader: a dogleg from the point to a short shelf that carries the label. `dy` is the
 * vertical reach (the shared `leaderDy`) and `dx` the horizontal one, to the shelf's end; a longer `dx`
 * lengthens the slanted run, never the shelf. The leader starts on the edge of whatever marks the point, so
 * it never crosses the mark (and never past the elbow, however large that mark is).
 */
export function calloutGeometry(a: Pt, side: CalloutSide, dy: number, from: CalloutStart = { square: 4.5 }, dx = LEADER_DX) {
  const sx = side.endsWith("e") ? 1 : -1;
  const sy = side.startsWith("n") ? -1 : 1;
  const elbow = { x: a.x + sx * (Math.max(dx, LEADER_DX) - SHELF), y: a.y + sy * dy };
  const end = { x: a.x + sx * Math.max(dx, LEADER_DX), y: elbow.y };
  const vx = elbow.x - a.x, vy = elbow.y - a.y;
  const t = Math.min(0.85, "circle" in from
    ? from.circle / Math.max(Math.hypot(vx, vy), 1e-9)
    : from.square / Math.max(Math.abs(vx), Math.abs(vy), 1e-9));
  const start = { x: a.x + vx * t, y: a.y + vy * t };
  return { sx, sy, start, elbow, end };
}

/**
 * Where a callout's leader starts when the globe draws the point's glyph on a stem (3D view): at the glyph,
 * `stemPx` above the ground point. What the label must clear — the footprint square, the zone outline — is
 * measured from the ground point (`dy` per side), so from the glyph a north label needs `stemPx` less reach and
 * a south label `stemPx` more; never less than `minDy` from the glyph itself. Looking straight down the stem has
 * no height and the reach is unchanged.
 */
export function reachFromGlyph(dy: { n: number; s: number }, stemPx: number, minDy: number): { n: number; s: number } {
  const s = Math.max(0, stemPx);
  return { n: Math.max(minDy, dy.n - s), s: Math.max(minDy, dy.s + s) };
}

/** The part of the globe frame a callout label may use (the frame less the UI covering it), px. */
export interface Bounds { left: number; top: number; right: number; bottom: number }

/**
 * True when a point lies under the UI covering the frame (inspector, phone sheet: the measured insets).
 * Its callout is then not drawn: a label for a point nobody can see would only peek out around the panel.
 */
export function underCover(p: Pt, frame: { w: number; h: number }, ins: Bounds): boolean {
  return p.x < ins.left || p.x > frame.w - ins.right || p.y < ins.top || p.y > frame.h - ins.bottom;
}

/** Clearance between a callout label and the edge of its bounds, px. */
export const CALLOUT_EDGE = 8;
/** The narrowest a label is ever made: its mono coordinate line needs about this much, px. */
export const CALLOUT_MIN_W = 120;
/** Gap between the shelf's end mark and the label (half the end mark), px. */
const LABEL_GAP = 2;

/**
 * Where a callout's label goes, how far its leader reaches and how wide the label may grow. The preferred
 * side is kept while the label has `minRoom` px there inside `bounds`; otherwise it takes the side with
 * more room, so a label never slides under the inspector, the phone sheet or the nav column, or off the
 * frame. North/south: `dy` is the reach each side needs to clear what surrounds the point; the label flips
 * when its preferred shelf (half label height `halfH`) would leave the bounds and the other side leaves
 * them less. When even that side does not fit, the reach is shortened (never below `minDy`) so the label
 * stays inside. `maxW` is the room on the chosen side: a longer name wraps instead of being clipped.
 */
export function placeCallout(a: Pt, preferred: CalloutSide, bounds: Bounds, dy: { n: number; s: number },
  opts: { halfH?: number; minRoom?: number; minDy?: number } = {}): { side: CalloutSide; maxW: number; dy: number } {
  const halfH = opts.halfH ?? 30;
  const minRoom = opts.minRoom ?? 160;
  const minDy = opts.minDy ?? 38;
  const room = {
    e: bounds.right - CALLOUT_EDGE - (a.x + LEADER_DX + LABEL_GAP),
    w: a.x - LEADER_DX - LABEL_GAP - (bounds.left + CALLOUT_EDGE),
  };
  const want = preferred[1] as "e" | "w";
  const other = want === "e" ? "w" : "e";
  const ew = room[want] >= minRoom || room[want] >= room[other] ? want : other;
  // How far each shelf's label would run past the top or bottom bound (≤ 0 when it fits).
  const over = {
    n: bounds.top + CALLOUT_EDGE - (a.y - dy.n - halfH),
    s: a.y + dy.s + halfH - (bounds.bottom - CALLOUT_EDGE),
  };
  const wantNS = preferred[0] as "n" | "s";
  const flipNS = wantNS === "n" ? "s" : "n";
  const ns = over[wantNS] > 0 && over[flipNS] < over[wantNS] ? flipNS : wantNS;
  const reach = over[ns] > 0 ? Math.max(minDy, dy[ns] - over[ns]) : dy[ns];
  // Before wrapping, a label may use half the edge clearance: a name that only just fits is not broken
  // over a sub-pixel of measured text width.
  const maxW = Math.max(CALLOUT_MIN_W, Math.floor(room[ew] + CALLOUT_EDGE / 2));
  return { side: `${ns}${ew}` as CalloutSide, maxW, dy: reach };
}

/** A rectangle on screen, px. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Whether the segment a–b meets the box (Liang–Barsky clipping). */
export function segmentMeetsBox(a: Pt, b: Pt, r: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  // Each edge of the box as p·t ≤ q; the segment survives while t0 ≤ t1.
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

/** Whether a point lies inside a closed ring of screen points (even–odd rule). */
export function insideRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * What a callout plate must keep off, on screen. `rings` are outlines as closed rings of points (null where a
 * point is not on screen, which breaks the ring there); `own` marks the outline of the zone the label names,
 * which the plate may sit inside but not across. `marks` are other glyphs the plate must not cover.
 */
export interface CalloutObstacles {
  rings: { pts: (Pt | null)[]; own: boolean }[];
  marks: Pt[];
  /** Instruments over the frame that are not measured insets (the phone scale bar, the data-layers panel): the plate keeps off them. */
  boxes?: Box[];
}

/** Whether two boxes overlap. */
export function boxesMeet(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * The size a plate is placed with: its natural (one-line) width, and the taller of its natural height and the
 * height it was last drawn at — a long name wraps when the placement caps the plate's width, and a wrapped plate
 * placed by its one-line height slides under whatever is above or below it.
 */
export function plateSize(natural: { w: number; h: number }, drawn: { w: number; h: number } | undefined): { w: number; h: number } {
  return { w: natural.w, h: Math.max(natural.h, drawn?.h ?? 0) };
}

/** Clearance between a plate and the lines and marks around it, px (any less and the plate seems to sit on the line). */
const CLEAR_GAP = 10;
/** Further vertical reaches tried on a side, px beyond the reach it needs. */
const REACH_STEPS = [0, 12, 24, 36, 48, 64, 80, 96];
/** Further horizontal reaches tried, px beyond the standard leader: a label can step sideways out of a zone. */
const SIDE_STEPS = [0, 44, 88, 132];
const flipEW = (s: CalloutSide) => `${s[0]}${s[1] === "e" ? "w" : "e"}` as CalloutSide;
const flipNS = (s: CalloutSide) => `${s[0] === "n" ? "s" : "n"}${s[1]}` as CalloutSide;

/** A placement: side, vertical reach `dy` and horizontal reach `dx` (to the shelf's end), the width cap, the steps taken past the start, and how many lines and marks the plate still meets. */
export interface CalloutChoice { side: CalloutSide; dy: number; dx: number; maxW: number; extra: number; extraX: number; hits: number }

/**
 * A callout placement whose plate keeps clear of the outlines and marks around it. Over imagery dense with
 * zone outlines, a plate sitting on a line reads as part of it — across a neighbouring zone's corner it seems to
 * name that zone, and a line along its leader shelf reads as the leader. Starting from the placement the bounds
 * allow (`start`, from placeCallout), this tries each side at the reach it needs and a few steps further out
 * and further aside, and keeps the one that crosses no line, sits inside no other zone and covers no other
 * glyph, preferring the start side, then the same north/south side, then the shortest leader. `prev` (the last
 * choice) is kept against a clean place one step nearer, so a label does not flicker. With `hold` (the camera is
 * moving) the last place is kept whatever it now crosses, as long as it still fits: outlines sweep past during a
 * flight or a drag, and a label hopping after each would read as jitter; it moves once the view settles.
 * Nothing to avoid: `start` as is.
 */
export function clearCallout(a: Pt, start: { side: CalloutSide; dy: number; maxW: number }, bounds: Bounds, dy: { n: number; s: number },
  plate: { w: number; h: number }, ob: CalloutObstacles,
  opts: { minDy: number; prev?: { side: CalloutSide; extra: number; extraX?: number } | null; hold?: boolean }): CalloutChoice {
  const segs: [Pt, Pt][] = [];
  const foreign: Pt[][] = [];
  for (const ring of ob.rings) {
    const n = ring.pts.length;
    for (let i = 0; i < n; i++) {
      const p = ring.pts[i], q = ring.pts[(i + 1) % n];
      if (p && q) segs.push([p, q]);
    }
    if (!ring.own && n > 2 && ring.pts.every(Boolean)) foreign.push(ring.pts as Pt[]);
  }
  const first: CalloutChoice = { ...start, dx: LEADER_DX, extra: 0, extraX: 0, hits: 0 };
  const boxes = ob.boxes ?? [];
  if (!segs.length && !ob.marks.length && !boxes.length) return first;
  const halfH = plate.h / 2;
  const fitsAt = (sy: number, r: number) => (sy < 0 ? a.y - r - halfH >= bounds.top + CALLOUT_EDGE : a.y + r + halfH <= bounds.bottom - CALLOUT_EDGE);
  const prev = opts.prev ? { ...opts.prev, extraX: opts.prev.extraX ?? 0 } : null;
  let best: (CalloutChoice & { score: number }) | null = null;
  for (const side of [start.side, flipEW(start.side), flipNS(start.side), flipNS(flipEW(start.side))]) {
    const sx = side[1] === "e" ? 1 : -1, sy = side[0] === "n" ? -1 : 1;
    const own = side === start.side;
    const room = sx > 0 ? bounds.right - CALLOUT_EDGE - (a.x + LEADER_DX + LABEL_GAP) : a.x - LEADER_DX - LABEL_GAP - (bounds.left + CALLOUT_EDGE);
    // Another side is tried only when the label fits there without running off the frame or under a panel.
    if (!own && room + CALLOUT_EDGE / 2 < Math.min(plate.w, CALLOUT_MIN_W)) continue;
    let r0 = own ? start.dy : dy[side[0] as "n" | "s"];
    if (!own && !fitsAt(sy, r0)) {
      r0 = Math.max(opts.minDy, r0 - (sy < 0 ? bounds.top + CALLOUT_EDGE - (a.y - r0 - halfH) : a.y + r0 + halfH - (bounds.bottom - CALLOUT_EDGE)));
      if (!fitsAt(sy, r0)) continue;
    }
    for (const extraX of SIDE_STEPS) {
      // Stepping aside never makes the label wrap: it is tried only where the whole plate still fits.
      if (extraX > 0 && room - extraX + CALLOUT_EDGE / 2 < plate.w) break;
      const maxW = own && extraX === 0 ? start.maxW : Math.max(CALLOUT_MIN_W, Math.floor(room - extraX + CALLOUT_EDGE / 2));
      const w = Math.min(plate.w, maxW);
      const dx = LEADER_DX + extraX;
      for (const extra of REACH_STEPS) {
        const r = r0 + extra;
        if (extra > 0 && !fitsAt(sy, r)) break;
        const row = a.y + sy * r;
        const end = a.x + sx * dx, elbow = end - sx * SHELF;
        const x0 = sx > 0 ? end + LABEL_GAP : end - LABEL_GAP - w;
        const box = { x0: x0 - CLEAR_GAP, y0: row - halfH - CLEAR_GAP, x1: x0 + w + CLEAR_GAP, y1: row + halfH + CLEAR_GAP };
        const shelf = { x0: Math.min(elbow, end), y0: row - 3, x1: Math.max(elbow, end), y1: row + 3 };
        let hits = 0;
        for (const [p, q] of segs) {
          if (segmentMeetsBox(p, q, box)) hits++;
          // A line running along the shelf (within 20° of level) reads as part of the leader.
          else if (Math.abs(q.y - p.y) <= 0.36 * Math.abs(q.x - p.x) && segmentMeetsBox(p, q, shelf)) hits++;
        }
        for (const m of ob.marks) if (m.x >= box.x0 && m.x <= box.x1 && m.y >= box.y0 && m.y <= box.y1) hits++;
        // An instrument under the plate hides it (or its coordinate line) outright: weigh it like several lines.
        const plateBox = { x0, y0: row - halfH, x1: x0 + w, y1: row + halfH };
        for (const b of boxes) if (boxesMeet(plateBox, b)) hits += 3;
        const centre = { x: x0 + w / 2, y: row };
        for (const ring of foreign) if (insideRing(centre, ring)) hits++;
        const held = !!prev && prev.side === side && prev.extra === extra && prev.extraX === extraX;
        // A slanted run flatter than 25° starts to read like an outline edge (same colour): it costs more the
        // flatter it is, so a label stepping far aside also rises.
        const slant = (Math.atan2(r, Math.max(1, dx - SHELF)) * 180) / Math.PI;
        // Each 44 px aside costs as much as 22 px further out; the last place is kept against a clean place up to
        // one step nearer, never against a better side — or against anything while the camera moves.
        const score = hits * 10 + (side[1] !== start.side[1] ? 1.5 : 0) + (side[0] !== start.side[0] ? 2 : 0) + extra / 48 + extraX / 88
          + Math.max(0, 25 - slant) / 10 - (held ? (opts.hold ? 1000 : 0.3) : 0);
        if (!best || score < best.score) best = { side, dy: r, dx, maxW, extra, extraX, hits, score };
        // Further out at this offset only costs more once the run is steep enough (unless the last place is
        // further out still).
        if (hits === 0 && slant >= 25 && !(prev && prev.side === side && prev.extraX === extraX && prev.extra > extra)) break;
      }
    }
  }
  return best ? { side: best.side, dy: best.dy, dx: best.dx, maxW: best.maxW, extra: best.extra, extraX: best.extraX, hits: best.hits } : first;
}

/**
 * Whether the intro's copy column lies over the planet. The shell sets the home view of Mars 16 % of the
 * window right of centre; from the home altitude the disc's radius is about 22 % of the window's width when
 * it is landscape (more of it when portrait), so its left limb sits near 44 % of the width — clear of the
 * ~520 px copy column only from about 1,170 px (the desktop layout), and under it on phones, tablets and any
 * portrait window.
 */
export function introOverlapsPlanet(layout: "phone" | "tablet" | "desktop", portrait: boolean): boolean {
  return layout !== "desktop" || portrait;
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

/**
 * The static "not connected" list from the Mars analysis, reconciled with the live factor service: a factor the
 * service reports available is not missing; for the rest the live reason wins over the static one. With no live
 * answer (service offline or still loading) the static list stands unchanged.
 */
export function missingFactors<T extends { key: string; value: number | null; reason?: string | null }>(
  factors: T[], live?: LiveFactors | null,
): (T & { reason: string | null })[] {
  return factors
    .filter((f) => f.value === null && live?.status[f.key] !== "available")
    .map((f) => ({ ...f, reason: (live?.reason[f.key] || f.reason) ?? null }));
}
