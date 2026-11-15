/** Camera framing for the comparison: one altitude for both planets, so their ground scales match. */

/** Fallback altitude when the stage has not been measured yet. */
export const COMPARE_HEIGHT_KM = 420;

/** Share of the smaller free-area side the compared footprint should span on screen. */
export const FILL = 0.3;
/** Cesium default frustum (60°), vertical for these landscape/portrait frames. */
export const FOVY = Math.PI / 3;

/**
 * The camera height (same on both planets, so ground scale matches) that makes a `km` footprint span
 * FILL of the smaller free-area side, and at most `capPx` (the room beside the Why brief, when the
 * Earth window is shown there). mpp = 2·h·tan(fovy/2) / canvasHeight (see globe-entry mppAtHeight).
 */
export function matchedHeightKm(km: number, canvasH: number, freePx: number, capPx = Infinity): number {
  if (!(canvasH > 0) || !(freePx > 40)) return COMPARE_HEIGHT_KM;
  const targetPx = Math.max(48, Math.min(capPx, Math.max(60, freePx * FILL)));
  const mpp = (km * 1000) / targetPx;
  return Math.round((mpp * canvasH) / (2 * Math.tan(FOVY / 2)) / 1000);
}

/** On-screen size of a `km` footprint seen from `heightKm` in a frame `canvasH` px tall, px. */
export function footprintPx(km: number, heightKm: number, canvasH: number): number {
  const mpp = (2 * heightKm * 1000 * Math.tan(FOVY / 2)) / canvasH;
  return (km * 1000) / mpp;
}
