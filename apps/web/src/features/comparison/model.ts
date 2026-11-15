/**
 * Display model for the comparison stage. Everything here restates the API record bound to the
 * search target (searchTarget(search)), never the live Mars selection, and introduces no new
 * thresholds or values.
 */
import { G5, GLOSSARY, zoneName } from "../../lib/glossary";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";

export type VerdictKind = "leader" | "tie_member" | "not_member" | "screening" | "no_convincing" | "insufficient";

export interface Verdict {
  kind: VerdictKind;
  /** ◉ stable leader, ◎ tie, ○ screening, — no decision. Always paired with words. */
  glyph: string;
  headline: string;
  /** The verbatim G5 label or the plain explanation that goes with the headline. */
  detail: string;
}

/** The research decision as it applies to the candidate being compared. Ties never read as a win. */
export function verdictFor(search: AnalogSearch, c: CandidateView): Verdict {
  if (c.tier === 1) {
    return {
      kind: "screening", glyph: "○",
      headline: `Screening cell${c.rank ? ` #${c.rank}` : ""} — not a decision`,
      detail: "A global-screen cell (25 km, Earth as measured). Screening ranks are a wide net, not a research decision.",
    };
  }
  const d = search.tier2.decision;
  const id = c.t2?.id ?? "";
  const k = d.members.indexOf(id);
  if (d.type === "named_leader") {
    return k >= 0
      ? { kind: "leader", glyph: "◉", headline: "Stable leader", detail: d.label ?? G5.leader }
      : { kind: "not_member", glyph: "—", headline: "Research window — not the stable leader", detail: `The stable leader for this zone is ${d.members[0] ?? "another window"}.` };
  }
  if (d.type === "tied_set") {
    return k >= 0
      ? { kind: "tie_member", glyph: "◎", headline: `Member of a tie (${k + 1} of ${d.members.length})`, detail: d.label ?? G5.tied }
      : { kind: "not_member", glyph: "—", headline: "Research window — outside the tied set", detail: d.label ?? G5.tied };
  }
  if (d.type === "no_convincing_analog") {
    return { kind: "no_convincing", glyph: "—", headline: "No convincing analog", detail: d.label ?? "The research record does not name an Earth window for this zone." };
  }
  return { kind: "insufficient", glyph: "—", headline: GLOSSARY.notEnough.label, detail: d.label ?? GLOSSARY.notEnough.definition };
}

/** How many descriptors carried the score, e.g. "8/8 measures". */
export function measuresLabel(c: CandidateView): string | null {
  if (c.tier === 1) {
    const used = c.t1?.n_features_used;
    return used !== undefined && c.coverage !== null ? `${used}/${Math.round(used / Math.max(c.coverage, 1e-9))} measures` : null;
  }
  if (c.coverage === null) return null;
  return `${Math.round(c.coverage * 8)}/8 measures`;
}

/** The basis line printed under every score. */
export function basisFor(c: CandidateView): string {
  const m = measuresLabel(c);
  return c.tier === 2
    ? `Research comparison · Earth as MOLA would observe it${m ? ` · ${m}` : ""}`
    : `Global screen · 25 km cell · Earth as measured${m ? ` · ${m}` : ""}`;
}

/** Plain place name + secondary line for an Earth candidate (random windows have no toponym). */
export function earthName(c: CandidateView): { name: string; sub: string | null } {
  if (c.tier === 2) {
    const m = /^rand_d(\d)_(\d+)$/.exec(c.t2?.id ?? "");
    if (m) return { name: `Research window ${m[2]}`, sub: `Stratified random window · roughness decile ${m[1]}` };
    const kind = c.t2?.kind ?? null;
    return { name: c.label, sub: kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : null };
  }
  return { name: c.label, sub: c.t1 ? `Global-screen cell ${c.t1.region_id.split(":")[1] ?? c.t1.region_id}` : null };
}

export interface CompareTargets {
  mars: { name: string; lat: number; lon: number; km: number };
  earth: { name: string; sub: string | null; lat: number; lon: number; km: number };
  /** What the footprints are: the 50 km research window or the 25 km screening cell. */
  footprintLabel: string;
}

/** The two footprints that were actually compared — Mars from tier2.target, Earth from the candidate. */
export function compareTargets(search: AnalogSearch, c: CandidateView): CompareTargets | null {
  const t = searchTarget(search);
  if (!t) return null;
  const name = t.siteId ? zoneName(t.label) : t.label;
  const e = earthName(c);
  if (c.tier === 2) {
    const tg = search.tier2.target;
    const km = c.t2?.window_km ?? tg.window_km ?? 50;
    return {
      mars: { name, lat: tg.lat, lon: tg.lon, km: tg.window_km ?? km },
      earth: { name: e.name, sub: e.sub, lat: c.lat, lon: c.lon, km },
      footprintLabel: `${km} km research window`,
    };
  }
  const km = c.t1?.footprint.cell_km_ns ?? 25;
  return {
    mars: { name, lat: t.lat, lon: t.lon, km },
    earth: { name: e.name, sub: e.sub, lat: c.lat, lon: c.lon, km },
    footprintLabel: `${Math.round(km)} km screening cell`,
  };
}

/** Robustness facts from tier2.diagnostics (ungated research diagnostics), when present. */
export interface Robustness {
  leaderSame50vs25: boolean | null;
  spearman50vs25: number | null;
  leaderChangedVsBaseline: boolean | null;
  spearmanBaselineVsOom: number | null;
  top10Overlap: number | null;
  note: string | null;
}
export function robustness(search: AnalogSearch): Robustness | null {
  const d = (search.tier2 as { diagnostics?: Record<string, unknown> | null }).diagnostics;
  if (!d) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const b = (v: unknown) => (typeof v === "boolean" ? v : null);
  return {
    leaderSame50vs25: b(d.footprint_leader_same_50_vs_25km),
    spearman50vs25: n(d.footprint_spearman_50_vs_25km),
    leaderChangedVsBaseline: b(d.leader_changed_vs_baseline),
    spearmanBaselineVsOom: n(d.spearman_baseline_vs_oom),
    top10Overlap: n(d.top10_overlap_baseline_vs_oom),
    note: typeof d.note === "string" ? d.note : null,
  };
}

/** Why the per-descriptor research values are not shown (reasons come from the API record). */
export function notLoadedReasons(c: CandidateView): { mars: string; earthOom: string } {
  const f = (c.t2?.features ?? {}) as { mars_reason?: string; earth_oom_reason?: string };
  return {
    mars: f.mars_reason ?? "Mars 50 km window descriptors are stored only in the research record.",
    earthOom: f.earth_oom_reason ?? "Operator output requires the target's MEGDR counts tiles.",
  };
}
