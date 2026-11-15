import { useEffect, useRef } from "react";
import { create } from "zustand";

/** Why drawer width cap on desktop/tablet, px. */
export const WHY_DRAWER_MAX_PX = 440;
/** Gap between the drawer and the stage edge, px (the drawer sits 12 px in from the right). */
const GUTTER = 12;
/**
 * Least width of Earth imagery that must stay uncovered between the seam and the drawer for the Earth
 * window to be shown there, px. Below it the brief takes the whole Earth half instead of leaving a sliver.
 */
export const WHY_MIN_SLIVER_PX = 180;
/** Clearance kept between the compared square and the edges of that sliver, px. */
export const WHY_SLIVER_MARGIN_PX = 16;

export interface WhyLayout {
  /** Drawer width, px. */
  width: number;
  /**
   * True when the drawer leaves room for the Earth window beside it: the Earth camera then aims into
   * that room. False when the brief covers the Earth half (its left edge on the seam) and the Earth
   * window stays centred in its half, under the brief, rather than cut by the drawer's edge.
   */
  beside: boolean;
  /** Uncovered Earth imagery between the seam and the drawer, px (0 when the brief covers the half). */
  sliverPx: number;
  /** How far east of the Earth window the Earth camera aims so the window sits in the sliver, px. */
  earthShiftPx: number;
}

/** Placement of the Why brief on a desktop/tablet split stage `stageW` px wide. */
export function whyLayout(stageW: number): WhyLayout {
  const half = stageW / 2;
  const sliver = half - WHY_DRAWER_MAX_PX - GUTTER;
  if (sliver >= WHY_MIN_SLIVER_PX) {
    return { width: WHY_DRAWER_MAX_PX, beside: true, sliverPx: sliver, earthShiftPx: (WHY_DRAWER_MAX_PX + GUTTER) / 2 };
  }
  // The brief takes the Earth half from the seam to the gutter, and never gets narrower than its cap
  // allows on a small stage (there it also overlaps the seam a little; the Mars window stays clear).
  const width = Math.max(half - GUTTER, Math.min(WHY_DRAWER_MAX_PX, stageW - 2 * GUTTER));
  return { width: Math.round(width), beside: false, sliverPx: 0, earthShiftPx: 0 };
}

/** Why drawer width on desktop/tablet, px. One source for the drawer, the strip and framing. */
export function whyDrawerWidth(stageW: number) {
  return whyLayout(stageW).width;
}
/** The drawer's width before the stage has been measured. */
export const WHY_DRAWER_WIDTH_CSS = `min(${WHY_DRAWER_MAX_PX}px, calc(100% - ${2 * GUTTER}px))`;

/** Size of the stage (the globes' container) in CSS px, measured by <StageProbe/>. */
export const useCompareStage = create<{ w: number; h: number }>(() => ({ w: 0, h: 0 }));

/**
 * An invisible box filling the stage; reports its size so the comparison's camera framing does not
 * have to query the shell's DOM.
 */
export function StageProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const cur = useCompareStage.getState();
      if (cur.w !== w || cur.h !== h) useCompareStage.setState({ w, h });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="pointer-events-none invisible absolute inset-0 -z-10" />;
}
