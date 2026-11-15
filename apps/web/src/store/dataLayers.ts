import { create } from "zustand";
import type { Planet } from "../globes/protocol";

/**
 * The ~1 km grid data layer chosen for each globe (a layer name from the grid's info payload, or null for none)
 * and its opacity. One layer per planet at a time. Kept while the stage changes, so returning to a planet shows
 * the layer chosen there; each globe draws it only while its control (and legend) is on screen.
 */
interface DataLayersState {
  layer: Record<Planet, string | null>;
  /** 0-1. */
  opacity: Record<Planet, number>;
  /** Whether each planet's control is unfolded. */
  open: Record<Planet, boolean>;
  setLayer: (p: Planet, layer: string | null) => void;
  setOpacity: (p: Planet, opacity: number) => void;
  setOpen: (p: Planet, open: boolean) => void;
  /** Where each planet's data-layers panel sits over its globe frame (frame px), for labels to keep off it; null when not shown. */
  panelBox: Record<Planet, { x0: number; y0: number; x1: number; y1: number } | null>;
  setPanelBox: (p: Planet, box: { x0: number; y0: number; x1: number; y1: number } | null) => void;
}

export const DEFAULT_OPACITY = 0.85;

export const useDataLayers = create<DataLayersState>((set) => ({
  layer: { mars: null, earth: null },
  opacity: { mars: DEFAULT_OPACITY, earth: DEFAULT_OPACITY },
  open: { mars: false, earth: false },
  setLayer: (p, layer) => set((s) => ({ layer: { ...s.layer, [p]: layer } })),
  setOpacity: (p, opacity) => set((s) => ({ opacity: { ...s.opacity, [p]: Math.min(1, Math.max(0, opacity)) } })),
  setOpen: (p, open) => set((s) => ({ open: { ...s.open, [p]: open } })),
  panelBox: { mars: null, earth: null },
  setPanelBox: (p, box) => set((s) => {
    const cur = s.panelBox[p];
    if (cur === box || (cur && box && cur.x0 === box.x0 && cur.y0 === box.y0 && cur.x1 === box.x1 && cur.y1 === box.y1)) return s;
    return { panelBox: { ...s.panelBox, [p]: box } };
  }),
}));
