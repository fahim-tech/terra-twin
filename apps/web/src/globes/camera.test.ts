import { describe, expect, it } from "vitest";
import {
  OBLIQUE_PITCH_DEG, STEM_PX, attitudeAt, dot, exactNadir, facesCamera, fitDepth, flightPitchDeg, focusOf, isTilted, nadirFor, nadirPose,
  poseAt, project, stemHeightM, tiltWeight, verticalPxPerMetre, type Enu, type Vec3, type View,
} from "./camera";

const R = 3_396_190;
const D2R = Math.PI / 180;

function exactNadirFor(X: Vec3, heightM: number, mpp: number, v: View, heading: number, sphere: (la: number, lo: number) => { ground: Vec3; enu: Enu }) {
  const lat = Math.asin(X[2] / R) / D2R, lon = Math.atan2(X[1], X[0]) / D2R;
  return exactNadir(X, lat, lon, heightM, mpp, v, heading, R, sphere);
}

/** Point and local east/north/up frame on a sphere of radius R. */
function site(latDeg: number, lonDeg: number, r = R): { X: Vec3; enu: Enu } {
  const la = latDeg * D2R, lo = lonDeg * D2R;
  const up: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
  const north: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  return { X: [up[0] * r, up[1] * r, up[2] * r], enu: { east, north, up } };
}

// 1440 × 852 frame with a 392 px context surface on the right: the free area's centre is left of centre.
const insets = { top: 0, right: 392, bottom: 0, left: 0 };
const f = focusOf(1440, 852, insets);
const view: View = { w: 1440, h: 852, fovy: 2 * Math.atan(Math.tan(Math.PI / 6) / (1440 / 852)), focus: { x: f.x, y: f.y } };

describe("oblique pose", () => {
  it("puts the target exactly on the centre of the free area, pitched or not", () => {
    const { X, enu } = site(17.68, 77.01);
    for (const [pitch, heading] of [[OBLIQUE_PITCH_DEG, 0], [-90, 0], [-50, 35], [-65, 300]]) {
      const pose = poseAt(X, enu, 1_100_000, pitch, heading, view);
      const s = project(pose, X, view)!;
      expect(s.x).toBeCloseTo(f.x, 6);
      expect(s.y).toBeCloseTo(f.y, 6);
      // The target sits `depth` in front of the camera, so the ground scale at it is that of a camera
      // `depth` above it (what the scale bar and matched comparisons assume).
      expect(s.z).toBeCloseTo(1_100_000, 3);
    }
  });

  it("reports the pitch and heading it was built with", () => {
    const { X, enu } = site(-24.09, -69.99);
    const pose = poseAt(X, enu, 900_000, -50, 30, view);
    const a = attitudeAt(pose.direction, pose.up, enu);
    expect(a.pitchDeg).toBeCloseTo(-50, 6);
    expect(a.headingDeg).toBeCloseTo(30, 6);
    const nadir = poseAt(X, enu, 900_000, -90, 0, view);
    const b = attitudeAt(nadir.direction, nadir.up, enu);
    expect(b.pitchDeg).toBeCloseTo(-90, 6);
    expect(b.headingDeg).toBeCloseTo(0, 6);
  });

  it("looks down along the local vertical with north up when not tilted", () => {
    const { X, enu } = site(0, 0);
    const pose = poseAt(X, enu, 1_000_000, -90, 0, { ...view, focus: { x: 720, y: 426 } });
    expect(dot(pose.direction, enu.up)).toBeCloseTo(-1, 9);
    expect(dot(pose.up, enu.north)).toBeCloseTo(1, 9);
    expect(dot(pose.right, enu.east)).toBeCloseTo(1, 9);
  });

  it("stands south of a north-facing target, above the ground", () => {
    const { X, enu } = site(10, 20);
    const pose = poseAt(X, enu, 1_000_000, -50, 0, { ...view, focus: { x: 720, y: 426 } });
    const rel: Vec3 = [pose.position[0] - X[0], pose.position[1] - X[1], pose.position[2] - X[2]];
    expect(dot(rel, enu.north)).toBeLessThan(0);
    expect(dot(rel, enu.up)).toBeGreaterThan(0);
    expect(dot(rel, enu.up) / 1_000_000).toBeCloseTo(Math.sin(50 * D2R), 6);
  });
});

describe("flight rules", () => {
  it("ends site-scale flights tilted and whole-planet framings straight down", () => {
    expect(flightPitchDeg("mars", 1_100, true)).toBe(OBLIQUE_PITCH_DEG);
    expect(flightPitchDeg("mars", 3_000, true)).toBe(OBLIQUE_PITCH_DEG); // 100 km footprint flight
    expect(flightPitchDeg("mars", 9_200, true)).toBe(-90); // home
    expect(flightPitchDeg("earth", 1_100, true)).toBe(OBLIQUE_PITCH_DEG);
    expect(flightPitchDeg("earth", 5_000, true)).toBe(-90); // phone framings planned for a nadir camera
    expect(flightPitchDeg("mars", 1_100, false)).toBe(-90); // the user chose top-down
  });

  it("reads telemetry pitch as 3D whenever the camera is not looking straight down", () => {
    expect(isTilted(-90)).toBe(false);
    expect(isTilted(-88.5)).toBe(false);
    expect(isTilted(-80.5)).toBe(true); // tilted around Mars's home view, 10,400 km out
    expect(isTilted(-62)).toBe(true); // site-scale approach
    expect(isTilted(null)).toBe(false);
    expect(isTilted(undefined)).toBe(false);
  });

  it("fades tilt-only drawing in smoothly from top-down to oblique", () => {
    expect(tiltWeight(-90)).toBe(0);
    expect(tiltWeight(-87)).toBe(0);
    expect(tiltWeight(-74)).toBe(1);
    expect(tiltWeight(-50)).toBe(1);
    const mid = tiltWeight(-80.5);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it("measures how many pixels a metre of vertical spans on screen", () => {
    const { X, enu } = site(17.68, 77.01);
    const pose = poseAt(X, enu, 1_100_000, OBLIQUE_PITCH_DEG, 0, view);
    const ppm = verticalPxPerMetre(pose, X, enu.up, view);
    const a = project(pose, X, view)!;
    const top: Vec3 = [X[0] + enu.up[0] * 500, X[1] + enu.up[1] * 500, X[2] + enu.up[2] * 500];
    const b = project(pose, top, view)!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(500 * ppm, 2);
    // Looking straight down the vertical (target at the frame centre), a stem has no length on screen.
    const centred: View = { ...view, focus: { x: view.w / 2, y: view.h / 2 } };
    const nadir = poseAt(X, enu, 1_100_000, -90, 0, centred);
    expect(verticalPxPerMetre(nadir, X, enu.up, centred)).toBeCloseTo(0, 9);
  });

  it("stands a stem STEM_PX tall on screen in the 3D view, clear of the 48 px reticle", () => {
    const { X, enu } = site(17.68, 77.01);
    for (const depth of [400_000, 1_100_000, 3_000_000]) {
      const pose = poseAt(X, enu, depth, OBLIQUE_PITCH_DEG, 0, view);
      const h = stemHeightM(verticalPxPerMetre(pose, X, enu.up, view), -62, depth);
      const a = project(pose, X, view)!;
      const b = project(pose, [X[0] + enu.up[0] * h, X[1] + enu.up[1] * h, X[2] + enu.up[2] * h], view)!;
      // About STEM_PX: the height comes from the projection's slope at the ground, and the stem's top is
      // a little nearer the camera than its foot (a few per cent longer close in).
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      expect(px).toBeGreaterThan(STEM_PX - 1);
      expect(px).toBeLessThan(STEM_PX * 1.07);
      // The glyph's brackets (11 px from its centre) stay above the reticle's top edge (24 px).
      expect(px - 11).toBeGreaterThan(24);
    }
  });

  it("gives stems no height in a top-down view and keeps them below the camera", () => {
    expect(stemHeightM(0.0005, -90, 1e6)).toBe(0);
    expect(stemHeightM(0, -60, 1e6)).toBe(0);
    expect(stemHeightM(0.0005, -60, 1e6)).toBeCloseTo(STEM_PX / 0.0005, 6);
    // Nearly top-down a metre of vertical spans almost nothing: the cap holds the glyph down.
    expect(stemHeightM(1e-9, -80, 250_000)).toBe(250_000);
  });
});

describe("nadir aim", () => {
  it("matches the north-up aim the globe used before (heading 0)", () => {
    const mpp = 1_400;
    const n = nadirFor(17.68, 77.01, mpp, view, 0, R);
    const north = (f.y - 852 / 2) * mpp, east = -(f.x - 1440 / 2) * mpp;
    expect(n.lat).toBeCloseTo(17.68 + (north / R) / D2R, 9);
    expect(n.lon).toBeCloseTo(77.01 + (east / (R * Math.cos(17.68 * D2R))) / D2R, 9);
  });

  it("refines the nadir until the target sits on the focus point", () => {
    const sphere = (la: number, lo: number) => { const s = site(la, lo); return { ground: s.X, enu: s.enu }; };
    const target = site(17.68, 77.01);
    // A phone-like frame: the free area is a strip near the top, far from the frame centre.
    const phone: View = { w: 390, h: 844, fovy: Math.PI / 3, focus: { x: 195, y: 230 } };
    for (const [heightM, heading] of [[1_100_000, 0], [6_000_000, 0], [1_100_000, 40]]) {
      const mpp = (2 * heightM * Math.tan(phone.fovy / 2)) / phone.h;
      const n = exactNadirFor(target.X, heightM, mpp, phone, heading, sphere);
      const g = sphere(n.lat, n.lon);
      const s = project(nadirPose(g.ground, g.enu, heightM, heading), target.X, phone)!;
      expect(Math.hypot(s.x - phone.focus.x, s.y - phone.focus.y)).toBeLessThan(0.05);
    }
  });

  it("rotates the offset with the heading", () => {
    // Focus left of centre, heading 90° (screen up = east, screen left = north): the target must sit north
    // of the nadir, so the nadir moves south and not east or west.
    const n = nadirFor(0, 0, 1_000, view, 90, R);
    expect(n.lat).toBeLessThan(0);
    expect(Math.abs(n.lon)).toBeLessThan(1e-9);
  });
});

describe("fitting a box when pitched", () => {
  it("finds the closest depth that keeps every corner inside the free area", () => {
    const centre = site(-24, -70, 6_371_000);
    const corners: Vec3[] = [[-25.5, -71.5], [-25.5, -68.5], [-22.5, -68.5], [-22.5, -71.5]].map(([la, lo]) => site(la, lo, 6_371_000).X);
    const box = { x0: 40, x1: 1440 - 392 - 40, y0: 40, y1: 852 - 40 };
    const d = fitDepth(corners, centre.X, centre.enu, -50, 0, view, box, 1_000, 30_000_000);
    const inside = (depth: number) => {
      const pose = poseAt(centre.X, centre.enu, depth, -50, 0, view);
      return corners.every((X) => {
        const s = project(pose, X, view);
        return !!s && facesCamera(X, pose.position) && s.x >= box.x0 && s.x <= box.x1 && s.y >= box.y0 && s.y <= box.y1;
      });
    };
    expect(inside(d)).toBe(true);
    expect(inside(d * 0.98)).toBe(false);
  });
});
