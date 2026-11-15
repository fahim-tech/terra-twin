import { describe, expect, it } from "vitest";
import { distanceKm, R_MARS_M } from "../../lib/geodesy";
import {
  EARTH_WGS84, edgeTicks, formatTick, groundAt, MARS_IAU2000_BODY, MARS_SPHERE, minorDivisions, nadirKmPerPx, plateBody, plateCamera, plateTicks, tickStep,
  visibleRect,
} from "./plateGeometry";

const W = 800;
const H = 471; // a 1.7 : 1 globe canvas scaled to 800 px, like a desktop snapshot

describe("plate camera", () => {
  it("puts the target under the image centre on each rendering body", () => {
    const sphere = groundAt(plateCamera(MARS_SPHERE, 17.6756, 77.0127, 420, W, H), W / 2, H / 2)!;
    expect(sphere.lat).toBeCloseTo(17.6756, 9);
    expect(sphere.lon).toBeCloseTo(77.0127, 9);
    // On an ellipsoid Cesium's local frame uses the normal formula at the camera, so the nadir is offset by metres, not degrees.
    const iau = groundAt(plateCamera(MARS_IAU2000_BODY, 17.6756, 77.0127, 420, W, H), W / 2, H / 2)!;
    expect(Math.abs(iau.lat - 17.6756)).toBeLessThan(0.01);
    expect(Math.abs(iau.lon - 77.0127)).toBeLessThan(1e-9);
    const earth = groundAt(plateCamera(EARTH_WGS84, -24.09, -69.99, 420, W, H), W / 2, H / 2)!;
    expect(Math.abs(earth.lat + 24.09)).toBeLessThan(0.005);
    expect(earth.lon).toBeCloseTo(-69.99, 9);
  });

  it("matches the spherical off-nadir formula at the edge of the field of view", () => {
    // 60° across the wider side: the right edge is 30° off nadir. Ground angle γ = asin((R + h) / R · sin 30°) − 30°.
    const R = R_MARS_M / 1000;
    const gamma = Math.asin(((R + 420) / R) * Math.sin(Math.PI / 6)) * (180 / Math.PI) - 30;
    const g = groundAt(plateCamera(MARS_SPHERE, 0, 10, 420, W, H), W, H / 2)!;
    expect(g.lat).toBeCloseTo(0, 9);
    expect(g.lon - 10).toBeCloseTo(gamma, 6);
    // East is to the right and north is up.
    const left = groundAt(plateCamera(MARS_SPHERE, 0, 10, 420, W, H), 0, H / 2)!;
    expect(left.lon - 10).toBeCloseTo(-gamma, 6);
    const top = groundAt(plateCamera(MARS_SPHERE, 0, 10, 420, W, H), W / 2, 0)!;
    expect(top.lat).toBeGreaterThan(0);
  });

  it("uses the vertical field of view on a portrait canvas", () => {
    const cam = plateCamera(MARS_SPHERE, 0, 0, 420, 400, 800);
    const R = R_MARS_M / 1000;
    const gamma = Math.asin(((R + 420) / R) * Math.sin(Math.PI / 6)) * (180 / Math.PI) - 30;
    expect(groundAt(cam, 200, 0)!.lat).toBeCloseTo(gamma, 6);
  });

  it("reports the nadir scale the plate frame and scale bar use", () => {
    const cam = plateCamera(MARS_SPHERE, 17.6756, 77.0127, 420, W, H);
    const a = groundAt(cam, W / 2, H / 2)!;
    const b = groundAt(cam, W / 2 + 1, H / 2)!;
    const km = distanceKm(a.lat, a.lon, b.lat, b.lon, R_MARS_M);
    expect(Math.abs(km / nadirKmPerPx(cam) - 1)).toBeLessThan(1e-3);
    // Same as the flat nadir formula 2·h·tan(30°) / max(w, h).
    expect(nadirKmPerPx(cam)).toBeCloseTo((2 * 420 * Math.tan(Math.PI / 6)) / W, 9);
  });

  it("returns null for a ray that misses the planet", () => {
    const cam = plateCamera(MARS_SPHERE, 0, 0, 40_000, W, H, 170);
    expect(groundAt(cam, 0, 0)).toBeNull();
  });

  it("chooses the rendering body like the globe does", () => {
    expect(plateBody("mars", null)).toBe(MARS_SPHERE);
    expect(plateBody("mars", "token")).toBe(MARS_IAU2000_BODY);
    expect(plateBody("earth", null)).toBe(EARTH_WGS84);
  });
});

describe("plate ticks", () => {
  it("crops the snapshot to the plate like object-fit: cover", () => {
    expect(visibleRect(1600, 900)).toEqual({ x: 200, y: 0, w: 1200, h: 900 });
    expect(visibleRect(600, 900)).toEqual({ x: 0, y: 225, w: 600, h: 450 });
  });

  it("picks graticule intervals and minor divisions", () => {
    expect(tickStep(6.8)).toBe(1);
    expect(tickStep(3.8)).toBe(1);
    expect(tickStep(3.4)).toBe(0.5);
    expect(tickStep(0.3)).toBe(0.05);
    expect(tickStep(500)).toBe(30);
    expect([1, 2, 2.5, 5, 0.5, 0.25, 0.2, 0.1, 10, 15, 30].map(minorDivisions)).toEqual([4, 4, 5, 5, 5, 5, 4, 4, 4, 3, 3]);
  });

  it("labels ticks with hemisphere letters and the interval's decimals", () => {
    expect(formatTick(18, "lat", 1)).toBe("18°N");
    expect(formatTick(-24.5, "lat", 0.5)).toBe("24.5°S");
    expect(formatTick(-69.75, "lon", 0.25)).toBe("69.75°W");
    expect(formatTick(77, "lon", 1)).toBe("77°E");
    expect(formatTick(0, "lat", 1)).toBe("0°");
    expect(formatTick(180, "lon", 2)).toBe("180°");
    expect(formatTick(-1e-12, "lon", 1)).toBe("0°");
  });

  it("places meridians west to east and parallels north to south at true crossings", () => {
    const cam = plateCamera(MARS_SPHERE, 17.6756, 77.0127, 420, W, H);
    const rect = visibleRect(W, H);
    const t = plateTicks(cam, rect)!;
    expect(t.step).toBe(1);
    for (const edge of ["top", "bottom"] as const) {
      const ticks = t[edge];
      expect(ticks.length).toBeGreaterThan(8);
      for (let i = 1; i < ticks.length; i++) expect(ticks[i].value).toBeGreaterThan(ticks[i - 1].value);
      // Every tick sits where the edge actually crosses its meridian.
      for (const k of ticks) {
        const g = groundAt(cam, rect.x + k.at * rect.w, edge === "top" ? rect.y : rect.y + rect.h)!;
        expect(Math.abs(g.lon - k.value)).toBeLessThan(0.002);
        expect(Math.abs(k.value / 0.25 - Math.round(k.value / 0.25))).toBeLessThan(1e-9);
        expect(k.major).toBe(Math.abs(k.value - Math.round(k.value)) < 1e-9);
      }
    }
    for (const edge of ["left", "right"] as const) {
      const ticks = t[edge];
      for (let i = 1; i < ticks.length; i++) expect(ticks[i].value).toBeLessThan(ticks[i - 1].value);
      for (const k of ticks) {
        const g = groundAt(cam, edge === "left" ? rect.x : rect.x + rect.w, rect.y + k.at * rect.h)!;
        expect(Math.abs(g.lat - k.value)).toBeLessThan(0.002);
      }
    }
    expect(t.left.filter((k) => k.major).map((k) => k.value)).toEqual([20, 19, 18, 17, 16]);
  });

  it("keeps meridian ticks continuous across the antimeridian", () => {
    const cam = plateCamera(EARTH_WGS84, 10, 179.8, 420, W, H);
    const ticks = edgeTicks(cam, visibleRect(W, H), "top", 1).filter((k) => k.major);
    const values = ticks.map((k) => k.value);
    expect(values).toContain(180);
    const i = values.indexOf(180);
    expect(values.slice(0, i).every((v) => v > 0 && v < 180)).toBe(true);
    expect(values.slice(i + 1).every((v) => v < 0)).toBe(true);
    for (let j = 1; j < ticks.length; j++) expect(ticks[j].at).toBeGreaterThan(ticks[j - 1].at);
  });
});
