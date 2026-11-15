/**
 * Display model for comparing a live discovery window (a refined Earth window of a GIS discovery run) with the
 * run's Mars target. Everything is read from the run payload (services/gis.ts DiscoveryRun): sizes, counts,
 * decision, descriptors and limitations; a missing value stays null and prints as "—". No research-record
 * claim is made for a live window (it is not in the research record unless its origin says it came from the
 * research pool), and a documented analog is never claimed: the run payload names none.
 */
import { decisionG5Label, GLOSSARY, zoneName } from "../../lib/glossary";
import type { DiscoveryCandidate, DiscoveryRun } from "../../services/gis";
import type { Tier2Candidate } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { cellLabel, descriptorLabel, descriptorUnit, liveId, scopeText } from "../analogs/discoveryModel";
import { tiedWindows, tiedWindowsListed } from "../analogs/readout";
import type { CompareTargets, Verdict, VerdictKind } from "./model";
import { VERDICT_MARK } from "./model";
import { ratioRow, type RatioRow } from "./science";

type Refinement = NonNullable<DiscoveryRun["refinement"]>;
export interface LivePair {
  run: DiscoveryRun; r: Refinement; c: DiscoveryCandidate;
  /** The run's target as one of the app's research zones (it has a zone grid), or null: a named or free point. */
  zone: string | null;
}

/**
 * The run and the selected window, or null when the run has no refinement or does not list that window. A run's
 * target `site` is a research zone only when the app's zone list has that id (GIS runs may name other targets).
 */
export function livePair(run: DiscoveryRun | null | undefined, candidateId: string | null, zoneIds?: readonly string[] | null): LivePair | null {
  const r = run?.refinement;
  if (!run || !r || !candidateId) return null;
  const c = r.candidates.find((x) => x.id === candidateId);
  const site = r.target.site ?? null;
  return c ? { run, r, c, zone: site && zoneIds?.includes(site) ? site : null } : null;
}

/** The Mars target of the run: its named target (a zone's name), else "Selected point" (its coordinates stay in mono). */
export function liveMarsName(r: Refinement): string {
  return r.target.site ? zoneName(r.target.site) : "Selected point";
}

/** What the Mars target is: a research zone, a named target of the run, or a point. */
export function liveMarsKind(p: Pick<LivePair, "r" | "zone">): string {
  return p.zone ? "Research zone" : p.r.target.site ? "Run target" : "Search target";
}

/** Where the window came from, in words ("Global tier-1 shortlist", "Research pool ..."); null when the payload does not say. */
export function liveOrigin(c: DiscoveryCandidate): string | null {
  return c.origin ? scopeText(c.origin) : null;
}

/** A discovery window has no toponym: it is named for what it is, and its position stays in the coordinate line. */
export const LIVE_WINDOW_NAME = "Discovery window";

/** The two 50 km windows the run compared (sizes from the payload). */
export function liveTargets({ r, c }: LivePair): CompareTargets {
  const km = r.window_km;
  // One wording on both planets, so the strip reads "50 km on both" when the run says the windows match.
  const win = `${km} km window`;
  // The plate already prints the coordinates: the note line says where the window came from.
  const origin = liveOrigin(c);
  const sub = origin;
  return {
    mars: { name: liveMarsName(r), lat: r.target.lat, lon: r.target.lon, km: r.target.window_km, size: `${r.target.window_km} km`, footprint: `${r.target.window_km} km window` },
    earth: { name: LIVE_WINDOW_NAME, sub, subShort: origin ?? cellLabel(c.lat, c.lon), lat: c.lat, lon: c.lon, km, size: `${km} km`, footprint: win },
    footprintLabel: win,
  };
}

const verdict = (kind: VerdictKind, headline: string, detail: string, short = headline): Verdict => ({ kind, mark: VERDICT_MARK[kind], headline, short, detail });

/** The run's decision as it applies to this window: G5 wording; a tie member never gets a place in its set. */
export function liveVerdict({ r, c }: LivePair): Verdict {
  const d = r.decision;
  const member = d.members.includes(c.id);
  if (d.type === "named_leader") {
    return member ? verdict("leader", "Stable leader", decisionG5Label(d)!)
      : verdict("not_member", "Refined window — not the stable leader", "This run names another window as its stable leader.");
  }
  if (d.type === "tied_set") {
    return member ? verdict("tie_member", tiedWindowsListed(d.members.length), decisionG5Label(d)!, tiedWindows(d.members.length))
      : verdict("not_member", "Refined window — outside the tied set", decisionG5Label(d)!);
  }
  if (d.type === "no_convincing_analog") return verdict("no_convincing", "No convincing analog", "This run names no Earth window.");
  return verdict("insufficient", GLOSSARY.notEnough.label, GLOSSARY.notEnough.definition);
}

/** How many descriptors carried S ("8/8 measures"), from the payload's own count and coverage. */
export function liveMeasures(c: DiscoveryCandidate): string | null {
  const used = (c as { n_features_used?: unknown }).n_features_used;
  const total = Object.keys(c.features?.mars ?? {}).length;
  return typeof used === "number" && total ? `${used}/${total} measures` : null;
}

/** The basis printed under the score. */
export function liveBasis({ r, c }: LivePair): string {
  const m = liveMeasures(c);
  return `Live discovery · ${r.window_km} km windows · Earth as MOLA would observe it${m ? ` · ${m}` : ""}`;
}

/**
 * The window in the comparison's candidate shape, for the shared readouts (score, validation note) and the
 * relevance mode (land cover). Only what the payload holds is carried; it is never a research-record entry.
 */
export function liveView({ c }: LivePair): CandidateView {
  const lc = c.landcover;
  const t2 = lc ? { landcover: { available: (lc as { available?: boolean }).available ?? true, gate: lc.gate, frac_bare_like: lc.frac_bare_like ?? null, frac_vegetated: lc.frac_vegetated ?? null, reason: lc.reason } } : {};
  return { id: liveId(c.id), tier: 2, lat: c.lat, lon: c.lon, label: cellLabel(c.lat, c.lon), score: c.S, coverage: c.coverage, t2: t2 as unknown as Tier2Candidate };
}

export interface DescriptorRow {
  key: string; label: string; unit: string;
  mars: number | null; oom: number | null; measured: number | null;
  /** Kernel per-descriptor similarity on the observation-matched pair; null when the payload has none. */
  s: number | null;
}

/** Per-descriptor values from the run payload, in the payload's own key order (Mars keys first). */
export function descriptorRows(c: DiscoveryCandidate): DescriptorRow[] {
  const f = c.features ?? {};
  const per = ((c as { per_feature_similarity?: Record<string, number | null> }).per_feature_similarity) ?? {};
  const keys = [...new Set([...Object.keys(f.mars ?? {}), ...Object.keys(f.earth_as_mola_would_see ?? {}), ...Object.keys(f.earth_as_measured ?? {})])];
  const v = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return keys.map((k) => ({
    key: k, label: descriptorLabel(k), unit: descriptorUnit(k),
    mars: v(f.mars?.[k]), oom: v(f.earth_as_mola_would_see?.[k]), measured: v(f.earth_as_measured?.[k]), s: v(per[k]),
  }));
}

/**
 * Relation rows for the brief (Similar / Different), on the observation-matched pair. "Within tolerance" is the
 * kernel's own test (per-descriptor s ≥ 1/e); Hurst is a difference, the others a ratio.
 */
export function liveRatioRows(c: DiscoveryCandidate): RatioRow[] {
  return descriptorRows(c).map((d) => {
    const row = d.key.startsWith("hurst") ? ratioRow("hurst_2pt", d.mars, d.oom, d.s) : ratioRow(d.key, d.mars, d.oom, d.s, d.label, d.unit);
    return { ...row, key: d.key, label: d.label, unit: d.unit };
  });
}

/** The four orientations of the Earth window relative to MOLA tracks: S under each (payload order), or null. */
export function rotationScores(c: DiscoveryCandidate): (number | null)[] {
  return c.S_by_rotation ?? [];
}

/** Lowest and highest S over the orientations, as the payload states them. */
export function rotationRange(c: DiscoveryCandidate): [number, number] | null {
  const r = c.S_range_over_rotations;
  return r && typeof r[0] === "number" && typeof r[1] === "number" ? [r[0], r[1]] : null;
}

/** A number read from a loose record, or null. */
export function numAt(o: Record<string, unknown> | null | undefined, k: string): number | null {
  const v = o?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** A string read from a loose record, or null. */
export function strAt(o: Record<string, unknown> | null | undefined, k: string): string | null {
  const v = o?.[k];
  return typeof v === "string" && v ? v : null;
}

/** The run's version stamps (contract, method, processing), each null when the payload omits it. */
export function liveVersions(r: Refinement): { contract: string | null; method: string | null; processing: string | null } {
  const o = r as unknown as Record<string, unknown>;
  return { contract: strAt(o, "contract_version"), method: strAt(o, "method_version"), processing: strAt(o, "processing_version") };
}

/** The land-cover gate as the run applied it: mode and the thresholds' status, from the payload. */
export function liveGate(r: Refinement): { bare_min: number; veg_max: number; mode: string | null; status: string | null } | null {
  const g = r.landcover_gate as Record<string, unknown> | null | undefined;
  const bare = numAt(g, "bare_min"), veg = numAt(g, "veg_max");
  if (!g || bare === null || veg === null) return null;
  return { bare_min: bare, veg_max: veg, mode: strAt(g, "mode"), status: strAt(g, "status") };
}

/** "as_measured_comparison": the diagnostic baseline's S and rank for this window, with the payload's own label. */
export function asMeasured(c: DiscoveryCandidate): { S: number | null; rank: number | null; label: string | null } {
  const a = c.as_measured_comparison as Record<string, unknown> | undefined;
  return { S: numAt(a, "S"), rank: numAt(a, "rank"), label: strAt(a, "label") };
}
