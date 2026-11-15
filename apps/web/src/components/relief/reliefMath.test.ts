import { describe, expect, it } from "vitest";
import {
  anchorShown, ariaSummary, axisPlacement, baseElevation, boxEdges, buildModel, camera, contourInterval, contourSegments, gradients, gridStats,
  fitDistance, fmtPitch, hillshade, homePose, labelAnchors, layoutLabels, niceStep, niceTicks, pickCell, project, representationNote, sunVector, TINT, toGrid,
  worldY, type Grid,
} from "./reliefMath";

/** Plane z = a·east + b·north on a north-up grid (row 0 = north). */
function plane(rows: number, cols: number, cellM: number, a: number, b: number, gaps: [number, number][] = []): Grid {
  const elevation: (number | null)[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) elevation.push(a * j * cellM + b * (rows - 1 - i) * cellM);
  for (const [i, j] of gaps) elevation[i * cols + j] = null;
  return toGrid({ rows, cols, cell_m: cellM, elevation });
}

describe("grid basics", () => {
  it("keeps missing cells missing and ranges over valid cells only", () => {
    const g = toGrid({ rows: 2, cols: 2, cell_m: 10, elevation: [5, null, -3, 12] });
    expect(Number.isNaN(g.z[1])).toBe(true);
    expect(gridStats(g)).toEqual({ min: -3, max: 12, valid: 3, validFraction: 0.75 });
  });
  it("has no range (not 0) when nothing has an elevation", () => {
    const s = gridStats(toGrid({ rows: 1, cols: 2, cell_m: 10, elevation: [null, null] }));
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
    expect(buildModel(toGrid({ rows: 1, cols: 2, cell_m: 10, elevation: [null, null] }))).toBeNull();
  });
});

describe("gradients", () => {
  it("recovers a plane's east and north slopes, including edges and beside gaps", () => {
    const g = plane(5, 5, 100, 0.02, 0.03, [[2, 2]]);
    const d = gradients(g);
    for (let k = 0; k < g.z.length; k++) {
      if (Number.isNaN(g.z[k])) continue;
      expect(d[k * 2]).toBeCloseTo(0.02, 6);
      expect(d[k * 2 + 1]).toBeCloseTo(0.03, 6); // rises to the north: row 0 is north
    }
  });
});

describe("scales", () => {
  it("picks standard contour intervals with their index interval", () => {
    expect(contourInterval(1659.7)).toEqual({ interval: 100, index: 500 }); // Atacama Yungay
    expect(contourInterval(4048.5)).toEqual({ interval: 250, index: 1000 }); // Mauna Kea
    expect(contourInterval(39)).toEqual({ interval: 5, index: 25 });
    expect(contourInterval(19.4)).toEqual({ interval: 2, index: 10 });
    expect(contourInterval(0)).toBeNull();
    expect(contourInterval(null)).toBeNull();
  });
  it("puts the floor one interval below the lowest contour", () => {
    expect(baseElevation(759.3, 100)).toBe(600);
    expect(baseElevation(-5.3, 10)).toBe(-20);
    expect(baseElevation(24.3, 5)).toBe(15);
  });
  it("writes the HUD pitch with a single true minus sign", () => {
    expect(fmtPitch((30 * Math.PI) / 180)).toBe("−30°");
    expect(fmtPitch((88.4 * Math.PI) / 180)).toBe("−88°");
    expect(fmtPitch(0)).toBe("0°");
    expect(fmtPitch((-14 * Math.PI) / 180)).toBe("14°"); // never "−−14°"
  });
  it("chooses 1·2·5 ticks", () => {
    expect(niceStep(50.014, 5)).toBe(10);
    expect(niceTicks(0, 50.014, 5).values).toEqual([0, 10, 20, 30, 40, 50]);
    expect(niceTicks(600, 2419, 4)).toEqual({ step: 500, values: [1000, 1500, 2000] });
    expect(niceTicks(5, 5, 4).values).toEqual([]);
  });
});

describe("mesh", () => {
  const g = toGrid({ rows: 3, cols: 3, cell_m: 100, elevation: [10, 20, 30, 40, 50, 60, 70, 80, null] });
  const m = buildModel(g)!;

  it("spans the full window, north-up, with an edge ring", () => {
    expect(m.terrain.length / 5).toBe(5 * 5);
    expect(m.hx).toBeCloseTo(0.5);
    expect(m.terrain[0]).toBeCloseTo(-0.5); // lattice (0, 0): north-west corner
    expect(m.terrain[1]).toBeCloseTo(-0.5);
    const nw = (1 * 5 + 1) * 5; // first cell centre: row 0 (north), column 0 (west)
    expect(m.terrain[nw]).toBeLessThan(0); // west: −X
    expect(m.terrain[nw + 1]).toBeLessThan(0); // north: −Z
    expect(m.terrain[nw + 2]).toBe(10);
  });
  it("never draws a triangle through a missing cell", () => {
    const valid = (v: number) => Number.isFinite(g.z[Math.min(2, Math.max(0, Math.floor(v / 5) - 1)) * 3 + Math.min(2, Math.max(0, (v % 5) - 1))]);
    expect(m.terrainIndex.length % 3).toBe(0);
    for (const v of m.terrainIndex) expect(valid(v)).toBe(true);
    // the south-east cell is missing, so its quadrant has fewer triangles than a full 4 × 4 lattice (32)
    expect(m.terrainIndex.length / 3).toBeLessThan(32);
  });
  it("puts walls down to the floor and the floor under the lowest cell", () => {
    expect(m.zBase).toBeLessThan(m.zMin);
    for (let k = 0; k < m.walls.length; k += 5) expect(m.walls[k + 2] >= m.zBase).toBe(true);
    expect(m.lines.ranges.floor[1]).toBe(8);
    expect(m.lines.verticals).toHaveLength(4);
    expect(m.lines.tops).toHaveLength(4);
  });
  it("labels km from the south-west corner on a real window", () => {
    const real = buildModel(plane(108, 108, 463.0935415503709, 0.001, 0))!;
    expect(real.kmTicks.x).toEqual([0, 10, 20, 30, 40, 50]);
    expect(real.kmTicks.stepKm).toBe(10);
    const anchors = labelAnchors(real);
    expect(anchors.find((a) => a.key === "km-s-5")!.text).toBe("50 km E");
    expect(anchors.find((a) => a.key === "km-w-5")!.text).toBe("50 km N");
    expect(anchors.find((a) => a.key === "north")!.p[2]).toBeLessThan(-real.hz); // north arrow beyond the north edge
  });
});

describe("camera", () => {
  const m = buildModel(plane(20, 20, 500, 0.01, 0.02))!;
  const pose = { az: (205 * Math.PI) / 180, el: (30 * Math.PI) / 180, zoom: 1, ve: 4 };
  const cam = camera(m, pose, 800, 500);

  it("looks at the block from the requested side", () => {
    expect(cam.headingDeg).toBeCloseTo(25, 6);
    const c = project(cam.viewProj, cam.target, 800, 500);
    expect(c.x).toBeCloseTo(400, 3);
    expect(c.y).toBeCloseTo(250, 3);
    expect(cam.ys).toBeCloseTo(4 * m.scale, 12);
  });
  it("labels the floor edges facing the camera", () => {
    const place = axisPlacement(cam);
    expect(place).toEqual({ ns: "south", we: "west", corner: 1 }); // elevation scale at NE, diagonal to the km origin (SW)
    const anchors = labelAnchors(m);
    expect(anchors.filter((a) => a.kind === "km" && anchorShown(a, place)).every((a) => /km-(s|w)-/.test(a.key))).toBe(true);
    expect(anchors.filter((a) => a.kind === "elev" && anchorShown(a, place)).every((a) => a.key.startsWith(`el-${place.corner}-`))).toBe(true);
    // Box: no vertical at the near corner (SW), top edges only on the back sides (N, E).
    expect(boxEdges(place)).toEqual({ verticals: [0, 1, 2], tops: [0, 1] });
  });
});

describe("framing and probe", () => {
  const g = plane(20, 20, 500, 0.01, 0.02, [[12, 3]]);
  const m = buildModel(g)!;
  const cam = camera(m, { ...homePose(4), zoom: 1 }, 900, 560);
  const centreOf = (row: number, col: number) => {
    const x = -m.hx + (col + 0.5) * g.cellM * m.scale, z = -m.hz + (row + 0.5) * g.cellM * m.scale;
    const e = g.z[row * g.cols + col];
    return project(cam.viewProj, [x, worldY(m, Number.isFinite(e) ? e : m.zBase, cam.ys), z], 900, 560);
  };

  it("frames the whole box at the home elevation, whatever the azimuth", () => {
    for (const azDeg of [0, 45, 205, 300]) {
      const c = camera(m, { ...homePose(8), az: (azDeg * Math.PI) / 180 }, 390, 520);
      for (const [x, z] of [[-m.hx, -m.hz], [m.hx, -m.hz], [m.hx, m.hz], [-m.hx, m.hz]]) {
        for (const y of [0, (m.zMax - m.zBase) * c.ys]) {
          const s = project(c.viewProj, [x, y, z], 390, 520);
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThanOrEqual(390);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(520);
        }
      }
    }
    expect(fitDistance(m, 0.1, 0.5, 0.5)).toBeGreaterThan(fitDistance(m, 0.1, 2, 0.5)); // portrait needs more distance
  });

  it("reads the cell under the pointer from the grid itself", () => {
    const s = centreOf(5, 7);
    const hit = pickCell(m, g, cam, s.x, s.y, 900, 560)!;
    expect([hit.row, hit.col]).toEqual([5, 7]);
    expect(hit.elevation).toBe(g.z[5 * 20 + 7]);
    expect(hit.eastKm).toBeCloseTo(7.5 * 0.5, 9);
    expect(hit.northKm).toBeCloseTo((20 - 5 - 0.5) * 0.5, 9); // row 0 is north
  });

  it("reports a gap as no elevation and the background as nothing", () => {
    // From overhead the floor of a one-cell gap is visible (obliquely, the terrain in front hides it).
    const above = camera(m, { ...homePose(4), el: (88 * Math.PI) / 180 }, 900, 560);
    const x = -m.hx + 3.5 * g.cellM * m.scale, z = -m.hz + 12.5 * g.cellM * m.scale;
    const s = project(above.viewProj, [x, 0, z], 900, 560);
    const hit = pickCell(m, g, above, s.x, s.y, 900, 560)!;
    expect([hit.row, hit.col]).toEqual([12, 3]);
    expect(hit.elevation).toBeNull();
    expect(pickCell(m, g, cam, 2, 2, 900, 560)).toBeNull();
  });

  it("lays labels out on screen, elevation labels outside their corner", () => {
    const placed = layoutLabels(m, labelAnchors(m), cam, 900, 560);
    expect(placed.some((l) => l.text === "N")).toBe(true);
    expect(placed.filter((l) => l.kind === "elev").every((l) => l.align === "left" || l.align === "right")).toBe(true);
    expect(placed.filter((l) => l.kind === "km").every((l) => /^km-(s|w)-/.test(l.key))).toBe(true);
  });
});

describe("hillshade and contours", () => {
  it("lights the north-west from 315° / 45° and leaves gaps transparent", () => {
    const L = sunVector();
    expect(Math.hypot(...L)).toBeCloseTo(1, 9);
    expect(L[0]).toBeLessThan(0); // west
    expect(L[2]).toBeLessThan(0); // north (−Z)
    const facingNW = hillshade(plane(4, 4, 100, 0.3, -0.3), 1, TINT.earth); // rises to the south-east: faces north-west
    const facingSE = hillshade(plane(4, 4, 100, -0.3, 0.3), 1, TINT.earth);
    expect(facingNW[5 * 4]).toBeGreaterThan(facingSE[5 * 4]);
    const gap = hillshade(plane(2, 2, 100, 0, 0, [[0, 0]]), 1, TINT.mars);
    expect(gap[3]).toBe(0);
    expect(gap[7]).toBe(255);
  });
  it("traces a level with marching squares and skips squares touching a gap", () => {
    const g = toGrid({ rows: 3, cols: 3, cell_m: 1, elevation: [0, 1, 2, 0, 1, 2, 0, 1, null] });
    const segs = contourSegments(g, 0.5);
    expect(segs).toEqual([0.5, 0, 0.5, 1, 0.5, 1, 0.5, 2]);
    expect(contourSegments(g, 1.5)).toEqual([1.5, 0, 1.5, 1]); // the lower-right square touches the gap
  });
});

describe("accessible summary", () => {
  const base = { id: "Atacama Yungay", lat: -24.09, lon: -69.99, rows: 108, cols: 108, cell_m: 463.0935415503709 };
  it("states the real values and the exaggeration", () => {
    const s = ariaSummary({ ...base, z_min: 759.3, z_max: 2419, valid_fraction: 1 }, 4, "earth");
    expect(s).toContain("24.090° S, 69.990° W");
    expect(s).toContain("50.0 by 50.0 km");
    expect(s).toContain("759 to 2,419 metres, relief 1,660 metres");
    expect(s).toContain("×4");
    expect(s).not.toContain("no elevation");
  });
  it("calls the shading light what it is, never the sun at the site", () => {
    const s = ariaSummary({ ...base, z_min: 759.3, z_max: 2419, valid_fraction: 1 }, 4, "earth");
    expect(s).toContain("fixed cartographic light from 315° at 45°, not the real sun");
  });
  it("words the grid's representation per planet, with no MOLA-operator clause for Mars", () => {
    expect(representationNote("earth", "as_measured")).toBe("Earth as measured: the MOLA observation operator is not applied");
    expect(representationNote("earth", "mars_observation_space")).toBe("Earth as MOLA would observe it");
    expect(representationNote("mars", "as_measured")).toBe("Mars as measured");
    expect(representationNote("mars", "as_measured")).not.toMatch(/operator/);
  });
  it("never turns a missing range into 0", () => {
    const s = ariaSummary({ ...base, z_min: null, z_max: null, valid_fraction: 0 }, 2, "mars", "2d");
    expect(s).toContain("No cell has an elevation");
    expect(s).not.toMatch(/\b0 metres/);
    expect(s).toContain("100.0 % of cells have no elevation");
  });
});
