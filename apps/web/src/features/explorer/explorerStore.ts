import { create } from "zustand";
import type { Selection } from "../../store/app";

/**
 * Feature-local UI state for the Mars explorer.
 * `origin` remembers an off-zone point after "Go to nearest zone", so the original coordinate is never
 * silently replaced: it stays marked on the globe and one action away in the inspector.
 * `kept` records that the user chose to keep an off-zone point (the inspector then quiets its actions).
 */
interface ExplorerState {
  origin: Selection | null;
  kept: Selection | null;
  set: (p: Partial<Pick<ExplorerState, "origin" | "kept">>) => void;
}

export const useExplorer = create<ExplorerState>((set) => ({
  origin: null,
  kept: null,
  set: (p) => set(p),
}));
