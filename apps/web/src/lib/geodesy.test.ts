import { describe, expect, it } from "vitest";
import { MARS_IAU2000, R_MARS_M, centricToGraphic, destination, distanceKm, graphicToCentric, normLon, squareFootprint } from "./geodesy";

describe("Mars latitude conventions", () => {
  it("round-trips planetocentric ↔ planetographic", () => {
    for (const lat of [-89, -45, -17.3, 0, 17.6756, 45, 89]) {
      const g = centricToGraphic(lat, MARS_IAU2000.a, MARS_IAU2000.b);
      expect(graphicToCentric(g, MARS_IAU2000.a, MARS_IAU2000.b)).toBeCloseTo(lat, 10);
    }
  });
  it("planetographic exceeds planetocentric at mid latitudes by ~0.34°", () => {
    const g = centricToGraphic(45, MARS_IAU2000.a, MARS_IAU2000.b);
    expect(g - 45).toBeGreaterThan(0.3);
    expect(g - 45).toBeLessThan(0.4);
  });
  it("is the identity on a sphere", () => {
    expect(centricToGraphic(33.3, R_MARS_M, R_MARS_M)).toBeCloseTo(33.3, 12);
  });
});

describe("footprints", () => {
  it("normalises longitudes east-positive in -180..180", () => {
    expect(normLon(190)).toBe(-170);
    expect(normLon(-190)).toBe(170);
    expect(normLon(77)).toBe(77);
  });
  it("builds a 50 km square on Mars with correct half-diagonal", () => {
    const c = squareFootprint(17.6756, 77.0127, 50, R_MARS_M);
    for (const p of c) expect(distanceKm(17.6756, 77.0127, p.lat, p.lon, R_MARS_M)).toBeCloseTo(25 * Math.SQRT2, 6);
  });
  it("crosses the antimeridian", () => {
    const p = destination(0, 179.9, 90, 50_000, R_MARS_M);
    expect(p.lon).toBeLessThan(-179);
  });
});
