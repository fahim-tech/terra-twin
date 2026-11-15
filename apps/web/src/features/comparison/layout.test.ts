import { describe, expect, it } from "vitest";
import { footprintPx, matchedHeightKm } from "./framing";
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
