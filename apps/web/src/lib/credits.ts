import type { LayerInfo } from "../globes/protocol";

/** What a globe reported in its `ready` message: whether Cesium ion replaced the imagery, and its own layer notes. */
export interface GlobeSource {
  mode: "ion" | "fallback";
  layers: LayerInfo[];
}

/** The Cesium ion asset globe-entry.ts loads for Mars when a token is set (it then replaces the globe imagery). */
export const MARS_ION_CREDIT = "Cesium Mars 3D Tiles (Cesium ion asset 3644333) · visualization only";

/**
 * The imagery credit for what a globe actually draws: the globe's own note for the selected layer, or the
 * Cesium Mars tiles when ion replaced the Mars imagery. Null until the globe has reported (never guessed).
 */
export function imageryCredit(planet: "mars" | "earth", source: GlobeSource | null, layerId: string): string | null {
  if (!source) return null;
  if (planet === "mars" && source.mode === "ion") return MARS_ION_CREDIT;
  const layer = source.layers.find((l) => l.id === layerId) ?? null;
  return layer ? layer.note.replace(/\.\s*$/, "") : null;
}
