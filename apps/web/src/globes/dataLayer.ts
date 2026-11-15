import type { DataLayerSpec } from "./protocol";

/**
 * What a setDataLayer message changes on the globe: nothing, only the layer's opacity (loaded tiles kept),
 * the whole layer (new tiles), or clearing it.
 */
export function dataLayerChange(prev: DataLayerSpec | null, next: DataLayerSpec | null): "none" | "alpha" | "replace" | "clear" {
  if (!next) return prev ? "clear" : "none";
  if (!prev) return "replace";
  const same = prev.id === next.id && prev.url === next.url && prev.maximumLevel === next.maximumLevel && prev.tileSize === next.tileSize
    && maskKey(prev) === maskKey(next);
  if (!same) return "replace";
  return prev.alpha === next.alpha ? "none" : "alpha";
}

const maskKey = (s: DataLayerSpec) => (s.mask ? `${s.mask.url}|${s.mask.keep.join(",")}` : "");

/** #rrggbb → [r, g, b]; null when it is not that form. */
export function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Clear (alpha 0) every pixel of `data` whose pixel in `mask` is transparent or not one of the `keep` colours
 * (within `tol` per channel). Both are RGBA byte arrays of the same size. Returns how many pixels were kept.
 */
export function applyMask(data: Uint8ClampedArray, mask: Uint8ClampedArray, keep: [number, number, number][], tol = 2): number {
  let kept = 0;
  for (let i = 0; i < data.length; i += 4) {
    const ok = mask[i + 3] > 0 && keep.some(([r, g, b]) => Math.abs(mask[i] - r) <= tol && Math.abs(mask[i + 1] - g) <= tol && Math.abs(mask[i + 2] - b) <= tol);
    if (ok) kept++;
    else data[i + 3] = 0;
  }
  return kept;
}

/**
 * Whether a tile URL template is one the globe can draw: it must name {z}, {x} and {y} once each. A template
 * that does not would fetch the same image for every tile.
 */
export function isTileTemplate(url: string): boolean {
  return ["{z}", "{x}", "{y}"].every((k) => url.split(k).length === 2);
}
