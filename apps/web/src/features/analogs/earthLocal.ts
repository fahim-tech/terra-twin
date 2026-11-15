import { create } from "zustand";

/** Earth-explorer UI state that belongs to this feature only (not shared app state). */
interface EarthLocal {
  /** "Reference sites" layer: the 17 named reference / control windows. Off by default (spec §9). */
  referenceSites: boolean;
  /** Why the next camera move happens: a marker click asks to fly to that candidate instead of framing the set. */
  intent: "select" | null;
  /** Phone: the layer legend is folded to keep the globe visible. */
  legendOpen: boolean;
}

export const useEarthLocal = create<EarthLocal>(() => ({ referenceSites: false, intent: null, legendOpen: false }));
