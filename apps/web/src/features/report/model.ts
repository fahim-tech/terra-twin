/**
 * Report model: everything the dossier, the JSON export and the CSV export say, derived only from
 * the stored analog search (bound to its own target via searchTarget) and the chosen candidate.
 * Pure functions, no React — tested in model.test.ts.
 */
import { G5 } from "../../lib/glossary";
import { searchTarget, type SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch, MissionProfile, Tier1Candidate, Tier2Candidate } from "../../types/contracts";
import { memberOrder } from "../analogs/candidates";
import { interpret, PLANETARY_DIFFERENCES, TIER1_SPECS } from "../comparison/science";

export type DecisionType = AnalogSearch["tier2"]["decision"]["type"];

/** A candidate as the report sees it. Resolved locally so the report does not depend on other packages' view models. */
export interface ReportCandidate {
  key: string; // t1:<region_id> | t2:<window id>
  tier: 1 | 2;
  id: string;
  label: string;
  lat: number;
  lon: number;
  score: number | null;
  coverage: number | null;
  /** Descriptors computed / descriptors defined (8 research descriptors, 7 screening descriptors). */
  measures: { used: number | null; of: number };
  t1?: Tier1Candidate;
  t2?: Tier2Candidate;
}

/** How the chosen candidate relates to the research decision. A tie member is never a winner. */
export type CandidateRole = "stable_leader" | "tie_member" | "research_window" | "screening_cell";

export function windowLabel(id: string): string {
  const m = /^rand_d(\d+)_(\d+)$/.exec(id);
  return m ? `Window ${m[2]} · roughness decile ${m[1]}` : id.replace(/_/g, " ");
}

export function cellLabel(c: Tier1Candidate): string {
  return c.known_analog.name ? `Cell near ${c.known_analog.name}` : `Cell at ${fmtCoord(c.lat, c.lon, 2)}`;
}

export function fmtLat(lat: number, d = 2) { return `${Math.abs(lat).toFixed(d)}° ${lat >= 0 ? "N" : "S"}`; }
export function fmtLon(lon: number, d = 2) { return `${Math.abs(lon).toFixed(d)}° ${lon >= 0 ? "E" : "W"}`; }
export function fmtCoord(lat: number, lon: number, d = 2) { return `${fmtLat(lat, d)} ${fmtLon(lon, d)}`; }

const T2_DESCRIPTORS = 8;
const T1_DESCRIPTORS = Object.keys(TIER1_SPECS).length;

export function resolveCandidate(search: AnalogSearch | null, candidateId: string | null): ReportCandidate | null {
  if (!search || !candidateId) return null;
  const raw = candidateId.replace(/^t[12]:/, "");
  // Prefixed ids name their tier; a bare id (legacy URLs) is tried as a research window, then as a cell.
  const wantT1 = !candidateId.startsWith("t2:");
  const wantT2 = !candidateId.startsWith("t1:");
  if (wantT2) {
    const c = search.tier2.candidates.find((x) => x.id === raw);
    if (c && c.lat !== null && c.lon !== null) {
      return {
        key: `t2:${c.id}`, tier: 2, id: c.id, label: windowLabel(c.id), lat: c.lat, lon: c.lon, score: c.S, coverage: c.coverage,
        measures: { used: c.coverage === null ? null : Math.round(c.coverage * T2_DESCRIPTORS), of: T2_DESCRIPTORS }, t2: c,
      };
    }
  }
  if (wantT1) {
    const c = search.tier1?.candidates.find((x) => x.region_id === raw);
    if (c) {
      return {
        key: `t1:${c.region_id}`, tier: 1, id: c.region_id, label: cellLabel(c), lat: c.lat, lon: c.lon, score: c.similarity, coverage: c.coverage,
        measures: { used: c.n_features_used ?? Math.round(c.coverage * T1_DESCRIPTORS), of: T1_DESCRIPTORS }, t1: c,
      };
    }
  }
  return null;
}

export function candidateRole(search: AnalogSearch, c: ReportCandidate): CandidateRole {
  if (c.tier === 1) return "screening_cell";
  const d = search.tier2.decision;
  if (d.type === "named_leader" && d.members.includes(c.id)) return "stable_leader";
  if (d.type === "tied_set" && d.members.includes(c.id)) return "tie_member";
  return "research_window";
}

export const DECISION = {
  named_leader: { title: "Stable leader", glyph: "◉", g5: G5.leader },
  tied_set: { title: "Tie", glyph: "◎", g5: G5.tied },
  no_convincing_analog: { title: "No convincing analog", glyph: "—", g5: null },
  insufficient_evidence: { title: "Not enough evidence", glyph: "⊘", g5: null },
} satisfies Record<DecisionType, { title: string; glyph: string; g5: string | null }>;

/** Headline for the research decision, e.g. "Tie · 3 equivalent windows". */
export function decisionHeadline(search: AnalogSearch): string {
  const d = search.tier2.decision;
  if (d.type === "tied_set") return `Tie · ${d.members.length} equivalent windows`;
  return DECISION[d.type].title;
}

/** The decision's verbatim label: G5 for leader/tie, otherwise the API's own label. */
export function decisionLabel(search: AnalogSearch): string | null {
  const d = search.tier2.decision;
  return DECISION[d.type].g5 ?? d.label ?? null;
}

/** Tie members as an unordered group (west to east, the order every view uses, so list order never reads as a ranking). */
export function decisionMembers(search: AnalogSearch): string[] {
  return memberOrder(search.tier2).map(windowLabel);
}

export function representationLabel(r: "mars_observation_space" | "as_measured"): string {
  return r === "mars_observation_space" ? "Earth as MOLA would observe it" : "Earth as measured";
}

export interface TerrainRow {
  key: string; label: string; unit: string; mars: number | null; earth: number | null; s: number | null;
  tol: number; transform: "log" | "linear"; kind: "match" | "mismatch" | "unknown"; interpretation: string;
}

/**
 * Global-screen (tier-1, 25 km, as measured) descriptor rows for the candidate. For a research window this
 * is the screening cell that contains it — context, never the research score.
 */
export function terrainRows(search: AnalogSearch, c: ReportCandidate): { rows: TerrainRow[]; S: number | null; coverage: number | null; cell: string } | null {
  const marsT1 = Object.fromEntries(search.mars.tier1_features.map((f) => [f.key, f.value]));
  const mk = (key: string, mars: number | null, earth: number | null, s: number | null, unit?: string): TerrainRow => {
    const spec = TIER1_SPECS[key];
    const i = interpret(key, mars, earth, s);
    return { key, label: spec?.label ?? key, unit: unit ?? spec?.unit ?? "", mars, earth, s, tol: spec?.tol ?? 0, transform: spec?.transform ?? "log", kind: i.kind, interpretation: i.text };
  };
  if (c.t1) {
    const t1 = c.t1;
    return { cell: t1.region_id, S: t1.similarity, coverage: t1.coverage, rows: Object.keys(TIER1_SPECS).map((k) => mk(k, marsT1[k] ?? null, t1.features[k] ?? null, t1.per_feature[k] ?? null)) };
  }
  const ctx = c.t2?.tier1_context;
  if (!ctx) return null;
  return { cell: ctx.region_id, S: ctx.similarity, coverage: ctx.coverage, rows: ctx.rows.map((r) => mk(r.key, r.mars, r.earth, r.s, r.unit)) };
}

export type DimensionStatus = "evaluated" | "partial" | "not_evaluated";
export function dimensions(c: ReportCandidate): { name: string; status: DimensionStatus; detail: string }[] {
  const lc = c.t2?.landcover;
  const pc = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)} %`);
  return [
    { name: "Terrain and geomorphology", status: "evaluated", detail: c.tier === 2 ? "Eight multiscale terrain descriptors, compared with Earth as MOLA would observe it (50 km window)." : "Seven screening descriptors on 25 km cells, Earth as measured." },
    { name: "Engineering and operations", status: lc?.available ? "partial" : "not_evaluated", detail: lc?.available ? `Exposed-ground check only: ${pc(lc.frac_bare_like)} bare-like, ${pc(lc.frac_vegetated)} vegetated (ESA WorldCover 2021). Trafficability, access and permits not assessed.` : "No surface-cover or access data for this candidate." },
    { name: "Geological materials", status: "not_evaluated", detail: "No lithology or mineralogy dataset is connected for either planet." },
    { name: "Surface processes", status: "not_evaluated", detail: "Process relationships need geological evidence; terrain geometry alone cannot establish them." },
    { name: "Environmental conditions", status: "not_evaluated", detail: "Climate and thermal datasets are not comparable or not ingested (e.g. MODIS LST is not TES thermal inertia)." },
    { name: "Resources", status: "not_evaluated", detail: "Ice and mineral resource layers are not connected." },
  ];
}

export interface Limitation { code: string; text: string; verbatim: boolean }

/** The slice of /api/evidence the report quotes. */
export interface EvidenceRecord { limitations?: { code: string; text: string }[] }

/** Structured limitations: every tier-2 disclaimer code mapped to its text (G5 verbatim where one exists). */
export function limitations(search: AnalogSearch, evidence?: EvidenceRecord | null): Limitation[] {
  const t2 = search.tier2;
  const pool = t2.candidate_pool as { n_windows?: number; window_km?: number; note?: string } | null;
  const map: Record<string, Limitation> = {
    terrain_only: { code: "terrain_only", text: G5.scope, verbatim: true },
    synthetic_validation_only: { code: "synthetic_validation_only", text: G5.validation, verbatim: true },
    footprint_dependent: { code: "footprint_dependent", text: G5.scale, verbatim: true },
    no_gravity_atmosphere_radiation: { code: "no_gravity_atmosphere_radiation", text: "Gravity, atmospheric pressure and composition, temperature and surface radiation differ fundamentally; no Earth site reproduces them (see Planetary differences).", verbatim: false },
    fixed_230_window_research_pool: { code: "fixed_230_window_research_pool", text: `Research comparison candidates come from a fixed pool of ${pool?.n_windows ?? 230} Earth windows (${pool?.window_km ?? 50} km).${pool?.note ? ` ${pool.note}` : ""}`, verbatim: false },
  };
  const out: Limitation[] = t2.disclaimers.map((code) => map[code] ?? { code, text: code.replace(/_/g, " "), verbatim: false });
  const have = new Set(out.map((l) => l.code));
  // G5 strings that must always be reachable, even if the API omits the code.
  for (const k of ["terrain_only", "synthetic_validation_only", "footprint_dependent"]) if (!have.has(k)) out.push(map[k]);
  out.push({ code: "operator_model", text: G5.operator, verbatim: true });
  // The figures come from the evidence record (/api/evidence); without it the statement carries none.
  const surrogate = evidence?.limitations?.find((l) => l.code === "operator_is_surrogate")?.text;
  out.push({ code: "operator_misspecification", text: surrogate ?? "Observation-space matching fails if the true MOLA operator differs from the assumed one; the evidence record quantifies this on synthetic twins.", verbatim: false });
  if (t2.landcover_gate?.mode === "exclude") out.push({ code: "landcover_gate", text: G5.gate, verbatim: true });
  return out;
}

export const REFERENCES = [
  "NASA PDS Geosciences Node: MGS MOLA MEGDR (MGS-M-MOLA-5-MEGDR-L3-V1.0), 128 px/deg counts.",
  "USGS Astrogeology: Mars MGS MOLA DEM 463 m global mosaic.",
  "Copernicus DEM GLO-90 (ESA; AWS Open Data). GMTED2010 (USGS/NGA).",
  "ESA WorldCover 10 m 2021 v200.",
  "Bussey & Hoffman (2016), NASA NTRS 20160001040 — human-class Exploration Zone criteria.",
  "Bodas-Salcedo et al. (2011) BAMS doi:10.1175/2011BAMS2856.1 — satellite-simulator (forward operator) principle.",
  "Kreslavsky & Head (1999) JGR doi:10.1029/1999JE001051; Shepard et al. (2001) JGR doi:10.1029/2000JE001429.",
  "Voigt et al. (2025) PSJ doi:10.3847/PSJ/adb5f1 — Holuhraun–Elysium Planitia analog (positive control).",
  "NASA Mars Trek (trek.nasa.gov) and NASA GIBS (earthdata.nasa.gov/gibs) — plate imagery, visualization only.",
];

// ---------------------------------------------------------------------------------------- exports

export function buildReportJson(search: AnalogSearch, c: ReportCandidate | null, mission: MissionProfile | null, generatedAt: string, evidence?: EvidenceRecord | null) {
  const target = searchTarget(search) as SearchTarget;
  const t2 = search.tier2;
  const role = c ? candidateRole(search, c) : null;
  const terrain = c ? terrainRows(search, c) : null;
  return {
    product: "TerraTwin characterization report",
    status: "candidate_identification — not validation of a new analog",
    generated_at: generatedAt,
    analysis_id: search.id,
    mars_target: {
      label: target.label, site: target.siteId, lat: target.lat, lon: target.lon,
      coordinate_convention: "planetocentric latitude, east-positive longitude, Mars sphere R = 3,396,190 m",
      requested_footprint_km: target.footprintKm,
      analysis_units: { tier1: "25 km cells (zone median)", tier2: `${t2.target.window_km} km window` },
      research_window_centre: { lat: t2.target.lat, lon: t2.target.lon, window_km: t2.target.window_km },
      tier1_features: search.mars.tier1_features.map(({ key, value, unit, state, source_id }) => ({ key, value, unit, state, source_id, tier: 1, representation: "as_measured" })),
      observation_support: search.mars.observation_support,
    },
    mission: mission ? { id: mission.id, label: mission.label, gate_mode: mission.gate_mode, weights_status: mission.weights_status } : { id: target.mission },
    earth_candidate: c ? {
      id: c.id, label: c.label, tier: c.tier, role, lat: c.lat, lon: c.lon,
      unit: c.tier === 2 ? `${c.t2?.window_km ?? 50} km window, 463 m local AEQD` : "25 km GMTED2010 cell",
      score: c.score, score_name: c.tier === 2 ? "S (research comparison, rotation 0°, equal weights)" : "screen similarity (global screen, mission weights)",
      coverage: c.coverage, measures: c.measures,
      representation: c.tier === 2 ? t2.representation : "as_measured",
      decision: c.tier === 2 ? t2.decision.type : "screen_rank_not_a_decision",
      screen_rank: c.t1?.rank ?? null,
      landcover: c.t2?.landcover ?? null,
      known_analog_status: c.t1?.known_analog.status ?? c.t2?.kind ?? null,
      novelty_claim: "not_assessed",
    } : null,
    tier2_decision: { ...t2.decision, headline: decisionHeadline(search), members_unordered: t2.decision.type === "tied_set" },
    operator: t2.operator,
    landcover_gate: t2.landcover_gate,
    as_measured_baseline: t2.as_measured_baseline,
    terrain_comparison: terrain ? {
      basis: "Global-screen descriptors, 25 km, Earth as measured — context, not the research score",
      tier: 1, representation: "as_measured", cell: terrain.cell, screen_similarity: terrain.S, coverage: terrain.coverage,
      rows: terrain.rows.map(({ key, label, unit, mars, earth, s, tol, kind, interpretation }) => ({ key, label, unit, mars, earth, similarity_component: s, tolerance: tol, within_tolerance: kind === "unknown" ? null : kind === "match", interpretation })),
    } : null,
    dimensions_of_analogy: c ? dimensions(c) : [],
    coverage: {
      tier1_cells_searched: search.tier1?.candidate_pool.n_cells_searched ?? null,
      tier2_pool: t2.candidate_pool,
      live_refinement: t2.live_refinement,
    },
    validation_status: t2.validation_status,
    disclaimers: t2.disclaimers,
    limitations: limitations(search, evidence).map(({ code, text, verbatim }) => ({ code, text, verbatim_g5: verbatim })),
    planetary_differences: PLANETARY_DIFFERENCES,
    imagery: "Location plates: NASA Mars Trek / NASA GIBS imagery — visualization only; not used in any measurement.",
  };
}

export const CSV_COLUMNS = ["section", "tier", "representation", "id", "label", "lat", "lon", "key", "mars_value", "earth_value", "unit", "score", "score_name", "coverage", "decision", "note"] as const;
type CsvRow = Partial<Record<(typeof CSV_COLUMNS)[number], string | number | null | undefined>>;

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One long table; every row says its tier, representation and decision basis (never blank: rows that are
 * not a tier-specific result say "n/a" and why). Tier scores never share a column meaning silently:
 * score_name names each.
 */
export function buildCsv(search: AnalogSearch, c: ReportCandidate | null, evidence?: EvidenceRecord | null): string {
  const target = searchTarget(search) as SearchTarget;
  const t2 = search.tier2;
  const rows: CsvRow[] = [];
  rows.push({ section: "mars_target", tier: "n/a", representation: "n/a", decision: "n/a_target_definition", id: target.siteId ?? "", label: target.label, lat: target.lat, lon: target.lon, unit: "deg", note: `mission ${target.mission}; requested footprint ${target.footprintKm} km` });
  for (const f of search.mars.tier1_features) {
    rows.push({ section: "mars_descriptor", tier: 1, representation: "as_measured", decision: "n/a_descriptor_zone_median", key: f.key, label: f.label, mars_value: f.value, unit: f.unit, note: f.state });
  }
  if (c) {
    const role = candidateRole(search, c);
    rows.push({
      section: "selected_candidate", tier: c.tier, representation: c.tier === 2 ? t2.representation : "as_measured", id: c.id, label: c.label, lat: c.lat, lon: c.lon,
      score: c.score, score_name: c.tier === 2 ? "S_research" : "screen_similarity", unit: "index 0-1", coverage: c.coverage,
      decision: c.tier === 2 ? t2.decision.type : "screen_rank_not_a_decision", note: role + (c.t1 ? `; screen rank ${c.t1.rank}` : ""),
    });
    const terrain = terrainRows(search, c);
    for (const r of terrain?.rows ?? []) {
      rows.push({ section: "terrain_comparison", tier: 1, representation: "as_measured", id: terrain!.cell, key: r.key, label: r.label, mars_value: r.mars, earth_value: r.earth, unit: r.unit, score: r.s, score_name: "similarity_component", decision: "context_not_research_score", note: r.interpretation });
    }
  }
  for (const x of t2.candidates) {
    rows.push({ section: "research_comparison", tier: 2, representation: t2.representation, id: x.id, label: windowLabel(x.id), lat: x.lat, lon: x.lon, score: x.S, score_name: "S_research", unit: "index 0-1", coverage: x.coverage, decision: t2.decision.members.includes(x.id) ? t2.decision.type : "not_a_decision_member", note: t2.decision.type === "tied_set" && t2.decision.members.includes(x.id) ? "tie member; equivalent at this resolution, not ranked" : "" });
  }
  const b = t2.as_measured_baseline;
  if (b) rows.push({ section: "uncorrected_comparator", tier: 2, representation: "as_measured", id: b.leader, label: b.leader, lat: b.lat, lon: b.lon, score: b.S, score_name: "S_as_measured", unit: "index 0-1", coverage: b.coverage, decision: "comparator_not_a_fallback", note: b.label });
  for (const x of search.tier1?.candidates ?? []) {
    rows.push({ section: "global_screen", tier: 1, representation: "as_measured", id: x.region_id, label: cellLabel(x), lat: x.lat, lon: x.lon, score: x.similarity, score_name: "screen_similarity", unit: "index 0-1", coverage: x.coverage, decision: "screen_rank_not_a_decision", note: `rank ${x.rank}` });
  }
  for (const l of limitations(search, evidence)) rows.push({ section: "limitation", tier: "n/a", representation: "n/a", decision: "n/a_statement", key: l.code, note: l.text });
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((k) => csvEscape(r[k])).join(","));
  return lines.join("\n");
}

export function exportBaseName(search: AnalogSearch): string {
  const t = searchTarget(search);
  return `terratwin-${(t?.siteId ?? "target").replace(/[^\w-]+/g, "_")}-${search.id}`;
}
