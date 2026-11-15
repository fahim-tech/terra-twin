/** Pure helpers for the GIS Mars point readouts (GisPoint.tsx). */

/** 1 km grid terrain values shown at a point (others stay in the payload). */
export const GRID_TERRAIN_KEYS = ["elevation_m", "slope_local_deg", "mean_slope_deg", "relative_relief_m"] as const;
/** Observation support at the grid cell: metadata only, never a weight or confidence. */
export const GRID_SUPPORT_KEYS = ["obs_bins", "window_observed_pct", "dist_to_observed_m"] as const;

/** Context layers by id (services/gis.ts ContextPoint). Unknown ids keep their own name. */
export const CONTEXT_LABELS: Record<string, string> = {
  tes_thermal_inertia_night: "TES thermal inertia · night",
  tes_thermal_inertia_day: "TES thermal inertia · day",
  tes_lambert_albedo: "TES albedo",
  tes_dust_cover_index: "Dust cover index",
  grs_h2o_weight_percent: "GRS H₂O",
  geologic_unit: "Geologic unit",
};

/** A descriptor's baseline: one length ("926 m"), a set of lengths ("926–9,262 m"), or "—" when the record has none. */
export function baselineText(b: number | number[] | null | undefined): string {
  const m = (v: number) => Math.round(v).toLocaleString("en-US");
  if (Array.isArray(b)) {
    const xs = b.filter((v) => Number.isFinite(v));
    if (!xs.length) return "—";
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return lo === hi ? `${m(lo)} m` : `${m(lo)}–${m(hi)} m`;
  }
  return typeof b === "number" && Number.isFinite(b) ? `${m(b)} m` : "—";
}

const FLAG_TEXT: Record<string, string> = {
  mars_grid_is_binned_altimetry_not_observation: "Mars grid is binned altimetry, not an observation",
};

/** A quality-flag code in words (the code itself, de-underscored, when it is not one we know). */
export function flagText(code: string): string {
  return FLAG_TEXT[code] ?? `${code.charAt(0).toUpperCase()}${code.slice(1).replace(/_/g, " ")}`;
}
