import { create } from "zustand";
import type { AnchorPosition, CameraTelemetry, ImagerySource, Planet } from "../globes/protocol";

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
  /** Recent imagery tile failures per planet (null = none reported). */
  imagery: Record<Planet, { layer: string; failures: number; at: number } | null>;
  reportImagery: (p: Planet, layer: string, failures: number) => void;
  /**
   * The 3D preference, one for both globes: site flights end in the oblique 3D view (true) or look straight
   * down. Each globe frame keeps its globe's copy in step (GlobeFrame), and a switch made inside a globe (the
   * T key) comes back here, so the two planets — and the two halves of the comparison — always agree.
   */
  tilt: boolean;
  setTilt: (on: boolean) => void;
  setHover: (h: { planet: Planet; lat: number; lon: number } | null) => void;
  setCamera: (p: Planet, c: CameraTelemetry) => void;
  setAnchors: (p: Planet, a: AnchorPosition[]) => void;
  setReady: (p: Planet) => void;
  /**
   * The base imagery each globe says it draws (its `ready` and `imagery` messages): credits are built from this,
   * never from fixed text, so they stay right when the layer or the ion/fallback mode changes.
   */
  source: Record<Planet, ImagerySource | null>;
  setSource: (p: Planet, s: ImagerySource) => void;
  /** Recent data-layer tile failures per planet (null = none reported). */
  dataLayerFault: Record<Planet, { id: string; failures: number; at: number } | null>;
  reportDataLayer: (p: Planet, id: string, failures: number) => void;
}

export const useGlobes = create<GlobeState>((set) => ({
  camera: { mars: null, earth: null },
  anchors: { mars: {}, earth: {} },
  ready: { mars: false, earth: false },
  hover: null,
  insets: { mars: { top: 0, right: 0, bottom: 0, left: 0 }, earth: { top: 0, right: 0, bottom: 0, left: 0 } },
  setInsets: (p, i) => set((s) => ({ insets: { ...s.insets, [p]: i } })),
  imagery: { mars: null, earth: null },
  reportImagery: (p, layer, failures) => set((s) => ({ imagery: { ...s.imagery, [p]: { layer, failures, at: Date.now() } } })),
  tilt: true,
  setTilt: (tilt) => set((s) => (s.tilt === tilt ? s : { tilt })),
  setHover: (hover) => set({ hover }),
  setCamera: (p, c) => set((s) => ({ camera: { ...s.camera, [p]: c } })),
  setAnchors: (p, a) => set((s) => ({ anchors: { ...s.anchors, [p]: Object.fromEntries(a.map((x) => [x.id, x])) } })),
  setReady: (p) => set((s) => ({ ready: { ...s.ready, [p]: true } })),
  source: { mars: null, earth: null },
  setSource: (p, src) => set((s) => ({ source: { ...s.source, [p]: src } })),
  dataLayerFault: { mars: null, earth: null },
  reportDataLayer: (p, id, failures) => set((s) => ({ dataLayerFault: { ...s.dataLayerFault, [p]: { id, failures, at: Date.now() } } })),
}));
