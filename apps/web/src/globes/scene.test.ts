import { describe, expect, it } from "vitest";
import { R_EARTH_MEAN_M, R_MARS_M, distanceKm } from "../lib/geodesy";
import { VOLUME_PX, footprintCorners, footprintSideKm, hasScanVolume, outlineRing, scanHeightM, slerp, volumeSizeWeight } from "./footprints";
import { MARS_MOONS, orbitFade, orbitLabel, orbitPoint, orbitRing, refineMin } from "./moons";
import { daysSinceJ2000, icrfToMarsFixed, marsOrientation } from "./sky";

describe("moon orbits", () => {
  it("labels each orbit with its semi-major axis", () => {
    expect(MARS_MOONS.map(orbitLabel)).toEqual(["PHOBOS · a 9,376 km", "DEIMOS · a 23,463.2 km"]);
  });

  it("draws true-scale circles in Mars's equatorial plane", () => {
    const ring = orbitRing(9_376, 360);
    expect(ring).toHaveLength(361);
    expect(ring[0]).toEqual(ring[360]);
    for (const [x, y, z] of ring) {
      expect(z).toBe(0);
      expect(Math.hypot(x, y)).toBeCloseTo(9_376_000, 3);
    }
    const p = orbitPoint(23_463.2, Math.PI / 2);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(23_463_200, 3);
  });

  it("slides an orbit label continuously to the nearest allowed point, not to the nearest sample", () => {
    // The preferred spot sits between two coarse samples: the label lands on it, not on either sample.
    const best = refineMin((t) => (t - 0.0137) ** 2, 0, 0.0262);
    expect(best.t).toBeCloseTo(0.0137, 6);
    // A forbidden stretch (over the planet's disc) is never chosen even when it is nearer.
    const walled = refineMin((t) => (t < 0.01 ? Infinity : (t - 0.005) ** 2), 0, 0.0262);
    expect(walled.t).toBeGreaterThanOrEqual(0.01);
    expect(walled.t).toBeLessThan(0.0105);
    expect(Number.isFinite(walled.c)).toBe(true);
  });

  it("shows the orbits in whole-planet views and hides them near a site", () => {
    expect(orbitFade(9_200)).toBe(1); // intro / home altitude
    expect(orbitFade(850)).toBe(0); // oblique site approach
    expect(orbitFade(4_000)).toBeGreaterThan(0);
    expect(orbitFade(4_000)).toBeLessThan(1);
    expect(orbitFade(3_000)).toBeLessThan(orbitFade(5_000));
  });
});

describe("footprint outlines", () => {
  const window50 = { id: "w", kind: "window" as const, lat: -24.09, lon: -69.99, km: 50 };

  it("samples a window's edges densely enough to stay above the globe's tiles", () => {
    const ring = outlineRing(window50, R_EARTH_MEAN_M);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // No segment longer than ~2 km: a 2 km chord sags 0.08 m on Earth (50 km chord: 49 m).
    for (let i = 1; i < ring.length; i++) {
      expect(distanceKm(ring[i - 1].lat, ring[i - 1].lon, ring[i].lat, ring[i].lon, R_EARTH_MEAN_M)).toBeLessThan(2.1);
    }
    // Every corner is on the outline.
    for (const c of footprintCorners(window50, R_EARTH_MEAN_M)!) {
      expect(ring.some((p) => Math.abs(p.lat - c.lat) < 1e-9 && Math.abs(p.lon - c.lon) < 1e-9)).toBe(true);
    }
  });

  it("follows parallels and meridians for geographic boxes, across the antimeridian too", () => {
    const box = { id: "z", kind: "research_bbox" as const, lat: 0, lon: 180, bbox: [178, -1, -178, 1] as [number, number, number, number] };
    const ring = outlineRing(box, R_MARS_M);
    const south = ring.filter((p) => Math.abs(p.lat + 1) < 1e-12);
    expect(south.length).toBeGreaterThan(10);
    // The south edge runs east from 178° through 180° to −178°, never back across the planet.
    for (const p of south) expect(Math.abs(p.lon) >= 178 - 1e-9).toBe(true);
  });

  it("keeps great-circle midpoints on the circle", () => {
    const a = { lat: 10, lon: 20 }, b = { lat: 12, lon: 25 };
    const m = slerp(a, b, 0.5);
    const d1 = distanceKm(a.lat, a.lon, m.lat, m.lon, R_MARS_M), d2 = distanceKm(m.lat, m.lon, b.lat, b.lon, R_MARS_M);
    expect(d1).toBeCloseTo(d2, 6);
    expect(d1 + d2).toBeCloseTo(distanceKm(a.lat, a.lon, b.lat, b.lon, R_MARS_M), 6);
  });

  it("gives scan volumes a visual height from the footprint's own size", () => {
    expect(footprintSideKm(window50, R_EARTH_MEAN_M)).toBe(50);
    expect(scanHeightM(window50, R_EARTH_MEAN_M)).toBe(15_000);
    const cell = { id: "c", kind: "cell" as const, lat: 18, lon: 77, bbox: [76, 17, 78, 19] as [number, number, number, number] };
    const side = footprintSideKm(cell, R_MARS_M)!;
    expect(side).toBeCloseTo(2 * (Math.PI / 180) * (R_MARS_M / 1000) * Math.cos(18 * Math.PI / 180), 6);
    expect(scanHeightM(cell, R_MARS_M)).toBeCloseTo(side * 300, 6);
    expect(scanHeightM({ id: "a", kind: "aoi", lat: 0, lon: 0, km: 1 }, R_MARS_M)).toBe(300);
  });

  it("draws nothing for a footprint whose payload carries no size (no default square)", () => {
    const bare = { id: "x", kind: "window" as const, lat: 10, lon: 20 };
    expect(footprintCorners(bare, R_EARTH_MEAN_M)).toBeNull();
    expect(outlineRing(bare, R_EARTH_MEAN_M)).toEqual([]);
    expect(footprintSideKm(bare, R_EARTH_MEAN_M)).toBeNull();
    expect(scanHeightM(bare, R_EARTH_MEAN_M)).toBe(0);
    expect(footprintCorners({ ...bare, km: 0 }, R_EARTH_MEAN_M)).toBeNull();
  });

  it("keeps research zones flat and raises scanned footprints", () => {
    expect(hasScanVolume("research_bbox")).toBe(false);
    expect(hasScanVolume("aoi")).toBe(true);
    expect(hasScanVolume("cell")).toBe(true);
    expect(hasScanVolume("window")).toBe(true);
  });

  it("raises a volume only once its footprint reads as a box on screen", () => {
    const [flat, whole] = VOLUME_PX;
    expect(volumeSizeWeight(30)).toBe(0); // a 25 km footprint seen from the 1,100 km approach
    expect(volumeSizeWeight(flat)).toBe(0);
    expect(volumeSizeWeight(whole)).toBe(1);
    expect(volumeSizeWeight(300)).toBe(1); // the matched comparison windows
    const mid = volumeSizeWeight((flat + whole) / 2);
    expect(mid).toBeCloseTo(0.5, 9);
    expect(volumeSizeWeight(70)).toBeLessThan(volumeSizeWeight(90));
  });
});

describe("Mars sky orientation", () => {
  it("uses the IAU 2000 elements at J2000", () => {
    // J2000.0 is 12:00 TT; the module converts UTC with today's TT − UTC (69.184 s).
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) - 69_184);
    expect(daysSinceJ2000(j2000)).toBeCloseTo(0, 9);
    expect(daysSinceJ2000(new Date(Date.UTC(2000, 0, 2, 12, 0, 0) - 69_184))).toBeCloseTo(1, 9);
    const o = marsOrientation(j2000);
    expect(o.ra).toBeCloseTo(317.68143, 6);
    expect(o.dec).toBeCloseTo(52.8865, 6);
    expect(o.W).toBeCloseTo(176.63, 4);
  });

  it("is a proper rotation that maps Mars's pole to the body z axis", () => {
    const date = new Date(Date.UTC(2026, 10, 15, 8, 0, 0));
    const m = icrfToMarsFixed(date);
    const row = (i: number) => m.slice(i * 3, i * 3 + 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const d = row(i).reduce((s, v, k) => s + v * row(j)[k], 0);
        expect(d).toBeCloseTo(i === j ? 1 : 0, 12);
      }
    }
    const { ra, dec } = marsOrientation(date);
    const a = (ra * Math.PI) / 180, dl = (dec * Math.PI) / 180;
    const pole = [Math.cos(dl) * Math.cos(a), Math.cos(dl) * Math.sin(a), Math.sin(dl)];
    const body = [0, 1, 2].map((i) => row(i).reduce((s, v, k) => s + v * pole[k], 0));
    expect(body[0]).toBeCloseTo(0, 12);
    expect(body[1]).toBeCloseTo(0, 12);
    expect(body[2]).toBeCloseTo(1, 12);
    // Right-handed (determinant +1).
    const [x, y, z] = [row(0), row(1), row(2)];
    const det = x[0] * (y[1] * z[2] - y[2] * z[1]) - x[1] * (y[0] * z[2] - y[2] * z[0]) + x[2] * (y[0] * z[1] - y[1] * z[0]);
    expect(det).toBeCloseTo(1, 12);
  });

  it("turns the prime meridian W east of the node on Mars's equator", () => {
    const date = new Date(Date.UTC(2026, 0, 1));
    const m = icrfToMarsFixed(date);
    const { ra, W } = marsOrientation(date);
    const a = (ra * Math.PI) / 180;
    const node = [-Math.sin(a), Math.cos(a), 0];
    const body = [0, 1, 2].map((i) => m.slice(i * 3, i * 3 + 3).reduce((s, v, k) => s + v * node[k], 0));
    const lon = (Math.atan2(body[1], body[0]) * 180) / Math.PI;
    // The node sits at body longitude −W (wrapped to ±180°).
    expect((((lon + W) % 360) + 540) % 360 - 180).toBeCloseTo(0, 6);
  });
});
