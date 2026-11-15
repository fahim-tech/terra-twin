/**
 * The mean orbits of Phobos and Deimos, drawn to scale around the Mars globe.
 *
 * Semi-major axes: Phobos 9,376 km and Deimos 23,463.2 km from Mars's centre (mean orbital elements).
 * Both orbits are inclined only about 1° to Mars's equator (Phobos 1.09°, Deimos 0.93°): the real orbit
 * leaves the equatorial plane by at most sin 1.09° ≈ 1.9 % of its radius, about a line of nodes that
 * precesses (Phobos every ~2.3 years). That is negligible at whole-planet scale, so each orbit is drawn as
 * its mean circle of radius a in Mars's equatorial plane. Eccentricities are 0.015 and 0.0003 with
 * precessing periapses, so no periapsis is drawn either. The moons themselves are not drawn: the app has
 * no ephemeris, and an animated moon position would be invented.
 */
import type { Vec3 } from "./camera";

export interface MoonOrbit {
  id: "phobos" | "deimos";
  name: string;
  /** Semi-major axis, km from Mars's centre. */
  aKm: number;
}

export const MARS_MOONS: readonly MoonOrbit[] = [
  { id: "phobos", name: "Phobos", aKm: 9_376 },
  { id: "deimos", name: "Deimos", aKm: 23_463.2 },
];

/** Uppercase mono label, e.g. "PHOBOS · a 9,376 km" (a = semi-major axis); both orbits to the whole km, one precision. */
export function orbitLabel(m: MoonOrbit): string {
  return `${m.name.toUpperCase()} · a ${m.aKm.toLocaleString("en-US", { maximumFractionDigits: 0 })} km`;
}

/** Closed ring of `n` segments in Mars's equatorial plane (planet-fixed metres; first point repeated). */
export function orbitRing(aKm: number, n = 720): Vec3[] {
  const a = aKm * 1000;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    out.push([a * Math.cos(t), a * Math.sin(t), 0]);
  }
  out.push(out[0]);
  return out;
}

/** Point on an orbit at angle θ (radians from the prime meridian, eastward). */
export function orbitPoint(aKm: number, theta: number): Vec3 {
  const a = aKm * 1000;
  return [a * Math.cos(theta), a * Math.sin(theta), 0];
}

/**
 * Where `cost` is least between `lo` and `hi` (golden-section search), with the least finite cost seen (Infinity
 * marks places a label may not go). Used to slide an orbit's label continuously to the point of the ring nearest
 * its preferred spot: picking the nearest of a fixed set of ring samples made the label creep with the intro's
 * spin and snap back a sample's width (13–21 px) every 0.7 s.
 */
export function refineMin(cost: (t: number) => number, lo: number, hi: number, iterations = 24): { t: number; c: number } {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let x1 = b - g * (b - a), x2 = a + g * (b - a);
  let f1 = cost(x1), f2 = cost(x2);
  let best = f1 <= f2 ? { t: x1, c: f1 } : { t: x2, c: f2 };
  for (let i = 0; i < iterations; i++) {
    if (f1 <= f2) {
      b = x2; x2 = x1; f2 = f1;
      x1 = b - g * (b - a); f1 = cost(x1);
      if (f1 < best.c) best = { t: x1, c: f1 };
    } else {
      a = x1; x1 = x2; f1 = f2;
      x2 = a + g * (b - a); f2 = cost(x2);
      if (f2 < best.c) best = { t: x2, c: f2 };
    }
  }
  return best;
}

/** A screen rectangle, CSS px. */
export interface ScreenRect { x0: number; y0: number; x1: number; y1: number }

/**
 * Whether a label's box keeps `margin` px clear of the planet's disc (centre and radius on screen). An orbit's
 * name drawn over the planet would read as the name of a surface feature, so its whole box must stay in front
 * of space — not just the point it hangs from.
 */
export function clearOfDisc(box: ScreenRect, disc: { x: number; y: number; r: number }, margin: number): boolean {
  const dx = Math.max(box.x0 - disc.x, 0, disc.x - box.x1);
  const dy = Math.max(box.y0 - disc.y, 0, disc.y - box.y1);
  return Math.hypot(dx, dy) >= disc.r + margin;
}

/**
 * The columns of a canvas `canvasW` px wide that are on screen, when its frame sits `frameLeft` px from the
 * left of a viewport `viewportW` px wide (the shell slides the Mars frame right while the intro is open, so
 * part of the canvas is then past the window's edge). The whole canvas when the frame's place is unknown.
 */
export function visibleColumns(canvasW: number, frame: { left: number; width: number } | null, viewportW: number): { x0: number; x1: number } {
  if (!frame || !(frame.width > 0) || !(viewportW > 0) || !(canvasW > 0)) return { x0: 0, x1: canvasW };
  const k = canvasW / frame.width;
  const x0 = Math.min(canvasW, Math.max(0, -frame.left * k));
  const x1 = Math.max(x0, Math.min(canvasW, (viewportW - frame.left) * k));
  return { x0, x1 };
}

/** `value` moved towards `goal` at a rate that covers the whole 0–1 range in `seconds` (instantly when 0). */
export function easeToward(value: number, goal: number, dtS: number, seconds: number): number {
  if (!(seconds > 0)) return goal;
  const step = Math.max(0, dtS) / seconds;
  return goal > value ? Math.min(goal, value + step) : Math.max(goal, value - step);
}

/**
 * Visibility of the orbits by camera altitude (km above the surface): drawn in whole-planet views (the
 * intro and the global explorer, ~9,000 km), gone once the camera descends towards a site.
 */
export function orbitFade(heightKm: number): number {
  const t = Math.min(1, Math.max(0, (heightKm - 2_800) / (6_000 - 2_800)));
  return t * t * (3 - 2 * t);
}

/** Split a closed ring of samples into arcs of `per` segments each (consecutive arcs share their end sample). */
export function ringArcs<T>(ring: readonly T[], per: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ring.length - 1; i += per) out.push(ring.slice(i, Math.min(ring.length, i + per + 1)));
  return out;
}

/**
 * How much of an orbit arc to draw near a block of copy (the intro's title column): none where the arc's points
 * come within `clear` px of the box, fading in over the next `fade` px. A ring through the title reads as a stray
 * rule through the wordmark. Points are the arc's samples on screen (null when not projected).
 */
export function arcClearOfBox(points: readonly ({ x: number; y: number } | null)[], box: ScreenRect | null, clear = 16, fade = 48): number {
  if (!box) return 1;
  let d = Infinity;
  for (const p of points) {
    if (!p) continue;
    const dx = Math.max(box.x0 - p.x, 0, p.x - box.x1);
    const dy = Math.max(box.y0 - p.y, 0, p.y - box.y1);
    d = Math.min(d, Math.hypot(dx, dy));
  }
  if (d === Infinity) return 1;
  return Math.max(0, Math.min(1, (d - clear) / fade));
}
