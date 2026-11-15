import { create } from "zustand";
import type { Planet } from "../globes/protocol";
import { imageryCredit, imageryProvider, type GlobeSource } from "../lib/credits";
import { useApp } from "../store/app";

/**
 * What each globe reported it draws (ion or NASA fallback, and its layer notes), recorded from the globe's
 * `ready` message in App.tsx and kept current by its `imagery` messages (ion can replace or give way to the
 * fallback after start-up). Imagery credits are built from this (lib/credits.ts), never typed in.
 */
export const useGlobeSources = create<{
  source: Record<Planet, GlobeSource | null>;
  setSource: (p: Planet, s: GlobeSource) => void;
  setMode: (p: Planet, mode: GlobeSource["mode"]) => void;
}>((set) => ({
  source: { mars: null, earth: null },
  setSource: (p, s) => set((st) => ({ source: { ...st.source, [p]: s } })),
  setMode: (p, mode) => set((st) => (st.source[p] && st.source[p]!.mode !== mode ? { source: { ...st.source, [p]: { ...st.source[p]!, mode } } } : st)),
}));

/**
 * The credit for what a globe draws now (the selected base layer, or the Cesium Mars tiles under ion): `full` is the
 * whole layer note (lib/credits.ts imageryCredit), `provider` its provider alone (imageryProvider). Both null until
 * that globe has reported. For every caption that names imagery: the intro, and the report's plates and sources.
 */
export function useImageryCredit(planet: Planet): { full: string | null; provider: string | null } {
  const source = useGlobeSources((s) => s.source[planet]);
  const layer = useApp((s) => (planet === "mars" ? s.marsLayer : s.earthLayer));
  return { full: imageryCredit(planet, source, layer), provider: imageryProvider(planet, source, layer) };
}
