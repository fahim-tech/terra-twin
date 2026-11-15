import { create } from "zustand";
import type { Planet } from "../globes/protocol";
import type { GlobeSource } from "../lib/credits";

/**
 * What each globe reported it draws (ion or NASA fallback, and its layer notes), recorded from the globe's
 * `ready` message in App.tsx. Imagery credits are built from this (lib/credits.ts), never typed in.
 */
export const useGlobeSources = create<{ source: Record<Planet, GlobeSource | null>; setSource: (p: Planet, s: GlobeSource) => void }>((set) => ({
  source: { mars: null, earth: null },
  setSource: (p, s) => set((st) => ({ source: { ...st.source, [p]: s } })),
}));
