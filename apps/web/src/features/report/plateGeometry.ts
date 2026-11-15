/**
 * Plate geometry: where each pixel of a location-plate snapshot lies on the planet, so the plate's neatline
 * can carry true coordinate ticks and the scale bar is read from the same camera model.
 *
 * The globes render a plate with Cesium's default perspective frustum (60° across the larger canvas
 * dimension), `heightKm` above the target on the rendering ellipsoid, heading 0 (north up) and pitch −90°
 * (nadir) — see `snapshot()` in globes/globe-entry.ts. This module repeats that set-up
 * (Cartesian3.fromDegrees, Transforms.eastNorthUpToFixedFrame, PerspectiveFrustum) and casts a ray per pixel
 * onto the ellipsoid. Pure functions, no Cesium import — tested in plateGeometry.test.ts.
 */
import { centricToGraphic, MARS_IAU2000, R_MARS_M } from "../../lib/geodesy";

type V = [number, number, number];
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const dot = (p: V, q: V) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const add = (p: V, q: V, s = 1): V => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s];
const scale = (p: V, s: number): V => [p[0] * s, p[1] * s, p[2] * s];
const unit = (p: V): V => scale(p, 1 / Math.hypot(p[0], p[1], p[2]));
const cross = (p: V, q: V): V => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

/** A rendering body: equatorial and polar radii (m), and the latitude convention of its coordinates. */
export interface Body {
  a: number;
  b: number;
  /** Planetocentric latitudes (Mars, the API convention); otherwise geodetic (Earth, WGS84). */
  centric: boolean;
}

export const EARTH_WGS84: Body = { a: 6_378_137, b: 6_356_752.314245179, centric: false };
export const MARS_SPHERE: Body = { a: R_MARS_M, b: R_MARS_M, centric: true };
export const MARS_IAU2000_BODY: Body = { a: MARS_IAU2000.a, b: MARS_IAU2000.b, centric: true };

/**
 * The body a plate's globe renders on. Mars uses the IAU 2000 ellipsoid only with the Cesium ion tileset
 * (an ion token is configured); otherwise the MOLA sphere — the same choice as the globe's `init()`.
 */
export function plateBody(planet: "mars" | "earth", ionToken: string | null): Body {
  if (planet === "earth") return EARTH_WGS84;
  return ionToken ? MARS_IAU2000_BODY : MARS_SPHERE;
}

export interface PlateCamera {
  body: Body;
  pos: V;
  dir: V;
  right: V;
  up: V;
  /** Tangents of the half field of view across the width and the height. */
  tanX: number;
  tanY: number;
  width: number;
  height: number;
  heightKm: number;
}

/** The snapshot camera: nadir, north up, `heightKm` above (lat, lon) on the body; image `width` × `height` px. */
export function plateCamera(body: Body, lat: number, lon: number, heightKm: number, width: number, height: number, fovDeg = 60): PlateCamera {
  // Planetocentric inputs are converted to the ellipsoid's planetographic latitude, as the globe does (toRender).
  const latR = (body.centric && body.a !== body.b ? centricToGraphic(lat, body.a, body.b) : lat) * D2R;
  const lonR = lon * D2R;
  const a2 = body.a * body.a;
  const b2 = body.b * body.b;
  // Cartesian3.fromDegrees: surface point along the geodetic normal, then the height along it.
  const n: V = [Math.cos(latR) * Math.cos(lonR), Math.cos(latR) * Math.sin(lonR), Math.sin(latR)];
  const k0: V = [a2 * n[0], a2 * n[1], b2 * n[2]];
  const pos = add(scale(k0, 1 / Math.sqrt(dot(n, k0))), n, heightKm * 1000);
  // Transforms.eastNorthUpToFixedFrame(pos): up is the ellipsoid normal formula evaluated at the camera position.
  const up = unit([pos[0] / a2, pos[1] / a2, pos[2] / b2]);
  const east: V = Math.hypot(pos[0], pos[1]) < 1e-6 ? [0, 1, 0] : unit([-pos[1], pos[0], 0]);
  const north = cross(up, east);
  // PerspectiveFrustum: fov spans the larger dimension.
  const aspect = width / height;
  const t = Math.tan((fovDeg * D2R) / 2);
  const tanY = aspect <= 1 ? t : t / aspect;
  return { body, pos, dir: scale(up, -1), right: east, up: north, tanX: aspect * tanY, tanY, width, height, heightKm };
}

/** Ground coordinate under image pixel (px, py) — origin top-left, continuous pixel units — or null off the planet. */
export function groundAt(cam: PlateCamera, px: number, py: number): { lat: number; lon: number } | null {
  const x = ((2 * px) / cam.width - 1) * cam.tanX;
  const y = (1 - (2 * py) / cam.height) * cam.tanY;
  const d = add(add(cam.dir, cam.right, x), cam.up, y);
  const { a, b } = cam.body;
  const p: V = [cam.pos[0] / a, cam.pos[1] / a, cam.pos[2] / b];
  const q: V = [d[0] / a, d[1] / a, d[2] / b];
  const A = dot(q, q);
  const B = 2 * dot(p, q);
  const C = dot(p, p) - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (!(t > 0)) return null;
  const g = add(cam.pos, d, t);
  const r = Math.hypot(g[0], g[1]);
  const lat = cam.body.centric ? Math.atan2(g[2], r) : Math.atan2((g[2] * a * a) / (b * b), r);
  return { lat: lat * R2D, lon: Math.atan2(g[1], g[0]) * R2D };
}

/** Ground distance per image pixel at the plate centre (nadir), km. */
export function nadirKmPerPx(cam: PlateCamera): number {
  return (2 * cam.heightKm * cam.tanX) / cam.width;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** The part of a w × h snapshot that a plate of the given aspect shows (object-fit: cover, centred), in snapshot pixels. */
export function visibleRect(w: number, h: number, aspect = 4 / 3): Rect {
  if (w / h > aspect) {
    const vw = h * aspect;
    return { x: (w - vw) / 2, y: 0, w: vw, h };
  }
  const vh = w / aspect;
  return { x: 0, y: (h - vh) / 2, w, h: vh };
}

// ------------------------------------------------------------------------------------------- ticks

export const TICK_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 30] as const;

/** Largest graticule interval that still puts at most `maxTicks` major ticks across `spanDeg`. */
export function tickStep(spanDeg: number, maxTicks = 7): number {
  for (const s of TICK_STEPS) if (spanDeg / s <= maxTicks) return s;
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/** Minor divisions per major interval: quarters of 1 and 2, fifths of 2.5 and 5, thirds of 1.5 and 3 (× 10ⁿ). */
export function minorDivisions(step: number): number {
  const lead = Math.round((step / 10 ** Math.floor(Math.log10(step) + 1e-9)) * 10) / 10;
  if (lead === 1 || lead === 2) return 4;
  if (lead === 2.5 || lead === 5) return 5;
  return 3;
}

export type Edge = "top" | "bottom" | "left" | "right";

export interface EdgeTick {
  /** Position along the edge, 0..1 (left → right for top/bottom, top → bottom for left/right). */
  at: number;
  /** Longitude (top/bottom edges, −180..180) or latitude (left/right edges), degrees. */
  value: number;
  major: boolean;
}

function normLon(v: number): number {
  const l = ((((v + 180) % 360) + 360) % 360) - 180;
  return l === -180 ? 180 : l;
}

/**
 * Where meridians (top/bottom edges) or parallels (left/right edges) at multiples of step / divisions cross
 * one edge of the visible rect. Sampled along the edge and interpolated between samples; an edge any part
 * of which misses the planet gets no ticks rather than wrong ones.
 */
export function edgeTicks(cam: PlateCamera, rect: Rect, edge: Edge, step: number, divisions = minorDivisions(step), samples = 96): EdgeTick[] {
  const horizontal = edge === "top" || edge === "bottom";
  const pts: { at: number; v: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const f = i / samples;
    const px = horizontal ? rect.x + f * rect.w : edge === "left" ? rect.x : rect.x + rect.w;
    const py = horizontal ? (edge === "top" ? rect.y : rect.y + rect.h) : rect.y + f * rect.h;
    const g = groundAt(cam, px, py);
    if (!g) return [];
    let v = horizontal ? g.lon : g.lat;
    if (horizontal && pts.length) {
      // Unwrap across the antimeridian so the edge reads as one continuous run of longitudes.
      const prev = pts[pts.length - 1].v;
      while (v - prev > 180) v -= 360;
      while (v - prev < -180) v += 360;
    }
    pts.push({ at: f, v });
  }
  const minor = step / divisions;
  const seen = new Set<number>();
  const out: EdgeTick[] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    if (p.v === q.v) continue;
    const lo = Math.min(p.v, q.v);
    const hi = Math.max(p.v, q.v);
    for (let k = Math.ceil(lo / minor - 1e-9); k <= Math.floor(hi / minor + 1e-9); k++) {
      if (seen.has(k)) continue;
      seen.add(k);
      const val = k * minor;
      const at = p.at + ((val - p.v) / (q.v - p.v)) * (q.at - p.at);
      out.push({ at: Math.min(1, Math.max(0, at)), value: horizontal ? normLon(val) : val, major: ((k % divisions) + divisions) % divisions === 0 });
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

export interface PlateTicks { step: number; top: EdgeTick[]; bottom: EdgeTick[]; left: EdgeTick[]; right: EdgeTick[] }

/** Neatline ticks for the visible rect: one graticule interval for both axes, chosen from the larger span. */
export function plateTicks(cam: PlateCamera, rect: Rect, maxTicks = 7): PlateTicks | null {
  const tl = groundAt(cam, rect.x, rect.y);
  const tr = groundAt(cam, rect.x + rect.w, rect.y);
  const bl = groundAt(cam, rect.x, rect.y + rect.h);
  if (!tl || !tr || !bl) return null;
  let lonSpan = Math.abs(tr.lon - tl.lon);
  if (lonSpan > 180) lonSpan = 360 - lonSpan;
  const latSpan = Math.abs(tl.lat - bl.lat);
  const step = tickStep(Math.max(lonSpan, latSpan), maxTicks);
  const div = minorDivisions(step);
  return {
    step,
    top: edgeTicks(cam, rect, "top", step, div),
    bottom: edgeTicks(cam, rect, "bottom", step, div),
    left: edgeTicks(cam, rect, "left", step, div),
    right: edgeTicks(cam, rect, "right", step, div),
  };
}

/** Tick label: "18°N", "76.5°E", "0°", "180°". Decimals follow the interval. */
export function formatTick(value: number, axis: "lat" | "lon", step: number): string {
  const decimals = step >= 1 ? 0 : Math.round(step * 10) === step * 10 ? 1 : 2;
  const v = Number(value.toFixed(decimals));
  const mag = Math.abs(v).toFixed(decimals);
  if (v === 0 || (axis === "lon" && Math.abs(v) === 180)) return `${mag}°`;
  return `${mag}°${axis === "lat" ? (v > 0 ? "N" : "S") : v > 0 ? "E" : "W"}`;
}
