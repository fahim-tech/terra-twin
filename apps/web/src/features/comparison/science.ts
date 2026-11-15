/** Interpretation helpers that only restate the research kernel; no new thresholds are introduced. */

// Tier-1 registry (vendor/terratwin/similarity.py TIER1_FEATURES).
export const TIER1_SPECS: Record<string, { label: string; unit: string; tol: number; transform: "log" | "linear" }> = {
  mean_slope_deg: { label: "Mean slope", unit: "deg", tol: 0.3, transform: "log" },
  slope_p90_deg: { label: "Slope, 90th pct.", unit: "deg", tol: 0.3, transform: "log" },
  relative_relief_m: { label: "Relative relief", unit: "m", tol: 0.4, transform: "log" },
  elev_std_m: { label: "Elevation std. dev.", unit: "m", tol: 0.35, transform: "log" },
  rmsdev_short: { label: "RMS deviation ~1.85 km", unit: "m", tol: 0.35, transform: "log" },
  rmsdev_long: { label: "RMS deviation ~7.4 km", unit: "m", tol: 0.35, transform: "log" },
  hurst_2pt: { label: "Hurst exponent (2-pt)", unit: "-", tol: 0.08, transform: "linear" },
};

// Tier-2 descriptors (oom_analysis.FEATS order).
export const TIER2_LABELS: Record<string, { label: string; unit: string }> = {
  mean_slope_deg: { label: "Mean slope", unit: "deg" },
  slope_p90_deg: { label: "Slope, 90th pct.", unit: "deg" },
  relative_relief_m: { label: "Relative relief", unit: "m" },
  detrended_rms_m: { label: "Detrended RMS height", unit: "m" },
  rmsdev_926m: { label: "RMS deviation @ 926 m", unit: "m" },
  rmsdev_2315m: { label: "RMS deviation @ 2.3 km", unit: "m" },
  rmsdev_9262m: { label: "RMS deviation @ 9.3 km", unit: "m" },
  hurst_H: { label: "Hurst exponent", unit: "-" },
};

/**
 * The kernel scores s = exp(-|d| / ln(1+τ)) (log features) or exp(-|d|/τ) (Hurst), so a difference
 * exactly at the registry tolerance τ gives s = 1/e. "Within tolerance" is therefore s ≥ 1/e.
 */
export const S_AT_TOLERANCE = Math.exp(-1);

export function interpret(key: string, mars: number | null, earth: number | null, s: number | null) {
  if (mars === null || earth === null || s === null) return { kind: "unknown" as const, text: "Not comparable — value missing" };
  const spec = TIER1_SPECS[key];
  const within = s >= S_AT_TOLERANCE;
  let rel: string;
  if (spec?.transform === "linear") {
    const d = earth - mars;
    rel = `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)} on Earth`;
  } else {
    const r = Math.max(earth, 1e-9) / Math.max(mars, 1e-9);
    rel = r >= 1 ? `Earth ${r.toFixed(2)}× higher` : `Earth ${(1 / r).toFixed(2)}× lower`;
  }
  return { kind: within ? ("match" as const) : ("mismatch" as const), text: `${within ? "Within" : "Outside"} research tolerance · ${rel}` };
}

/** Planetary conditions that no Earth site reproduces. NASA NSSDCA Mars/Earth fact sheets. */
export const PLANETARY_DIFFERENCES = [
  { factor: "Surface gravity", mars: "3.71 m/s²", earth: "9.81 m/s²", note: "~38 % of Earth; affects slope stability, regolith mechanics and mobility." },
  { factor: "Surface pressure", mars: "~0.6 kPa (variable)", earth: "101.3 kPa", note: "Below the water triple point over most of Mars; aeolian and thermal behaviour differ." },
  { factor: "Atmosphere", mars: "~95 % CO₂", earth: "78 % N₂, 21 % O₂", note: "Different weathering chemistry and thermal coupling." },
  { factor: "Mean surface temperature", mars: "~210 K", earth: "~288 K", note: "Freeze–thaw and ice processes operate in different regimes." },
  { factor: "Surface radiation", mars: "No global magnetic field, thin atmosphere", earth: "Shielded by magnetosphere and atmosphere", note: "Surface dose on Mars is far higher; not reproducible by any terrestrial site." },
  { factor: "Biology", mars: "No known biosphere", earth: "Biologically active", note: "Earth surfaces carry biological weathering and soils; relevance depends on the investigation." },
];
export const DIFFERENCES_SOURCE = "NASA NSSDCA Planetary Fact Sheets (nssdc.gsfc.nasa.gov/planetary/factsheet)";

// ---------------------------------------------------------------- ratio chart geometry

/** Log axis of the measurements chart: Earth/Mars from 0.5× to 2×. Hurst uses a linear Δ axis of ±0.3. */
export const RATIO_DOMAIN: [number, number] = [0.5, 2];
export const HURST_DOMAIN = 0.3;

export interface RatioRow {
  key: string;
  label: string;
  unit: string;
  mars: number | null;
  earth: number | null;
  /** Kernel per-descriptor similarity (from the API); null when not computable. */
  s: number | null;
  transform: "log" | "linear";
  tol: number;
  /** Earth/Mars ratio (log rows) or Earth − Mars (linear rows); null when either value is missing or non-positive. */
  value: number | null;
  /** Position of the value on the row's axis, 0..1, clamped. */
  pos: number | null;
  /** True when the value lies outside the drawn axis and is pinned to its edge. */
  clipped: boolean;
  /** Tolerance band on the axis, 0..1. */
  band: [number, number];
  /** Within research tolerance (kernel s ≥ 1/e, which is the same as the value lying inside the band). */
  within: boolean | null;
  /** Short relation, e.g. "1.33× higher on Earth", "+0.02 on Earth". */
  relation: string;
}

const log2 = (x: number) => Math.log(x) / Math.LN2;
/** 0..1 on the 0.5×–2× log axis. */
export function ratioPos(r: number): number {
  return (log2(r) - log2(RATIO_DOMAIN[0])) / (log2(RATIO_DOMAIN[1]) - log2(RATIO_DOMAIN[0]));
}
/** 0..1 on the ±0.3 linear Δ axis. */
export function deltaPos(d: number): number {
  return (d + HURST_DOMAIN) / (2 * HURST_DOMAIN);
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** One chart row from Mars/Earth values and the registry tolerance (no new thresholds). */
export function ratioRow(key: string, mars: number | null, earth: number | null, s: number | null, label?: string, unit?: string): RatioRow {
  const spec = TIER1_SPECS[key] ?? { label: label ?? key, unit: unit ?? "", tol: 0.3, transform: "log" as const };
  const base = { key, label: label ?? spec.label, unit: unit ?? spec.unit, mars, earth, s, transform: spec.transform, tol: spec.tol };
  if (spec.transform === "linear") {
    const band: [number, number] = [deltaPos(-spec.tol), deltaPos(spec.tol)];
    if (mars === null || earth === null) return { ...base, value: null, pos: null, clipped: false, band, within: null, relation: "Not comparable — value missing" };
    const d = earth - mars;
    const raw = deltaPos(d);
    const within = s !== null ? s >= S_AT_TOLERANCE : Math.abs(d) <= spec.tol;
    return { ...base, value: d, pos: clamp01(raw), clipped: raw < 0 || raw > 1, band, within, relation: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)} on Earth` };
  }
  const band: [number, number] = [ratioPos(1 / (1 + spec.tol)), ratioPos(1 + spec.tol)];
  if (mars === null || earth === null || mars <= 0 || earth <= 0) return { ...base, value: null, pos: null, clipped: false, band, within: null, relation: "Not comparable — value missing" };
  const r = earth / mars;
  const raw = ratioPos(r);
  const within = s !== null ? s >= S_AT_TOLERANCE : r >= 1 / (1 + spec.tol) && r <= 1 + spec.tol;
  const relation = Math.abs(r - 1) < 0.005 ? "Equal on both" : r > 1 ? `${r.toFixed(2)}× higher on Earth` : `${(1 / r).toFixed(2)}× lower on Earth`;
  return { ...base, value: r, pos: clamp01(raw), clipped: raw < 0 || raw > 1, band, within, relation };
}

/** A labelled axis tick: value, 0..1 position on the row's axis and its mono label. */
export interface AxisTick { v: number; pos: number; label: string }

/** Log-axis ticks (Earth ÷ Mars). 1.00 is the Mars reference; 0.67 and 1.5 are reciprocal, so the grid is symmetric. */
export const LOG_TICKS: AxisTick[] = [0.5, 2 / 3, 1, 1.5, 2].map((v) => ({ v, pos: ratioPos(v), label: v.toFixed(2) }));

/** Linear Δ ticks for the Hurst row (Earth − Mars), with typographic minus signs. */
export const DELTA_TICKS: AxisTick[] = [-HURST_DOMAIN, -HURST_DOMAIN / 2, 0, HURST_DOMAIN / 2, HURST_DOMAIN].map((v) => ({
  v, pos: deltaPos(v), label: v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`,
}));

/**
 * The row's relation split for typesetting (figure in mono, words in the text face). Same rules and
 * rounding as `relation`; `figure` is null when there is no number to show.
 */
export function relationParts(r: RatioRow): { figure: string | null; text: string } {
  if (r.value === null) return { figure: null, text: r.relation };
  if (r.transform === "linear") return { figure: `${r.value >= 0 ? "+" : "−"}${Math.abs(r.value).toFixed(2)}`, text: "on Earth" };
  if (Math.abs(r.value - 1) < 0.005) return { figure: null, text: r.relation };
  return r.value > 1 ? { figure: `${r.value.toFixed(2)}×`, text: "higher on Earth" } : { figure: `${(1 / r.value).toFixed(2)}×`, text: "lower on Earth" };
}

/** Splits rows into "Similar" (inside tolerance), "Different" (outside) and "Not comparable". */
export function groupRows(rows: RatioRow[]) {
  return {
    similar: rows.filter((r) => r.within === true),
    different: rows.filter((r) => r.within === false),
    missing: rows.filter((r) => r.within === null),
  };
}
