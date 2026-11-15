import { describe, expect, it } from "vitest";
import { OBLIQUE_PITCH_DEG } from "../../globes/camera";
import { R_EARTH_MEAN_M, R_MARS_M } from "../../lib/geodesy";
import { type CompareSide, FILL, aimEastForShift, footprintPx, fovyFor, matchedDepthKm, matchedHeightKm, projectedSquare } from "./framing";
import { requestReframe, useCompareFraming, WHY_DRAWER_MAX_PX, WHY_MIN_SLIVER_PX, WHY_SLIVER_MARGIN_PX, whyLayout } from "./layout";

describe("frame requests", () => {
  it("counts each half's Frame control separately, so only that globe flies back", () => {
    const before = useCompareFraming.getState();
    requestReframe("mars");
    const after = useCompareFraming.getState();
    expect(after.mars).toBe(before.mars + 1);
    expect(after.earth).toBe(before.earth);
  });
});

describe("Why brief placement", () => {
  it("sits beside the Earth window on wide stages and aims the Earth camera into the room it leaves", () => {
    const l = whyLayout(1440);
    expect(l.beside).toBe(true);
    expect(l.width).toBe(WHY_DRAWER_MAX_PX);
    // Uncovered Earth imagery runs from the seam (720) to the drawer's left edge (1440 − 12 − 440).
    expect(l.sliverPx).toBe(1440 - 12 - 440 - 720);
    // Centre of that room relative to the centre of the Earth half.
    const roomCentre = (720 + (1440 - 12 - 440)) / 2;
    expect(1080 - roomCentre).toBe(l.earthShiftPx);
  });

  it("takes the whole Earth half instead of leaving a sliver that would cut the window", () => {
    const l = whyLayout(1024);
    expect(l.beside).toBe(false);
    expect(l.earthShiftPx).toBe(0);
    expect(l.sliverPx).toBe(0);
    // Its left edge is the seam: right gutter 12 px.
    expect(1024 - 12 - l.width).toBe(512);
  });

  it("switches exactly where the room beside it reaches the minimum", () => {
    const edge = 2 * (WHY_MIN_SLIVER_PX + WHY_DRAWER_MAX_PX + 12);
    expect(whyLayout(edge).beside).toBe(true);
    expect(whyLayout(edge - 2).beside).toBe(false);
  });

  it("keeps its own width cap on small tablets rather than shrinking below it", () => {
    const l = whyLayout(800);
    expect(l.beside).toBe(false);
    expect(l.width).toBe(WHY_DRAWER_MAX_PX);
  });
});

describe("matched comparison altitude", () => {
  it("frames the footprint at the same share of the free area on both planets", () => {
    const h = matchedHeightKm(50, 848, 520);
    expect(footprintPx(50, h, 848)).toBeCloseTo(0.3 * 520, -1);
  });

  it("goes higher only when the room beside the brief is smaller than that share", () => {
    const free = 630, H = 972;
    const open = whyLayout(1280);
    const cap = open.sliverPx - 2 * WHY_SLIVER_MARGIN_PX;
    const capped = matchedHeightKm(50, H, free, cap);
    expect(capped).toBeGreaterThan(matchedHeightKm(50, H, free));
    expect(footprintPx(50, capped, H)).toBeLessThanOrEqual(cap + 1);
    // A cap wider than the normal framing changes nothing.
    expect(matchedHeightKm(50, H, 300, 400)).toBe(matchedHeightKm(50, H, 300));
  });
});

describe("comparison framing on projected corners", () => {
  // 1440 × 900 desktop: each half 720 × 848, the strip covering the bottom 200 px of both.
  const half = { w: 720, h: 848, insets: { top: 0, right: 0, bottom: 200, left: 0 } };
  const mars = { lat: 18.38, lon: 77.58, km: 50, radiusM: R_MARS_M };
  const earth = { lat: -24.09, lon: -69.99, km: 50, radiusM: R_EARTH_MEAN_M };
  const sides: CompareSide[] = [{ square: mars, frame: half }, { square: earth, frame: half }];
  const free = Math.min(720, 848 - 200);

  it("uses Cesium's field of view: 60° across the wider side", () => {
    expect(fovyFor(720, 848)).toBeCloseTo(Math.PI / 3, 12);
    expect(fovyFor(1440, 848)).toBeCloseTo(2 * Math.atan(Math.tan(Math.PI / 6) / (1440 / 848)), 12);
  });

  it("looking straight down, reduces to the top-down framing", () => {
    const d = matchedDepthKm(sides, -90);
    expect(Math.abs(d - matchedHeightKm(50, 848, free)) / d).toBeLessThan(0.02);
    const box = projectedSquare(earth, d, -90, half)!;
    expect(box.w).toBeCloseTo(FILL * free, -1);
    expect(box.h).toBeCloseTo(box.w, -1);
  });

  it("frames the tilted square by its projected corners: its near edge spans FILL, not its ground size", () => {
    const d = matchedDepthKm(sides, OBLIQUE_PITCH_DEG);
    for (const sq of [mars, earth]) {
      const box = projectedSquare(sq, d, OBLIQUE_PITCH_DEG, half)!;
      // The near edge is the widest part of the tilted square, and the square is foreshortened.
      expect(Math.max(box.w, box.h)).toBeLessThanOrEqual(FILL * free + 1);
      expect(box.h).toBeLessThan(box.w);
    }
    // The top-down distance would let the near edge run past FILL.
    const flat = matchedHeightKm(50, 848, free);
    expect(projectedSquare(earth, flat, OBLIQUE_PITCH_DEG, half)!.w).toBeGreaterThan(FILL * free + 2);
    expect(d).toBeGreaterThan(flat);
  });

  it("keeps a tilted Earth window inside the room beside the Why brief", () => {
    const stage = 1920, H = 1028;
    const why = whyLayout(stage);
    const frame = { w: stage / 2, h: H, insets: { top: 0, right: 0, bottom: 200, left: 0 } };
    const cap = why.sliverPx - 2 * WHY_SLIVER_MARGIN_PX;
    const d = matchedDepthKm([{ square: mars, frame }, { square: earth, frame, capPx: cap }], OBLIQUE_PITCH_DEG);
    const east = aimEastForShift(earth, d, OBLIQUE_PITCH_DEG, frame, why.earthShiftPx);
    const box = projectedSquare(earth, d, OBLIQUE_PITCH_DEG, frame, east)!;
    // Centred in the room between the seam (x = 0 of this half) and the drawer, with the margin on both sides.
    const room = { left: 0, right: why.sliverPx };
    expect((box.left + box.right) / 2).toBeCloseTo((room.left + room.right) / 2, 0);
    expect(box.left).toBeGreaterThanOrEqual(room.left + WHY_SLIVER_MARGIN_PX - 1);
    expect(box.right).toBeLessThanOrEqual(room.right - WHY_SLIVER_MARGIN_PX + 1);
  });

  it("shifts by the projection, not by a fixed 60° field of view", () => {
    // A wide half (landscape canvas): the vertical field of view is narrower than 60°.
    const wide = { w: 1280, h: 700, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    const east = aimEastForShift(earth, 300, OBLIQUE_PITCH_DEG, wide, 200);
    const box = projectedSquare(earth, 300, OBLIQUE_PITCH_DEG, wide, east)!;
    expect((box.left + box.right) / 2).toBeCloseTo(640 - 200, 0);
    const naive = (200 * 2 * 300_000 * Math.tan(Math.PI / 6)) / 700;
    expect(east).toBeLessThan(naive * 0.8);
  });

  it("falls back to the default distance before the stage is measured", () => {
    expect(matchedDepthKm([{ square: mars, frame: { w: 0, h: 0, insets: half.insets } }], -90)).toBe(420);
  });
});
