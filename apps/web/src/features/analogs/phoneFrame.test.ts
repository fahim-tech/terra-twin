import { describe, expect, it } from "vitest";
import { R_EARTH_MEAN_M } from "../../lib/geodesy";
import { fovy, phoneFrame, project, targetForNadir } from "./phoneFrame";

const PHONE = { w: 390, h: 796, top: 64, right: 0, bottom: 412, left: 0 };
// A tie spread from East Africa to South-East Asia (the terrain-geometry-only tie for Jezero).
const TIE = [{ lat: -10.56, lon: 33.71 }, { lat: 24.9, lon: 69.4 }, { lat: 18.2, lon: 99.1 }];

describe("project", () => {
  it("puts the nadir at the canvas centre and hides the far side", () => {
    const n = { lat: 10, lon: 60 };
    const c = project(n, n, 8000, PHONE)!;
    expect(c.x).toBeCloseTo(PHONE.w / 2, 6);
    expect(c.y).toBeCloseTo(PHONE.h / 2, 6);
    expect(project({ lat: -10, lon: -120 }, n, 8000, PHONE)).toBeNull();
  });
  it("draws north up and east right", () => {
    const n = { lat: 0, lon: 0 };
    expect(project({ lat: 5, lon: 0 }, n, 5000, PHONE)!.y).toBeLessThan(PHONE.h / 2);
    expect(project({ lat: 0, lon: 5 }, n, 5000, PHONE)!.x).toBeGreaterThan(PHONE.w / 2);
  });
});

describe("phoneFrame", () => {
  it("fits a continent-wide tie inside the strip above the sheet", () => {
    const fit = phoneFrame(TIE, PHONE, { lat: 12, lon: 67 }, { reserveRight: 48 })!;
    expect(fit.inside).toBe(TIE.length);
    for (const p of TIE) {
      const s = project(p, fit.nadir, fit.heightKm, PHONE)!;
      expect(s.y).toBeGreaterThan(PHONE.top);
      expect(s.y).toBeLessThan(PHONE.h - PHONE.bottom);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(PHONE.w - 48);
    }
    expect(fit.heightKm).toBeLessThanOrEqual(22_000);
  });
});

describe("targetForNadir", () => {
  it("inverts the globe's free-area aim so the camera lands on the chosen nadir", () => {
    const nadir = { lat: -20, lon: 70 }, hk = 9000;
    const t = targetForNadir(nadir, hk, PHONE);
    // The globe's aimFor: nadir = target + (free-centre offset × metres per pixel at nadir).
    const mpp = (2 * hk * 1000 * Math.tan(fovy(PHONE.w, PHONE.h) / 2)) / PHONE.h;
    const fy = PHONE.top + (PHONE.h - PHONE.top - PHONE.bottom) / 2;
    const aimedLat = t.lat + ((fy - PHONE.h / 2) * mpp / R_EARTH_MEAN_M) * (180 / Math.PI);
    expect(aimedLat).toBeCloseTo(nadir.lat, 6);
    expect(t.lon).toBeCloseTo(nadir.lon, 6);
  });
});
