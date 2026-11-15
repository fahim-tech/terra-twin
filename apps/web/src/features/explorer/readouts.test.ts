import { describe, expect, it } from "vitest";
import type { MarsSite } from "../../types/contracts";
import {
  availabilityItems, baselineFromExplanation, CALLOUT_MIN_W, calloutGeometry, clearCallout, graticulePaths, gridMetres, insideRing, introOverlapsPlanet,
  LEADER_DX, nextActive, orthographic, placeCallout, reachFromGlyph, revealDelta, scalesFromEvidence, segmentMeetsBox, underCover,
} from "./readouts";
import { zoneRing, zonesNear } from "./zones";

describe("orthographic", () => {
  it("puts the view centre at the disc centre and the limb at the radius", () => {
    expect(orthographic(10, 40, 10, 40, 20)).toMatchObject({ x: 0, front: true });
    expect(orthographic(10, 40, 10, 40, 20).y).toBeCloseTo(0);
    const east = orthographic(0, 90, 0, 0, 20);
    expect(east.x).toBeCloseTo(20);
    expect(east.y).toBeCloseTo(0);
    expect(orthographic(90, 0, 0, 0, 20).y).toBeCloseTo(20);
  });
  it("marks the far hemisphere", () => {
    expect(orthographic(0, 180, 0, 0, 20).front).toBe(false);
    expect(orthographic(0, -100, 0, 0, 20).front).toBe(false);
    expect(orthographic(-60, 10, 0, 10, 20).front).toBe(true);
  });
});

describe("graticulePaths", () => {
  it("draws only near-side lines, all inside the disc", () => {
    const paths = graticulePaths(20, 77, 23);
    expect(paths.length).toBeGreaterThan(5);
    for (const d of paths) {
      const nums = d.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
      for (let i = 0; i < nums.length; i += 2) expect(Math.hypot(nums[i], nums[i + 1])).toBeLessThanOrEqual(23.01);
    }
  });
});

describe("scalesFromEvidence", () => {
  it("reads cell, window and zone counts from the evidence coverage", () => {
    const ev = { coverage: { tier1: { n_cells: 249165, cell_km: 25 }, tier2: { n_windows: 230, window_km: 50 }, mars: { n_targets: 39 } } };
    expect(scalesFromEvidence(ev)).toEqual({ cellKm: 25, windowKm: 50, zones: 39 });
  });
  it("never invents a default for missing or malformed values", () => {
    expect(scalesFromEvidence(undefined)).toEqual({ cellKm: null, windowKm: null, zones: null });
    expect(scalesFromEvidence({ coverage: { tier1: { cell_km: "25" }, tier2: { window_km: 0 }, mars: null } }))
      .toEqual({ cellKm: null, windowKm: null, zones: null });
    expect(scalesFromEvidence({ coverage: [] })).toEqual({ cellKm: null, windowKm: null, zones: null });
  });
});

describe("gridMetres", () => {
  it("rounds a shared grid spacing", () => {
    expect(gridMetres([{ native_resolution_m: 463.0935 }, { native_resolution_m: 463.2 }])).toBe(463);
  });
  it("is null when absent or when the measures disagree", () => {
    expect(gridMetres([])).toBeNull();
    expect(gridMetres([{ native_resolution_m: null }, {}])).toBeNull();
    expect(gridMetres([{ native_resolution_m: 463 }, { native_resolution_m: 926 }])).toBeNull();
  });
});

describe("baselineFromExplanation", () => {
  it("takes the quoted baseline from the API text", () => {
    expect(baselineFromExplanation("Height change between points ~1.85 km apart (N-S, directional screen statistic).")).toBe("1.85 km");
    expect(baselineFromExplanation("points ~926 m apart")).toBe("926 m");
  });
  it("is null when the text quotes none", () => {
    expect(baselineFromExplanation("Average terrain inclination at the stated baseline.")).toBeNull();
    expect(baselineFromExplanation(null)).toBeNull();
  });
});

describe("availabilityItems", () => {
  const base = { tier1_features: [{ value: 2.7 }], ez_features: [], observation_support: { observed_fraction: 0.31 } };
  it("orders terrain, observation support, then known factors, then unknown ones in API order", () => {
    const items = availabilityItems({
      ...base,
      unavailable_factors: [
        { key: "solar_energy", label: "Solar energy", value: null },
        { key: "zz_new", label: "New factor", value: 3 },
        { key: "thermal_inertia", label: "Thermal inertia", value: null },
        { key: "aa_new", label: "Other factor", value: null },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(["terrain", "observation_support", "thermal_inertia", "solar_energy", "zz_new", "aa_new"]);
    expect(items.map((i) => i.label)).toEqual(["Terrain", "Observation support", "Thermal", "Solar", "New factor", "Other factor"]);
    expect(items.map((i) => i.on)).toEqual([true, true, false, false, true, false]);
  });
  it("marks terrain and observation support off when the API has no values", () => {
    const items = availabilityItems({ tier1_features: [{ value: null }], ez_features: [{ value: null }], observation_support: null, unavailable_factors: [] });
    expect(items).toEqual([{ key: "terrain", label: "Terrain", on: false }, { key: "observation_support", label: "Observation support", on: false }]);
  });
});

describe("nextActive", () => {
  it("steps and stops at the ends", () => {
    expect(nextActive("ArrowDown", 0, 3)).toBe(1);
    expect(nextActive("ArrowDown", 2, 3)).toBe(2);
    expect(nextActive("ArrowUp", 0, 3)).toBe(0);
    expect(nextActive("Home", 2, 3)).toBe(0);
    expect(nextActive("End", 0, 3)).toBe(2);
    expect(nextActive("PageDown", 1, 30)).toBe(9);
    expect(nextActive("PageUp", 3, 30)).toBe(0);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextActive("a", 1, 3)).toBeNull();
    expect(nextActive("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("revealDelta", () => {
  const view = { top: 100, bottom: 300 };
  it("is 0 for a visible row and moves just enough otherwise", () => {
    expect(revealDelta({ top: 150, bottom: 180 }, view, 12)).toBe(0);
    expect(revealDelta({ top: 290, bottom: 320 }, view, 12)).toBe(32);
    expect(revealDelta({ top: 90, bottom: 120 }, view, 12)).toBe(-22);
  });
});

describe("calloutGeometry", () => {
  it("runs up and right for a north-east label, starting on the mark's edge", () => {
    const g = calloutGeometry({ x: 100, y: 200 }, "ne", 38, { square: 4.5 });
    expect(g.sx).toBe(1);
    expect(g.sy).toBe(-1);
    expect(g.end).toEqual({ x: 100 + LEADER_DX, y: 162 });
    expect(g.elbow.y).toBe(162);
    // The start lies on the square mark's boundary (|dy| = half size, since the leg is steeper than 45°).
    expect(Math.abs(g.start.y - 200)).toBeCloseTo(4.5);
    expect(g.start.x).toBeGreaterThan(100);
  });
  it("mirrors for a south-west label", () => {
    const g = calloutGeometry({ x: 100, y: 200 }, "sw", 60);
    expect(g.end).toEqual({ x: 100 - LEADER_DX, y: 260 });
    expect(g.start.x).toBeLessThan(100);
    expect(g.start.y).toBeGreaterThan(200);
  });
  it("starts outside a round globe marker at its radius", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "se", 38, { circle: 12 });
    expect(Math.hypot(g.start.x, g.start.y)).toBeCloseTo(12);
    expect(g.start.x).toBeGreaterThan(0);
    expect(g.start.y).toBeGreaterThan(0);
  });
  it("starts on the edge of a footprint square drawn around the point", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "ne", 60, { square: 30 });
    expect(Math.max(Math.abs(g.start.x), Math.abs(g.start.y))).toBeCloseTo(30);
  });
  it("never starts past the elbow, however large the mark", () => {
    const g = calloutGeometry({ x: 0, y: 0 }, "ne", 38, { square: 80 });
    expect(Math.abs(g.start.y)).toBeLessThan(Math.abs(g.elbow.y));
    expect(Math.abs(g.start.x)).toBeLessThan(Math.abs(g.elbow.x));
  });
});

describe("underCover", () => {
  const frame = { w: 1440, h: 848 };
  it("is true only for points under the measured insets", () => {
    const ins = { left: 0, top: 0, right: 404, bottom: 0 };
    expect(underCover({ x: 524, y: 400 }, frame, ins)).toBe(false);
    expect(underCover({ x: 1100, y: 400 }, frame, ins)).toBe(true);
    // Phone sheet at full: everything below its top edge is covered.
    expect(underCover({ x: 195, y: 82 }, { w: 390, h: 792 }, { left: 0, top: 56, right: 0, bottom: 728 })).toBe(true);
    expect(underCover({ x: 195, y: 60 }, { w: 390, h: 792 }, { left: 0, top: 56, right: 0, bottom: 728 })).toBe(false);
  });
});

describe("placeCallout", () => {
  const desktop = { left: 0, top: 56, right: 1036, bottom: 848 }; // 1440 frame less a 404 px inspector
  const dy = { n: 38, s: 38 };
  it("keeps the preferred side when the label has room there", () => {
    const p = placeCallout({ x: 524, y: 474 }, "ne", desktop, dy);
    expect(p.side).toBe("ne");
    // The room to the bound's edge clearance, plus half that clearance before a name wraps.
    expect(p.maxW).toBe(1036 - 8 - (524 + LEADER_DX + 2) + 4);
  });
  it("moves a label away from the inspector instead of sliding under it", () => {
    expect(placeCallout({ x: 1000, y: 474 }, "ne", desktop, dy).side).toBe("nw");
    expect(placeCallout({ x: 900, y: 474 }, "ne", desktop, dy).side).toBe("nw");
  });
  it("on a phone takes the wider side and caps the width to the room left, so long names wrap", () => {
    const phone = { left: 0, top: 56, right: 330, bottom: 380 }; // 390 frame less the nav column and sheet
    const p = placeCallout({ x: 195, y: 272 }, "ne", phone, { n: 60, s: 60 });
    expect(p.side).toBe("nw");
    expect(p.maxW).toBe(195 - LEADER_DX - 2 - 8 + 4);
  });
  it("never makes a label narrower than its coordinate line", () => {
    expect(placeCallout({ x: 60, y: 474 }, "nw", { ...desktop, right: 140 }, dy).maxW).toBe(CALLOUT_MIN_W);
  });
  it("flips north/south only when the preferred shelf leaves the bounds and the other side leaves them less", () => {
    expect(placeCallout({ x: 524, y: 100 }, "ne", desktop, dy)).toMatchObject({ side: "se", dy: 38 });
    expect(placeCallout({ x: 524, y: 820 }, "sw", desktop, dy).side).toBe("nw");
    expect(placeCallout({ x: 524, y: 474 }, "ne", desktop, dy)).toMatchObject({ side: "ne", dy: 38 });
  });
  it("shortens the reach to stay inside when neither shelf fits, but never below the minimum", () => {
    // Phone: the zone outline needs 131 px either way; north overflows by 5 px, south by more.
    const phone = { left: 0, top: 56, right: 330, bottom: 380 };
    const p = placeCallout({ x: 195, y: 220 }, "ne", phone, { n: 131, s: 131 });
    expect(p.side).toBe("nw");
    expect(p.dy).toBe(131 - 5);
    expect(placeCallout({ x: 195, y: 120 }, "ne", phone, { n: 131, s: 400 }, { minDy: 50 })).toMatchObject({ side: "nw", dy: 50 });
    // …and takes the other shelf when that one overflows less.
    expect(placeCallout({ x: 195, y: 120 }, "ne", phone, { n: 131, s: 300 })).toMatchObject({ side: "sw", dy: 300 - 78 });
  });
});

describe("screen geometry for callouts", () => {
  const box = { x0: 10, y0: 10, x1: 20, y1: 20 };
  it("finds segments that cross, touch or lie inside a box, and only those", () => {
    expect(segmentMeetsBox({ x: 0, y: 15 }, { x: 30, y: 15 }, box)).toBe(true); // straight through
    expect(segmentMeetsBox({ x: 12, y: 12 }, { x: 18, y: 18 }, box)).toBe(true); // inside
    expect(segmentMeetsBox({ x: 0, y: 0 }, { x: 10, y: 10 }, box)).toBe(true); // touches a corner
    expect(segmentMeetsBox({ x: 0, y: 25 }, { x: 30, y: 25 }, box)).toBe(false); // passes below
    expect(segmentMeetsBox({ x: 0, y: 30 }, { x: 30, y: 0 }, { x0: 0, y0: 0, x1: 5, y1: 5 })).toBe(false); // misses the corner
    expect(segmentMeetsBox({ x: 15, y: 0 }, { x: 15, y: 5 }, box)).toBe(false); // stops short
  });

  it("tells inside from outside a ring", () => {
    const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 10 }, { x: -2, y: 10 }];
    expect(insideRing({ x: 5, y: 5 }, ring)).toBe(true);
    expect(insideRing({ x: 11.5, y: 2 }, ring)).toBe(false);
    expect(insideRing({ x: 5, y: 12 }, ring)).toBe(false);
  });
});

describe("callout plates keep clear of zone outlines and other glyphs", () => {
  const desktop = { left: 0, top: 56, right: 1036, bottom: 848 };
  const reaches = { n: 38, s: 98 };
  const plate = { w: 125, h: 42 };
  const glyph = { x: 516, y: 424 };
  const start = placeCallout(glyph, "ne", desktop, reaches, { minDy: 38 });
  /** A zone outline as eight screen points (corners and edge midpoints), from its corners. */
  const ring = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 }, { x: (x0 + x1) / 2, y: y0 }, { x: x1, y: y0 }, { x: x1, y: (y0 + y1) / 2 },
    { x: x1, y: y1 }, { x: (x0 + x1) / 2, y: y1 }, { x: x0, y: y1 }, { x: x0, y: (y0 + y1) / 2 },
  ];
  /** The plate's box for a choice (the shelf ends `dx` out; the plate starts 2 px past it). */
  const plateBox = (c: { side: string; dy: number; dx?: number }) => {
    const sx = c.side.endsWith("e") ? 1 : -1, row = glyph.y + (c.side.startsWith("n") ? -c.dy : c.dy);
    const dx = c.dx ?? LEADER_DX;
    const x0 = sx > 0 ? glyph.x + dx + 2 : glyph.x - dx - 2 - plate.w;
    return { x0, y0: row - plate.h / 2, x1: x0 + plate.w, y1: row + plate.h / 2 };
  };
  const clearOf = (b: { x0: number; y0: number; x1: number; y1: number }, r: { x: number; y: number }[]) =>
    r.every((p, i) => !segmentMeetsBox(p, r[(i + 1) % r.length], b));

  it("keeps the placement the bounds chose when nothing is near", () => {
    const c = clearCallout(glyph, start, desktop, reaches, plate, { rings: [], marks: [] }, { minDy: 38 });
    expect(c).toMatchObject({ side: start.side, dy: start.dy, dx: LEADER_DX, maxW: start.maxW, extra: 0, hits: 0 });
    // Outlines far away change nothing either.
    const far = clearCallout(glyph, start, desktop, reaches, plate, { rings: [{ pts: ring(800, 600, 950, 760), own: false }], marks: [] }, { minDy: 38 });
    expect(far).toMatchObject({ side: start.side, dy: start.dy, extra: 0, hits: 0 });
  });

  it("moves a plate off a neighbouring zone, so it never seems to name it", () => {
    // Hellas3 at 1440 × 900: Ausonia's outline starts just where the north-east plate would go.
    const own = ring(400, 390, 650, 578);
    const neighbour = ring(560, 258, 795, 410);
    const ob = { rings: [{ pts: own, own: true }, { pts: neighbour, own: false }], marks: [{ x: 674, y: 326 }] };
    const c = clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38 });
    expect(c.hits).toBe(0);
    const b = plateBox(c);
    expect(insideRing({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, neighbour)).toBe(false);
    expect(clearOf(b, neighbour)).toBe(true);
    expect(clearOf(b, own)).toBe(true);
    // It keeps to the north (the side the bounds preferred) and moves west, just past the zone's own edge.
    expect(c.side).toBe("nw");
    expect(c.dy).toBeGreaterThan(start.dy);
  });

  it("steps a label sideways out of a zone hemmed in by a neighbour, rising so its leader stays steep", () => {
    // Jezero at 1440 × 900: Nili's outline lies just north, so neither shelf above the glyph is clear in the gap.
    const own = ring(390, 390, 645, 575);
    const nili = ring(435, 230, 650, 353);
    const c = clearCallout(glyph, start, desktop, reaches, plate, { rings: [{ pts: own, own: true }, { pts: nili, own: false }], marks: [] }, { minDy: 38 });
    expect(c).toMatchObject({ side: "ne", hits: 0 });
    expect(c.dx).toBeGreaterThan(LEADER_DX);
    const b = plateBox(c);
    expect(b.x0).toBeGreaterThan(650);
    expect(clearOf(b, own) && clearOf(b, nili)).toBe(true);
    // The slanted run is no flatter than 25°.
    expect((Math.atan2(c.dy, c.dx - LEADER_DX * 0.45) * 180) / Math.PI).toBeGreaterThanOrEqual(25);
    // The leader is drawn to that shelf: the slanted run lengthens, the shelf keeps its length.
    const g = calloutGeometry(glyph, c.side, c.dy, { square: 13 }, c.dx);
    expect(g.end.x - glyph.x).toBe(c.dx);
    expect(g.end.x - g.elbow.x).toBeCloseTo(LEADER_DX * 0.45);
  });

  it("does not let a line run along the leader's shelf, where it reads as part of the leader", () => {
    // A level outline edge 2 px under the shelf, clear of the plate's box but for the gap.
    const shelfY = glyph.y - start.dy;
    const ob = { rings: [{ pts: [{ x: 540, y: shelfY + 2 }, { x: 572, y: shelfY + 2 }, { x: 572, y: shelfY + 3 }, { x: 540, y: shelfY + 3 }], own: false }], marks: [] };
    const c = clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38 });
    expect(c.hits).toBe(0);
    expect(c.side === start.side && c.dy === start.dy && c.dx === LEADER_DX).toBe(false);
  });

  it("keeps the plate off other zones' glyphs", () => {
    const b = plateBox(start);
    const c = clearCallout(glyph, start, desktop, reaches, plate, { rings: [], marks: [{ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }] }, { minDy: 38 });
    expect(c.hits).toBe(0);
    expect(c).not.toMatchObject({ side: start.side, dy: start.dy });
  });

  it("holds its last place while that is as good as any, so a label does not flicker", () => {
    const own = ring(400, 390, 650, 578);
    const neighbour = ring(560, 258, 795, 410);
    const ob = { rings: [{ pts: own, own: true }, { pts: neighbour, own: false }], marks: [] };
    const first = clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38 });
    // A place one step further out on the same side is as clean; the last choice keeps it.
    const held = clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38, prev: { side: first.side, extra: first.extra + 12 } });
    expect(held).toMatchObject({ side: first.side, extra: first.extra + 12, hits: 0 });
    // …but not two steps out: then the label moves back in.
    const back = clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38, prev: { side: first.side, extra: first.extra + 24 } });
    expect(back).toMatchObject({ side: first.side, extra: first.extra, hits: 0 });
  });

  it("keeps its place while the camera moves, whatever sweeps across it, and moves once the view settles", () => {
    const own = ring(400, 390, 650, 578);
    const neighbour = ring(560, 258, 795, 410);
    const ob = { rings: [{ pts: own, own: true }, { pts: neighbour, own: false }], marks: [] };
    const prev = { side: start.side, extra: 0, extraX: 0 };
    // The start place now sits on the neighbour's corner: held during the flight…
    expect(clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38, prev, hold: true })).toMatchObject({ side: start.side, extra: 0, extraX: 0 });
    // …and left for a clear place as soon as the camera stops.
    expect(clearCallout(glyph, start, desktop, reaches, plate, ob, { minDy: 38, prev, hold: false }).hits).toBe(0);
  });

  it("takes the place with the fewest crossings when none is clear, and breaks rings where points are off screen", () => {
    // A grid of level lines every 20 px across the whole frame: every place crosses some.
    const lines = Array.from({ length: 40 }, (_, i) => ({ pts: [{ x: 0, y: 60 + i * 20 }, { x: 1036, y: 60 + i * 20 }], own: false }));
    const c = clearCallout(glyph, start, desktop, reaches, plate, { rings: lines, marks: [] }, { minDy: 38 });
    expect(c.hits).toBeGreaterThan(0);
    // A ring whose only points are off screen draws no segments, so nothing is avoided.
    const gone = clearCallout(glyph, start, desktop, reaches, plate, { rings: [{ pts: [null, null, null, null], own: false }], marks: [] }, { minDy: 38 });
    expect(gone).toMatchObject({ side: start.side, dy: start.dy, hits: 0 });
  });
});

describe("intro over the planet", () => {
  it("quiets the zone glyphs wherever the intro's copy overlaps the planet", () => {
    expect(introOverlapsPlanet("phone", true)).toBe(true);
    expect(introOverlapsPlanet("tablet", false)).toBe(true);
    expect(introOverlapsPlanet("desktop", true)).toBe(true);
    expect(introOverlapsPlanet("desktop", false)).toBe(false);
  });
});

describe("zone outlines near a point", () => {
  const site = (id: string, lat: number, lon: number, half = 1.7) =>
    ({ id, name: id, lat, lon, bbox: { lon_min: lon - half, lon_max: lon + half, lat_min: lat - half, lat_max: lat + half } }) as unknown as MarsSite;
  it("rings a zone with its corners and edge midpoints, from the north-west corner", () => {
    const r = zoneRing(site("Jezero", 17.68, 77.01));
    expect(r).toHaveLength(8);
    expect(r[0]).toEqual({ lat: 17.68 + 1.7, lon: 77.01 - 1.7 });
    expect(r[4]).toEqual({ lat: 17.68 - 1.7, lon: 77.01 + 1.7 });
    expect(r[1].lon).toBeCloseTo(77.01);
    expect(r[3].lat).toBeCloseTo(17.68);
  });
  it("lists only the zones close enough to share the screen with a label, nearest first", () => {
    const sites = [site("Far", -40, -10), site("Nili", 22.08, 77.01), site("Jezero", 17.68, 77.01)];
    expect(zonesNear(sites, 17.68, 77.01, 900).map((s) => s.id)).toEqual(["Jezero", "Nili"]);
    expect(zonesNear(undefined, 0, 0, 900)).toEqual([]);
  });
});

describe("callouts on a stemmed glyph (3D view)", () => {
  it("measures the reach from the glyph while still clearing the square around the ground point", () => {
    // AOI square needs 152 px north and south of the ground point; the glyph stands 46 px above it.
    expect(reachFromGlyph({ n: 152, s: 152 }, 46, 38)).toEqual({ n: 106, s: 198 });
    // A small square: the label still keeps the default reach from the glyph itself.
    expect(reachFromGlyph({ n: 52, s: 52 }, 46, 38)).toEqual({ n: 38, s: 98 });
  });

  it("changes nothing looking straight down (no stem)", () => {
    expect(reachFromGlyph({ n: 152, s: 60 }, 0, 38)).toEqual({ n: 152, s: 60 });
    expect(reachFromGlyph({ n: 152, s: 60 }, -3, 38)).toEqual({ n: 152, s: 60 });
  });

  it("chooses the side and draws the leader from the glyph, so the label meets the mark the reader sees", () => {
    const desktop = { left: 0, top: 56, right: 1036, bottom: 848 };
    const ground = { x: 520, y: 470 }, glyph = { x: 516, y: 424 };
    const reach = reachFromGlyph({ n: 52, s: 52 }, ground.y - glyph.y, 38);
    const p = placeCallout(glyph, "ne", desktop, reach, { minDy: 38 });
    expect(p.side).toBe("ne");
    const g = calloutGeometry(glyph, p.side, p.dy, { square: 13 });
    // The leader leaves the glyph's bracket box, up and to the right of the glyph — not from the stem's foot.
    expect(Math.max(Math.abs(g.start.x - glyph.x), Math.abs(g.start.y - glyph.y))).toBeCloseTo(13, 6);
    expect(g.start.y).toBeLessThan(glyph.y);
    expect(g.end.y).toBe(glyph.y - 38);
    // Near the top of the frame the glyph's own position decides the flip, not the ground point's.
    const high = { x: 516, y: 120 };
    expect(placeCallout(high, "ne", desktop, reachFromGlyph({ n: 52, s: 52 }, 46, 38), { minDy: 38 }).side).toBe("se");
  });
});
