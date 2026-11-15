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

/** Uppercase mono label, e.g. "PHOBOS · a 9,376 km" (a = semi-major axis). */
export function orbitLabel(m: MoonOrbit): string {
  return `${m.name.toUpperCase()} · a ${m.aKm.toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
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
 * Visibility of the orbits by camera altitude (km above the surface): drawn in whole-planet views (the
 * intro and the global explorer, ~9,000 km), gone once the camera descends towards a site.
 */
export function orbitFade(heightKm: number): number {
  const t = Math.min(1, Math.max(0, (heightKm - 2_800) / (6_000 - 2_800)));
  return t * t * (3 - 2 * t);
}
