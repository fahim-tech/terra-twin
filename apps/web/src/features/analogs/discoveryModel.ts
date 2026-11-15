/**
 * Pure helpers for the GIS point record and the live discovery flow (services/gis.ts payloads). Nothing here
 * invents a value: every figure is read from a payload, a missing one stays null (printed as "—"), and labels
 * are derived from the contract's own keys.
 */
import { formatLat, formatLon } from "../../lib/geodesy";
import { G5 } from "../../lib/glossary";
import type { DiscoveryCandidate, DiscoveryJob, DiscoveryRun } from "../../services/gis";

/** Plain labels for the descriptor keys of gis-contract-1.0 (tier-2 50 km windows and the tier-1 screen). */
export const DESCRIPTOR_LABELS: Record<string, string> = {
  mean_slope_deg: "Mean slope",
  slope_p90_deg: "90th-pct slope",
  relative_relief_m: "Relative relief",
  detrended_rms_m: "Detrended RMS height",
  rmsdev_926m: "RMS deviation · 926 m",
  rmsdev_2315m: "RMS deviation · 2,315 m",
  rmsdev_9262m: "RMS deviation · 9,262 m",
  hurst_H: "Hurst exponent",
  elev_std_m: "Elevation std. dev.",
  rmsdev_short: "RMS deviation · short",
  rmsdev_long: "RMS deviation · long",
  hurst_2pt: "Hurst exponent · 2-point",
  elevation_m: "Elevation",
  slope_local_deg: "Local slope",
};

/** Label for a descriptor key; an unknown key is said as the record writes it, never guessed. */
export function descriptorLabel(key: string): string {
  return DESCRIPTOR_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * Unit of a descriptor: the payload's unit when it gives one, else read from the key's own suffix (`_deg`,
 * `_m`, or a metre baseline such as `rmsdev_926m`). Dimensionless values ("1") print no unit.
 */
export function descriptorUnit(key: string, units?: Record<string, string> | null): string {
  const u = units?.[key];
  if (u !== undefined) return u === "1" ? "" : u === "deg" ? "°" : u;
  if (/_deg$/.test(key)) return "°";
  if (/_m$|_\d+m$|^rmsdev_/.test(key)) return "m";
  return "";
}

/** Fixed precision per unit: degrees 2 dp, metres 1 dp, dimensionless 3 dp. */
export function descriptorDigits(unit: string): number {
  return unit === "°" ? 2 : unit === "m" ? 1 : 3;
}

/** A value with its unit, or "—" when the record has none (never 0). */
export function formatValue(v: number | string | null | undefined, unit = "", digits?: number): string {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "—";
  if (typeof v === "string") return v;
  const d = digits ?? descriptorDigits(unit);
  const s = v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return unit ? (unit === "°" ? `${s}°` : `${s} ${unit}`) : s;
}

/** Fraction as a whole percentage, or "—". */
export function pctText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—";
}

/** A readable coordinate label for a discovery window or a tier-1 cell id: "30.76° N 64.78° E". */
export function cellLabel(lat: number, lon: number): string {
  return `${formatLat(lat, 2)} ${formatLon(lon, 2)}`;
}

/** West to east, for every unordered set (a tie is never shown in score order). */
export function westToEast<T extends { lon: number }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => a.lon - b.lon);
}

/** Members of the run's decision, from its candidates, listed west to east (never by S). */
export function decisionMembers(run: DiscoveryRun): DiscoveryCandidate[] {
  const r = run.refinement;
  if (!r) return [];
  const ids = namedIds(run);
  return westToEast(r.candidates.filter((c) => ids.has(c.id)));
}

/**
 * Candidates outside the decision (context only). Payload order is kept; a named leader or tie member is
 * never mixed in, and no rank number is shown for them.
 */
/**
 * The windows a decision names: the stable leader or the tied set. "No convincing analog" and "not enough
 * evidence" name none (their `members` are the closest windows, which the decision explicitly does not name).
 */
function namedIds(run: DiscoveryRun): Set<string> {
  const d = run.refinement?.decision;
  return new Set(d && (d.type === "named_leader" || d.type === "tied_set") ? d.members : []);
}

export function otherCandidates(run: DiscoveryRun): DiscoveryCandidate[] {
  const r = run.refinement;
  if (!r) return [];
  const ids = namedIds(run);
  return r.candidates.filter((c) => !ids.has(c.id));
}

/** "global_tier1_shortlist + research_pool_230 (fixed regression sample)" → "Global tier-1 shortlist + research pool 230 (fixed regression sample)". */
export function scopeText(scope: string): string {
  return scope
    .split("+")
    .map((p) => p.trim().replace(/^global_tier1_shortlist$/, "global tier-1 shortlist").replace(/^global_tier1_index$/, "global tier-1 index").replace(/_/g, " "))
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" + ");
}

/**
 * The run's disclaimer codes in words: the G5 sentence where one exists (verbatim), else the code itself in
 * plain words.
 */
export function disclaimerText(code: string): string {
  const map: Record<string, string> = {
    terrain_only: G5.scope,
    synthetic_validation_only: G5.validation,
    footprint_dependent: G5.scale,
  };
  return map[code] ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Progress of a running job from its payload only: k of n windows, or null when the job does not say. */
export function windowsProgress(job: DiscoveryJob | null | undefined): { k: number; n: number; frac: number } | null {
  const p = job?.progress;
  if (!p || typeof p.windows_ready !== "number" || typeof p.windows_target !== "number" || p.windows_target <= 0) return null;
  const k = Math.max(0, Math.min(p.windows_ready, p.windows_target));
  return { k, n: p.windows_target, frac: k / p.windows_target };
}

/** Elapsed seconds as "3 min 07 s" / "42 s", or "—". */
export function elapsedText(s: number | null | undefined): string {
  if (typeof s !== "number" || !Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}

/** Which of the job's states is current, for the instrument's state marks. */
export type JobPhase = "queued" | "busy" | "running" | "done" | "failed";
export function jobPhase(job: DiscoveryJob): JobPhase {
  switch (job.status) {
    case "pending": return "queued";
    case "paused": case "blocked": return "busy";
    case "running": return "running";
    case "done": return "done";
    default: return "failed";
  }
}

/** Live discovery window id used on the globe and in the store. */
export const liveId = (id: string) => `live:${id}`;
