import { describe, expect, it } from "vitest";
import { contiguousCount, mergeByRank, viewBox } from "./viewQuery";
import type { Tier1Candidate } from "../../types/contracts";
import { focusOf, poseAt, type Enu, type Vec3, type View } from "../../globes/camera";
import { borderSamples, groundBox, horizonAlong } from "../../globes/ground";
import type { CameraTelemetry } from "../../globes/protocol";
import { R_EARTH_MEAN_M } from "../../lib/geodesy";

const cam = (lat: number, lon: number, mpp: number | null) => ({ heightKm: 1000, center: { lat, lon }, metersPerPixel: mpp, headingDeg: 0, pitchDeg: -90, moving: false });

/**
 * What the globe reports for a camera `depthKm` from (lat, lon) at `pitchDeg` on a spherical Earth, in a frame
 * with a context surface over its right side: the free area's border cast onto the sphere (to the horizon where
 * it misses), boxed — the same steps globe-entry's visibleGround takes with Cesium's picks.
 */
function telemetryFor(lat: number, lon: number, depthKm: number, pitchDeg: number): CameraTelemetry {
  const D2R = Math.PI / 180, R = R_EARTH_MEAN_M;
  const w = 1440, h = 848, insets = { top: 0, right: 392, bottom: 0, left: 0 };
  const f = focusOf(w, h, insets);
  const fovy = 2 * Math.atan(Math.tan(Math.PI / 6) / (w / h)); // Cesium: 60° across the wider side
  const v: View = { w, h, fovy, focus: { x: f.x, y: f.y } };
  const la = lat * D2R, lo = lon * D2R;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const enu: Enu = { east: [-Math.sin(lo), Math.cos(lo), 0], north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], up };
  const pose = poseAt([up[0] * R, up[1] * R, up[2] * R], enu, depthKm * 1000, pitchDeg, 0, v);
  const tanY = Math.tan(fovy / 2), tanX = tanY * (w / h);
  const hit = (x: number, y: number) => {
    const nx = (x - w / 2) / (w / 2), ny = (h / 2 - y) / (h / 2);
    const d = [0, 1, 2].map((i) => pose.direction[i] + pose.right[i] * nx * tanX + pose.up[i] * ny * tanY);
    const p = pose.position;
    const a = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, b = 2 * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]), c = p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t <= 0) return null;
    const X = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    return { lat: Math.asin(X[2] / R) / D2R, lon: Math.atan2(X[1], X[0]) / D2R };
  };
  const pts = borderSamples(0, 0, w - insets.right, h, 6).map((s) => hit(s.x, s.y) ?? horizonAlong({ x: f.x, y: f.y }, s, hit, 10)!);
  const mpp = (2 * depthKm * 1000 * tanY) / h; // ground scale along the screen horizontal at the reticle
  return { heightKm: depthKm, center: { lat, lon }, view: groundBox(pts, { lat, lon }), metersPerPixel: mpp, headingDeg: 0, pitchDeg, moving: false };
}

describe("viewBox", () => {
  it("derives a box around the view centre from metres per pixel", () => {
    const b = viewBox(cam(0, 10, 1000), 1000, 500)!;
    // 500 km half-width at the equator ≈ 4.5°, 250 km half-height ≈ 2.25°
    expect(b.west).toBeCloseTo(10 - 4.4966, 2);
    expect(b.east).toBeCloseTo(10 + 4.4966, 2);
    expect(b.north).toBeCloseTo(2.248, 2);
  });
  it("wraps across the antimeridian", () => {
    const b = viewBox(cam(0, 179, 1000), 1000, 500)!;
    expect(b.west).toBeGreaterThan(b.east);
  });
  it("refuses views that are off the planet or too wide to mean anything", () => {
    expect(viewBox({ ...cam(0, 0, 1000), center: null }, 100, 100)).toBeNull();
    expect(viewBox(cam(0, 0, null), 100, 100)).toBeNull();
    expect(viewBox(cam(0, 0, 50_000), 1000, 800)).toBeNull();
  });

  it("uses the ground the globe reports as visible when it reports it", () => {
    const view = { west: -72, south: -26, east: -68, north: -19 };
    expect(viewBox({ ...cam(-24, -70, 400), view }, 1048, 848)).toEqual(view);
    // The reported view decides on its own: no visible ground, or more than a box can usefully hold, is no box.
    expect(viewBox({ ...cam(-24, -70, 400), view: null }, 1048, 848)).toBeNull();
    expect(viewBox({ ...cam(10, 40, 400), view: { west: -180, south: 40, east: 180, north: 90 } }, 1048, 848)).toBeNull();
  });

  it("covers the far ground of a tilted view that the centre's scale would miss", () => {
    // Earth, 3D view of a research window (−50°, 1,100 km): rows up the screen reach far beyond the centre's scale.
    const tilted = telemetryFor(-24.09, -69.99, 1_100, -50);
    const measured = viewBox(tilted, 1048, 848)!;
    const fromScale = viewBox({ ...tilted, view: undefined }, 1048, 848)!;
    expect(measured.north - -24.09).toBeGreaterThan(2 * (fromScale.north - -24.09));
    // Perspective widens the far ground too; the near ground below the reticle stays in the box.
    expect(measured.west).toBeLessThan(fromScale.west);
    expect(measured.east).toBeGreaterThan(fromScale.east);
    expect(measured.south).toBeLessThan(-24.09 - 2.5);
    // Looking straight down the two agree to within the planet's curvature over the ~9° box (the edges far from
    // the camera's nadir — the free area sits left of it — reach a little further).
    const nadir = telemetryFor(-24.09, -69.99, 1_100, -90);
    const a = viewBox(nadir, 1048, 848)!, b = viewBox({ ...nadir, view: undefined }, 1048, 848)!;
    for (const k of ["west", "south", "east", "north"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.5);
  });
});

describe("paging by global rank", () => {
  const c = (rank: number) => ({ region_id: `r${rank}`, rank }) as unknown as Tier1Candidate;
  it("merges without duplicates, ordered by rank", () => {
    expect(mergeByRank([c(1), c(2), c(5)], [c(3), c(2)]).map((x) => x.rank)).toEqual([1, 2, 3, 5]);
  });
  it("pages from the end of the unbroken run of ranks", () => {
    expect(contiguousCount([c(1), c(2), c(3), c(40)])).toBe(3);
    expect(contiguousCount([])).toBe(0);
  });
});
