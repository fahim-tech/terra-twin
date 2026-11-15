/**
 * Plain-language labels with the exact technical term kept on demand (rendered by <Term>).
 * The G5 strings here are verbatim and must not be paraphrased.
 */
export interface GlossaryEntry {
  label: string;
  term: string;
  definition: string;
  source?: string;
}

export const G5 = {
  toggleOom: "Earth terrain: as MOLA would observe it at this Mars site",
  toggleMeasured: "as measured",
  leader: "Leader is stable under all four orientations of the Earth window relative to MOLA tracks",
  tied: "Tied: the leader is not determined by the MOLA observation geometry. These candidates are equivalent at this resolution",
  operator: "Mars elevations are a binned-altimetry grid: about 31% of 463 m cells contain a laser return; the rest are interpolated. Earth candidates are passed through the same sampling and interpolation before comparison",
  validation: "Benefit shown on synthetic terrain twins (exact-twin recovery 0.30 → 0.97). Not validated against field data or expert review",
  scope: "Similarity is terrain geometry only — not geology, formation process, habitability, gravity, atmosphere or radiation",
  scale: "Rankings depend on the analysis window (50 km vs 25 km); compare only within one window size",
  gate: "Excluded: vegetated or insufficient exposed ground (ESA WorldCover 2021; thresholds are working assumptions)",
} as const;

export const GLOSSARY = {
  globalScreen: {
    label: "Global screen",
    term: "Tier 1 coarse screening",
    definition: "All 249,165 GMTED2010 land cells (≈25 km) compared with the Mars zone on seven terrain descriptors, Earth as measured, mission-weighted. A wide net, not a verdict.",
    source: "earth_global_screen.parquet · similarity.score",
  },
  researchComparison: {
    label: "Research comparison",
    term: "Tier 2 observation-operator matching (OOM)",
    definition: "Published research record for this zone: a fixed pool of 230 Earth windows (50 km, 463 m grid) re-observed the way MOLA observed the Mars site, then compared on eight descriptors.",
    source: "G2/G5 · oom_real_mars_*decisions.csv",
  },
  similarity: {
    label: "Similarity",
    term: "S, normalised log-ratio similarity index",
    definition: "0 to 1, from the research kernel. A similarity index, not a probability of identical conditions.",
    source: "similarity.py",
  },
  measures: {
    label: "measures",
    term: "coverage",
    definition: "How many of the descriptors could be computed for this window or cell. Shown next to every score.",
  },
  operator: {
    label: "MOLA observation model",
    term: "Target-specific observation operator",
    definition: G5.operator,
    source: "MEGDR 128 ppd counts mask · linear (Delaunay) interpolation · ½-pixel blend",
  },
  stableLeader: { label: "Stable leader", term: "named_leader", definition: G5.leader },
  tie: { label: "Tie", term: "tied_set", definition: G5.tied },
  notEnough: { label: "Not enough evidence", term: "insufficient_evidence", definition: "The research data cannot support a ranking here. No score is shown." },
  researchZone: {
    label: "Research zone",
    term: "Exploration Zone (EZ)",
    definition: "One of 39 candidate human-landing zones from NASA's 2015 workshop, with terrain measured from the 463 m MOLA grid.",
  },
  landCover: {
    label: "Land-cover filter",
    term: "Mission-conditional ESA WorldCover gate",
    definition: "For field-test missions, windows that are vegetated (> 20 %) or have little exposed ground (< 50 %) are removed before ranking. Thresholds are working hypotheses.",
  },
  synthetic: { label: "synthetic twins only", term: "Validation status", definition: G5.validation },
  scope: { label: "Terrain geometry only", term: "Scope", definition: G5.scope },
  scale: { label: "50 km windows", term: "Analysis window", definition: G5.scale },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Human names for research zone ids ("Deuteronilus1_2" → "Deuteronilus 1–2"). */
export function zoneName(id: string): string {
  return id
    .replace(/(\D)(\d)_(\d)$/, "$1 $2–$3")
    .replace(/_/g, " ")
    .replace(/Plantia/, "Planitia")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one decision label every view shows. Stable leader and tie always read the G5 strings verbatim,
 * whatever the API sends; other decision types use the API's own label.
 */
export function decisionG5Label(d: { type: string; label?: string | null }): string | null {
  if (d.type === "named_leader") return G5.leader;
  if (d.type === "tied_set") return G5.tied;
  return d.label ?? null;
}
