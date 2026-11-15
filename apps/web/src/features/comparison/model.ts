/**
 * Display model for the comparison stage. Everything here restates the API record bound to the
 * search target (searchTarget(search)), never the live Mars selection, and introduces no new
 * thresholds or values.
 */
import type { OutcomeKind } from "../../components/marks";
import { decisionG5Label, GLOSSARY, zoneName } from "../../lib/glossary";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, screenCellKm } from "../analogs/candidates";
import { tiedWindows, tiedWindowsListed } from "../analogs/readout";

export type VerdictKind = "leader" | "tie_member" | "not_member" | "screening" | "no_convincing" | "insufficient";

/**
 * The outcome mark each verdict draws (components/marks.tsx): a window the decision does not name, and a
 * decision that names none, both draw the hollow square; a screening cell is not a decision at all.
 */
export const VERDICT_MARK: Record<VerdictKind, OutcomeKind> = {
  leader: "leader",
  tie_member: "tie",
  not_member: "none",
  screening: "screening",
  no_convincing: "none",
  insufficient: "none",
};

export interface Verdict {
  kind: VerdictKind;
  /** The drawn outcome mark that sits beside the headline (never instead of it). */
  mark: OutcomeKind;
  headline: string;
  /** The headline for one-line readouts: the same words without the listing note. */
  short: string;
  /** The verbatim G5 label or the plain explanation that goes with the headline. */
  detail: string;
}

const verdict = (kind: VerdictKind, headline: string, detail: string, short = headline): Verdict => ({ kind, mark: VERDICT_MARK[kind], headline, short, detail });

/**
 * The research decision as it applies to the candidate being compared. Ties never read as a win, and a
 * tied window is never given a position in its set: every member reads "One of 3 tied windows".
 */
export function verdictFor(search: AnalogSearch, c: CandidateView): Verdict {
  if (c.tier === 1) {
    const km = screenCellKm(search);
    return verdict("screening", `Screening cell${c.rank ? ` #${c.rank}` : ""} — not a decision`,
      `A global-screen cell (${km !== null ? `${km} km, ` : ""}Earth as measured). Screening ranks are a wide net, not a research decision.`);
  }
  const d = search.tier2.decision;
  const member = !!c.t2 && d.members.includes(c.t2.id);
  if (d.type === "named_leader") {
    return member
      ? verdict("leader", "Stable leader", decisionG5Label(d)!)
      : verdict("not_member", "Research window — not the stable leader", `The stable leader for this zone is ${d.members[0] ? windowName(d.members[0]) : "another window"}.`);
  }
  if (d.type === "tied_set") {
    return member
      ? verdict("tie_member", tiedWindowsListed(d.members.length), decisionG5Label(d)!, tiedWindows(d.members.length))
      : verdict("not_member", "Research window — outside the tied set", decisionG5Label(d)!);
  }
  if (d.type === "no_convincing_analog") {
    return verdict("no_convincing", "No convincing analog", d.label ?? "The research record does not name an Earth window for this zone.");
  }
  return verdict("insufficient", GLOSSARY.notEnough.label, d.label ?? GLOSSARY.notEnough.definition);
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

/** The basis line printed under every score. The cell size is the record's; without it the clause is omitted. */
export function basisFor(c: CandidateView, search?: AnalogSearch | null): string {
  const km = screenCellKm(search);
  const m = measuresLabel(c);
  return c.tier === 2
    ? `Research comparison · Earth as MOLA would observe it${m ? ` · ${m}` : ""}`
    : `Global screen${km !== null ? ` · ${km} km cell` : ""} · Earth as measured${m ? ` · ${m}` : ""}`;
}

/**
 * Keeps every figure on the same line as the word after it ("8/8 measures", "463 m", "50 km"), so a
 * line never ends on a bare number. Only the space after a digit is made non-breaking.
 */
export function keepFigures(text: string): string {
  return text.replace(/(\d) (?=\S)/g, "$1\u00a0");
}

/** Display name for a research-pool window id (random windows have no toponym; named controls do). */
export function windowName(id: string): string {
  const m = /^rand_d(\d)_(\d+)$/.exec(id);
  return m ? `Research window ${m[2]}` : id;
}

/**
 * Plain copy for the research pool's `kind` field. The 17 non-random windows are the pool's named
 * controls; their kind says why each was included, which is not a statement about this comparison.
 */
export function poolKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  const k = kind.trim();
  if (k === "random") return "Stratified random window";
  if (k === "documented analog (non-terrain)") return "Named control · a documented Mars analog site, documented for reasons other than its terrain";
  if (k === "documented analog (title-level)") return "Named control · a documented Mars analog site (cited at publication-title level)";
  if (k === "documented analog") return "Named control · a documented Mars analog site";
  if (k === "negative control") return "Named control · negative control, not expected to resemble Mars";
  if (k === "prior gated candidate") return "Named control · a candidate from an earlier land-cover-gated search";
  const pos = /^positive:\s*(.+)$/.exec(k);
  if (pos) return `Named control · positive control for ${pos[1]}`;
  return `Named control · ${k}`;
}

/**
 * Plain place name + secondary line for an Earth candidate (random windows have no toponym). A screening
 * cell with no documented analog nearby has no name at all: it is called a screening cell, and its
 * position stays in the coordinate line (mono), not set as a display toponym.
 */
export function earthName(c: CandidateView): { name: string; sub: string | null } {
  if (c.tier === 2) {
    const m = /^rand_d(\d)_(\d+)$/.exec(c.t2?.id ?? "");
    if (m) return { name: windowName(c.t2!.id), sub: `Stratified random window · roughness decile ${m[1]}` };
    return { name: c.label, sub: poolKindLabel(c.t2?.kind) };
  }
  const named = !!c.t1?.known_analog?.name;
  return { name: named || !c.t1 ? c.label : "Screening cell", sub: c.t1 ? `Global-screen cell ${c.t1.region_id.split(":")[1] ?? c.t1.region_id}` : null };
}

export interface CompareTargets {
  /**
   * `footprint` says what the white square on that planet is, and what the descriptors describe; `size`
   * is the side of that square exactly as the footprint line states it (the dimension line's label).
   */
  mars: { name: string; lat: number; lon: number; km: number; size: string; footprint: string };
  earth: { name: string; sub: string | null; lat: number; lon: number; km: number; size: string; footprint: string };
  /** What is being compared: the 50 km research window or the 25 km screening cell. */
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
    // Sizes come from the record only (window_km is required by the contract), never a default.
    const km = c.t2?.window_km ?? tg.window_km;
    const marsKm = tg.window_km;
    const win = (k: number) => `${k} km research window`;
    return {
      mars: { name, lat: tg.lat, lon: tg.lon, km: marsKm, size: `${marsKm} km`, footprint: win(marsKm) },
      earth: { name: e.name, sub: e.sub, lat: c.lat, lon: c.lon, km, size: `${km} km`, footprint: win(km) },
      footprintLabel: win(km),
    };
  }
  const km = c.t1?.footprint.cell_km_ns ?? screenCellKm(search);
  if (km === null) return null; // no cell size in the record: nothing honest to draw or label
  // A screening cell is an approximate cell (the record gives slightly different N–S and E–W extents), so
  // the square is drawn at the record's N–S extent and labelled with the cell's nominal size, the same
  // figure every line states ("25 km screening cell"), never a decimal that only one edge has.
  const size = `${Math.round(km)} km`;
  const cell = `${size} screening cell`;
  return {
    // For a research zone the Mars global-screen descriptors are the median of the zone's screening
    // cells, so the square only marks the target point; it is not the area that was measured.
    mars: { name, lat: t.lat, lon: t.lon, km, size, footprint: t.siteId ? `Target point, ${size} square for scale · descriptors: zone median` : cell },
    earth: { name: e.name, sub: e.sub, lat: c.lat, lon: c.lon, km, size, footprint: cell },
    footprintLabel: cell,
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

/**
 * Why the per-descriptor research values are not shown (reasons come from the API record). The fallbacks
 * name no window size: sizes come from the record, never from a default.
 */
export function notLoadedReasons(c: CandidateView): { mars: string; earthOom: string } {
  const f = (c.t2?.features ?? {}) as { mars_reason?: string; earth_oom_reason?: string };
  return {
    mars: f.mars_reason ?? "Mars research-window descriptors are stored only in the research record.",
    earthOom: f.earth_oom_reason ?? "Operator output requires the target's MEGDR counts tiles.",
  };
}
