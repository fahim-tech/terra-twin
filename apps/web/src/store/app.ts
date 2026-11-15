import { create } from "zustand";
import type { DiscoveryJob } from "../services/gis";
import type { AnalogSearch } from "../types/contracts";

export type Stage = "mars" | "earth" | "compare" | "evidence" | "report";
export type Tier = 1 | 2;
/** Windows a discovery run can refine (the API's accepted values; the status payload says which it offers). */
export type NRefine = 20 | 30 | 40;

/**
 * A live discovery submitted from the Mars inspector (services/gis.ts). `job` is the payload the submission
 * returned (a cached run comes back `done` at once); polling then follows `job.job_id`.
 */
export interface DiscoveryState {
  request: { lat: number; lon: number; site: string | null; label: string; mission: string; nRefine: NRefine; includePool?: boolean };
  job: DiscoveryJob;
}

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
  /** Latest status message for screen readers (polite) or errors (assertive). */
  announcement: { text: string; urgent: boolean; n: number } | null;
  knownFilter: "all" | "not_in_reference_set" | "near_documented_analog";
  /** Earth globe layers: tier-1 similarity field, tier-1 screening coverage, tier-2 research pool. */
  earthOverlays: { similarity: boolean; coverage: boolean; pool: boolean };
  /** Mars/Earth latitude-longitude grid. */
  graticule: boolean;
  /** The latest live discovery submission (job and its request), or none. */
  discovery: DiscoveryState | null;
  /** The discovery run shown in the Earth stage's Live discovery tab (the submitted one or a previous run). */
  liveRunId: string | null;
  /** The Live discovery tab is the active Earth stage (beside research comparison and global screen). */
  liveOpen: boolean;
  /** Selected window of the shown discovery run (its candidate id), or none. */
  liveCandidate: string | null;
  /** Windows the next discovery refines (the API's choices). */
  discoveryWindows: NRefine;
  /** The next discovery also refines the fixed research pool (the published runs' parameter set). */
  discoveryPool: boolean;

  set: (p: Partial<AppState>) => void;
  go: (stage: Stage) => void;
  back: () => void;
  select: (s: Selection | null) => void;
  announce: (text: string, urgent?: boolean) => void;
  /** Escape semantics: close the topmost transient layer. Returns false when nothing was closed. */
  closeTopmost: () => boolean;
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
  announcement: null,
  knownFilter: "all",
  earthOverlays: { similarity: true, coverage: false, pool: true },
  graticule: false,
  discovery: null,
  liveRunId: null,
  liveOpen: false,
  liveCandidate: null,
  discoveryWindows: 20,
  discoveryPool: false,

  set: (p) => set(p),
  go: (stage) => set({ previousStage: get().stage, stage, whyOpen: false }),
  back: () => set({ stage: get().previousStage === get().stage ? "mars" : get().previousStage }),
  // A new selection keeps the last analog search (it stays labelled with its own target) until a new
  // search replaces it, so returning to Mars never silently discards results.
  select: (selection) => set({ selection, ...(window.innerWidth < 768 ? { leftOpen: false, rightOpen: true } : {}) }),
  announce: (text, urgent = false) => set({ announcement: { text, urgent, n: (get().announcement?.n ?? 0) + 1 } }),
  closeTopmost: () => {
    const s = get();
    if (s.whyOpen) { set({ whyOpen: false }); return true; }
    if (s.stage === "evidence" || s.stage === "report") { s.back(); return true; }
    if (s.stage === "compare") { s.go("earth"); return true; }
    return false;
  },
}));

/**
 * Compare and Report follow what the Earth stage shows: with the Live discovery tab open and one of its
 * refined windows selected, they describe that window of that run; otherwise the research record's candidate.
 */
export function liveCompareActive(s: { liveOpen: boolean; liveRunId: string | null; liveCandidate: string | null }): boolean {
  return s.liveOpen && !!s.liveRunId && !!s.liveCandidate;
}
