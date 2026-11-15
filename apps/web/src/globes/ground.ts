/**
 * The ground a view shows, as a geographic box (no Cesium, so it can be tested). The globe samples the border of
 * the free area, projects each sample onto the planet — or, where the border looks past the limb, the last
 * ground point on the way out to it (the horizon) — and reports the box around those points.
 *
 * A metres-per-pixel box around the centre is right only looking straight down: tilted, every pixel row up the
 * screen covers more ground than the one below it, out to the horizon, so that box held a fraction of the view.
 */
import { normLon } from "../lib/geodesy";
import type { GroundBox } from "./protocol";

export interface LatLon { lat: number; lon: number }

/** Points along the border of a rectangle (x0..x1 × y0..y1), `perEdge` + 1 on each edge, corners once. */
export function borderSamples(x0: number, y0: number, x1: number, y1: number, perEdge = 8): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = Math.max(1, Math.round(perEdge));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, y: y0 }); // top, left to right
    out.push({ x: x1, y: y0 + (y1 - y0) * t }); // right, top to bottom
    out.push({ x: x1 - (x1 - x0) * t, y: y1 }); // bottom, right to left
    out.push({ x: x0, y: y1 - (y1 - y0) * t }); // left, bottom to top
  }
  return out;
}

/**
 * The last point that still hits the planet on the way from `from` (which hits) to `to` (which does not), by
 * bisection on the screen segment: the horizon along that direction. `hit` projects a screen point onto the
 * planet (null past the limb).
 */
export function horizonAlong<T>(from: { x: number; y: number }, to: { x: number; y: number }, hit: (x: number, y: number) => T | null, steps = 8): T | null {
  let a = 0, b = 1;
  let best: T | null = hit(from.x, from.y);
  if (best === null) return null;
  for (let i = 0; i < steps; i++) {
    const m = (a + b) / 2;
    const p = hit(from.x + (to.x - from.x) * m, from.y + (to.y - from.y) * m);
    if (p !== null) { a = m; best = p; } else b = m;
  }
  return best;
}

/**
 * Box around the visible ground: the centre and the projected border points, longitudes unwrapped around the
 * centre so a view across ±180° keeps west > east. A pole in view opens the box to every longitude and to that
 * pole's latitude. Null without points.
 */
export function groundBox(points: LatLon[], center: LatLon, poles: { north?: boolean; south?: boolean } = {}): GroundBox | null {
  if (!points.length) return null;
  let south = center.lat, north = center.lat, w = 0, e = 0;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    const d = ((((p.lon - center.lon) % 360) + 540) % 360) - 180;
    w = Math.min(w, d);
    e = Math.max(e, d);
  }
  if (poles.north) north = 90;
  if (poles.south) south = -90;
  if (poles.north || poles.south || e - w >= 359.999) return { west: -180, south, east: 180, north };
  return { west: normLon(center.lon + w), south, east: normLon(center.lon + e), north };
}

/** Longitude span of a box, degrees (0..360), across ±180° when west > east. */
export function lonSpan(b: GroundBox): number {
  if (b.west === -180 && b.east === 180) return 360;
  return (((b.east - b.west) % 360) + 360) % 360;
}
