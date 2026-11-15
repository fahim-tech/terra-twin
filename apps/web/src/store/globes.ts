import { create } from "zustand";
import type { AnchorPosition, CameraTelemetry, Planet } from "../globes/protocol";

/**
 * High-frequency globe state (camera telemetry, projected anchors) kept apart from the app store,
 * so only the instruments that read it re-render while the camera moves.
 */
interface GlobeState {
  camera: Record<Planet, CameraTelemetry | null>;
  anchors: Record<Planet, Record<string, AnchorPosition>>;
  ready: Record<Planet, boolean>;
  hover: { planet: Planet; lat: number; lon: number } | null;
  /** CSS-pixel area of each globe frame covered by shell UI (mirrors what the globe was told). */
  insets: Record<Planet, { top: number; right: number; bottom: number; left: number }>;
  setInsets: (p: Planet, i: { top: number; right: number; bottom: number; left: number }) => void;
  setHover: (h: { planet: Planet; lat: number; lon: number } | null) => void;
  setCamera: (p: Planet, c: CameraTelemetry) => void;
  setAnchors: (p: Planet, a: AnchorPosition[]) => void;
  setReady: (p: Planet) => void;
}

export const useGlobes = create<GlobeState>((set) => ({
  camera: { mars: null, earth: null },
  anchors: { mars: {}, earth: {} },
  ready: { mars: false, earth: false },
  hover: null,
  insets: { mars: { top: 0, right: 0, bottom: 0, left: 0 }, earth: { top: 0, right: 0, bottom: 0, left: 0 } },
  setInsets: (p, i) => set((s) => ({ insets: { ...s.insets, [p]: i } })),
  setHover: (hover) => set({ hover }),
  setCamera: (p, c) => set((s) => ({ camera: { ...s.camera, [p]: c } })),
  setAnchors: (p, a) => set((s) => ({ anchors: { ...s.anchors, [p]: Object.fromEntries(a.map((x) => [x.id, x])) } })),
  setReady: (p) => set((s) => ({ ready: { ...s.ready, [p]: true } })),
}));
