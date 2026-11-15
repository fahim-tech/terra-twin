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
