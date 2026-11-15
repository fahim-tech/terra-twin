/**
 * Footprint outlines and scan volumes, as plain geometry (no Cesium) so the outline sampling is testable.
 *
 * Outlines are densified before they reach the GPU. A polyline drawn as a few long chords sags below the
 * curved surface between its vertices (a 50 km window edge on Earth sags ~50 m mid-edge), while the
 * globe's tiles follow the surface more closely, so the middle of each edge failed the depth test and the
 * outline showed gaps. Short segments sag by millimetres and stay above the tiles.
 */
import { normLon, squareFootprint } from "../lib/geodesy";
import type { GlobeFootprint } from "./protocol";

export interface LatLon { lat: number; lon: number }

/** Corners (SW, SE, NE, NW for boxes) of a footprint. */
export function footprintCorners(f: GlobeFootprint, radiusM: number): LatLon[] {
  if (f.bbox) {
    const [w, s, e, n] = f.bbox;
    return [{ lat: s, lon: w }, { lat: s, lon: e }, { lat: n, lon: e }, { lat: n, lon: w }];
  }
  return squareFootprint(f.lat, f.lon, f.km ?? 25, radiusM);
}

/**
 * Closed outline (first point repeated at the end) sampled every ≤ `stepKm` along each edge. Geographic
 * boxes follow their parallels and meridians; squares (approximate local windows) follow great circles
 * between their corners.
 */
export function outlineRing(f: GlobeFootprint, radiusM: number, stepKm = 2, maxPerEdge = 96): LatLon[] {
  const corners = footprintCorners(f, radiusM);
  const out: LatLon[] = [];
  const R = radiusM / 1000;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    if (f.bbox) {
      const dLon = ((b.lon - a.lon + 540) % 360) - 180; // shortest way round, across the antimeridian too
      const lenKm = Math.hypot((b.lat - a.lat) * (Math.PI / 180) * R, dLon * (Math.PI / 180) * R * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180));
      const n = Math.min(maxPerEdge, Math.max(1, Math.ceil(lenKm / stepKm)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: normLon(a.lon + dLon * t) });
      }
    } else {
      const lenKm = greatCircleKm(a, b, R);
      const n = Math.min(maxPerEdge, Math.max(1, Math.ceil(lenKm / stepKm)));
      for (let k = 0; k < n; k++) out.push(slerp(a, b, k / n));
    }
  }
  out.push({ ...out[0] });
  return out;
}

function unit(p: LatLon): [number, number, number] {
  const la = (p.lat * Math.PI) / 180, lo = (p.lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function greatCircleKm(a: LatLon, b: LatLon, R: number) {
  const u = unit(a), v = unit(b);
  return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * R;
}

/** Point a fraction t along the great circle from a to b. */
export function slerp(a: LatLon, b: LatLon, t: number): LatLon {
  const u = unit(a), v = unit(b);
  const om = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
  if (om < 1e-12) return { ...a };
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  const x = ka * u[0] + kb * v[0], y = ka * u[1] + kb * v[1], z = ka * u[2] + kb * v[2];
  return { lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lon: normLon((Math.atan2(y, x) * 180) / Math.PI) };
}

/** Smaller side of a footprint, km (box sides measured along the centre parallel and a meridian). */
export function footprintSideKm(f: GlobeFootprint, radiusM: number): number {
  if (!f.bbox) return f.km ?? 25;
  const [w, s, e, n] = f.bbox;
  const R = radiusM / 1000;
  const spanLon = ((e - w) % 360 + 360) % 360;
  const ew = spanLon * (Math.PI / 180) * R * Math.cos(((s + n) / 2) * (Math.PI / 180));
  const ns = (n - s) * (Math.PI / 180) * R;
  return Math.max(0.1, Math.min(ew, ns));
}

/**
 * Wall height of a footprint's scan volume, metres. Purely visual — it gives the outline depth in the
 * oblique view and is never shown or read as a measurement (the footprints are 2D ground areas).
 */
export function scanHeightM(f: GlobeFootprint, radiusM: number): number {
  const side = footprintSideKm(f, radiusM);
  const k = f.kind === "research_bbox" ? 0.1 : 0.3;
  return Math.max(250, side * k * 1000);
}
