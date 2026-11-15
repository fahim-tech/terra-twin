import { create } from "zustand";
import type { AnalogSearch } from "../types/contracts";

export type Stage = "mars" | "earth" | "compare" | "evidence" | "report";
export type Tier = 1 | 2;

export interface Selection {
  lat: number;
  lon: number;
  siteId: string | null;
  label: string;
}

interface AppState {
  introOpen: boolean;
  stage: Stage;
  previousStage: Stage;
  mission: string;
  footprintKm: number;
  selection: Selection | null;
  search: AnalogSearch | null;
  tier: Tier;
  candidateId: string | null;
  representation: "mars_observation_space" | "as_measured";
  leftOpen: boolean;
  rightOpen: boolean;
  marsLayer: string;
  earthLayer: string;
  whyOpen: boolean;
  hover: { planet: "mars" | "earth"; lat: number; lon: number } | null;
  knownFilter: "all" | "not_in_reference_set" | "near_documented_analog";
  /** Earth globe layers: tier-1 similarity field, tier-1 screening coverage, tier-2 research pool. */
  earthOverlays: { similarity: boolean; coverage: boolean; pool: boolean };
  /** Mars/Earth latitude-longitude grid. */
  graticule: boolean;

  set: (p: Partial<AppState>) => void;
  go: (stage: Stage) => void;
  back: () => void;
  select: (s: Selection | null) => void;
}

export const useApp = create<AppState>((set, get) => ({
  introOpen: true,
  stage: "mars",
  previousStage: "mars",
  mission: "landing_site",
  footprintKm: 25,
  selection: null,
  search: null,
  tier: 2,
  candidateId: null,
  representation: "mars_observation_space",
  leftOpen: typeof window === "undefined" || window.innerWidth >= 768,
  rightOpen: true,
  marsLayer: "viking_color",
  earthLayer: "blue_marble_relief",
  whyOpen: false,
  hover: null,
  knownFilter: "all",
  earthOverlays: { similarity: true, coverage: false, pool: true },
  graticule: false,

  set: (p) => set(p),
  go: (stage) => set({ previousStage: get().stage, stage, whyOpen: false }),
  back: () => set({ stage: get().previousStage === get().stage ? "mars" : get().previousStage }),
  select: (selection) => set({ selection, search: null, candidateId: null, ...(window.innerWidth < 768 ? { leftOpen: false, rightOpen: true } : {}) }),
}));
