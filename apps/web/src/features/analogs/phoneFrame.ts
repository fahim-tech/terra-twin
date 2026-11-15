import { R_EARTH_MEAN_M } from "../../lib/geodesy";

export interface Frame { w: number; h: number; top: number; right: number; bottom: number; left: number }
export interface LatLon { lat: number; lon: number }

const RAD = Math.PI / 180;

/** Vertical field of view of the globe camera (Cesium: 60° on the larger canvas dimension). */
export function fovy(w: number, h: number) {
  const aspect = w / h;
  return aspect >= 1 ? 2 * Math.atan(Math.tan(30 * RAD) / aspect) : 60 * RAD;
}

function unit(p: LatLon): [number, number, number] {
  const la = p.lat * RAD, lo = p.lon * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/**
 * Screen position (CSS px) of a ground point for a nadir camera at `nadir`, `heightKm` up, heading north.
 * Null when the point is behind the limb.
 */
export function project(p: LatLon, nadir: LatLon, heightKm: number, f: Frame): { x: number; y: number } | null {
  const R = R_EARTH_MEAN_M, D = R + heightKm * 1000;
  const n = unit(nadir), q = unit(p);
  const dot = n[0] * q[0] + n[1] * q[1] + n[2] * q[2];
  if (dot <= R / D) return null; // beyond the horizon
  const lo = nadir.lon * RAD, la = nadir.lat * RAD;
  const east: [number, number, number] = [-Math.sin(lo), Math.cos(lo), 0];
  const north: [number, number, number] = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const v = [q[0] * R - n[0] * D, q[1] * R - n[1] * D, q[2] * R - n[2] * D];
  const x = v[0] * east[0] + v[1] * east[1] + v[2] * east[2];
  const y = v[0] * north[0] + v[1] * north[1] + v[2] * north[2];
  const z = -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);
  const k = f.h / 2 / Math.tan(fovy(f.w, f.h) / 2);
  return { x: f.w / 2 + (k * x) / z, y: f.h / 2 - (k * y) / z };
}

/**
 * Framing for a short free area (phone: the strip between the top capsule and the sheet). The camera always
 * looks straight down, so the planet's disc is centred on the canvas, not on the free area; at whole-globe
 * altitudes most of the disc then sits under the sheet. Instead of fitting a bounding box, search for the
 * nadir and the lowest altitude at which the most set members land inside the free area with a margin.
 */
export function phoneFrame(points: LatLon[], f: Frame, centre: LatLon, opts: { margin?: number; minKm?: number; maxKm?: number; reserveRight?: number } = {}): { nadir: LatLon; heightKm: number; inside: number } | null {
  if (!points.length) return null;
  const m = opts.margin ?? 24, minKm = opts.minKm ?? 1500, maxKm = opts.maxKm ?? 22_000;
  // reserveRight: instruments that float over the free area without occluding it (the phone nav cluster).
  const box = { x0: f.left + m, x1: f.w - f.right - m - (opts.reserveRight ?? 0), y0: f.top + m, y1: f.h - f.bottom - m };
  if (box.x1 <= box.x0 || box.y1 <= box.y0) return null;
  const heights: number[] = [];
  for (let hk = minKm; hk <= maxKm; hk *= 1.1) heights.push(hk);
  const tried: { nadir: LatLon; heightKm: number; inside: number }[] = [];
  let most = 0;
  for (const dLon of [0, -12, 12, -24, 24]) {
    for (let lat0 = -80; lat0 <= 80; lat0 += 2.5) {
      const nadir = { lat: lat0, lon: ((centre.lon + dLon + 540) % 360) - 180 };
      for (const hk of heights) {
        let inside = 0;
        for (const p of points) {
          const s = project(p, nadir, hk, f);
          if (s && s.x >= box.x0 && s.x <= box.x1 && s.y >= box.y0 && s.y <= box.y1) inside++;
        }
        tried.push({ nadir, heightKm: hk, inside });
        most = Math.max(most, inside);
        if (inside === points.length) break; // higher altitudes cannot beat this nadir's lowest full fit
      }
    }
  }
  if (!most) return null;
  // A set that cannot fit whole (cells on several continents) would otherwise push the camera to the
  // highest altitude for one more point; settle for most of it on a planet large enough to read.
  const enough = most === points.length ? most : Math.ceil(most * 0.75);
  let best: { nadir: LatLon; heightKm: number; inside: number } | null = null;
  for (const t of tried) {
    if (t.inside < enough) continue;
    if (!best || t.heightKm < best.heightKm - 1 || (Math.abs(t.heightKm - best.heightKm) <= 1 && t.inside > best.inside)) best = t;
  }
  return best;
}

/**
 * The flyTo target that makes the globe put its camera nadir at `nadir`: flights aim the target at the
 * centre of the free area by shifting the nadir (`aimFor` in the globe), so pre-compensate that shift.
 */
export function targetForNadir(nadir: LatLon, heightKm: number, f: Frame): LatLon {
  const mpp = (2 * heightKm * 1000 * Math.tan(fovy(f.w, f.h) / 2)) / f.h;
  const freeW = f.w - f.left - f.right, freeH = f.h - f.top - f.bottom;
  const fx = f.left + freeW / 2, fy = f.top + freeH / 2;
  const dLat = (((fy - f.h / 2) * mpp) / R_EARTH_MEAN_M) / RAD;
  const lat = Math.max(-89.5, Math.min(89.5, nadir.lat - dLat));
  const dLon = ((-(fx - f.w / 2) * mpp) / (R_EARTH_MEAN_M * Math.max(Math.cos(lat * RAD), 0.05))) / RAD;
  return { lat, lon: ((nadir.lon - dLon + 540) % 360) - 180 };
}
