/** Placement of in-flow popovers (the glossary <Term>), kept pure so it can be tested. */

/** Popover width (px) at a given viewport width: 320 px, at most 80 % of the viewport. */
export function termPopoverWidth(viewport: number): number {
  return Math.min(320, viewport * 0.8);
}

/**
 * Horizontal offset (≤ 0, px) that keeps a term popover anchored at `left` inside the viewport with a
 * `gutter` on the right; 0 when it already fits.
 */
export function termPopoverShift(left: number, viewport: number, gutter = 16): number {
  return Math.min(0, viewport - gutter - (left + termPopoverWidth(viewport)));
}
