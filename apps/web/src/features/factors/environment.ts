/**
 * Mars target and Earth candidate side by side on the non-terrain dimensions the GIS data covers. The two
 * planets' products measure different things, so nothing here is scored or folded into S: each row states
 * both records, and a row is called "holds" or "breaks" only where the records themselves make it plain.
 */
import type { ContextPoint } from "../../services/gis";
import { compactUnit, factorValue, type FactorRecord } from "./factors";

export interface EnvRow { dim: string; mars: string; earth: string; reading: string | null; tone: "holds" | "breaks" | null }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const NONE = "no record";

function marsText(f: FactorRecord | undefined): string {
  if (!f) return NONE;
  const v = factorValue(f);
  if (v === null) return f.reason ? `${f.status.replace(/_/g, " ")} — ${f.reason}` : f.status.replace(/_/g, " ");
  return typeof f.value === "number" ? `${f.value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(f.value) >= 10 ? 0 : 2 })}${compactUnit(f.unit) ? ` ${compactUnit(f.unit)}` : ""}` : String(f.value);
}

export function environmentRows(
  factors: FactorRecord[] | undefined, earth: ContextPoint | undefined, bareFraction: number | null,
): EnvRow[] {
  const f = (id: string) => factors?.find((x) => x.factor_id === id);
  const e = (id: string) => earth?.layers[id];
  const ice = num(f("water_ice")?.status === "available" ? f("water_ice")!.value : null);
  const perm = num(e("permafrost_probability")?.value);
  const ai = num(e("aridity_index")?.value);
  const kg = e("koppen_geiger_1991_2020");
  const kgText = kg?.value != null ? `${kg.value}${(kg as { class_description?: string }).class_description ? ` · ${(kg as { class_description?: string }).class_description}` : ""}` : (kg?.missing_reason ?? NONE);
  let iceReading: string | null = null, iceTone: EnvRow["tone"] = null;
  if (ice !== null && perm !== null) {
    const marsIce = ice > 0, earthIce = perm >= 0.5;
    iceReading = marsIce === earthIce
      ? (marsIce ? "Both records indicate ground ice" : "Neither record indicates ground ice")
      : (earthIce ? "Earth window is permafrost ground; the Mars record does not indicate shallow ice" : "Mars record indicates shallow ice; the Earth window is not permafrost ground");
    iceTone = marsIce === earthIce ? "holds" : "breaks";
  }
  return [
    { dim: "Ground ice", mars: f("water_ice") ? `${marsText(f("water_ice"))}${ice !== null ? " (SWIM index, −1 to 1)" : ""}` : NONE,
      earth: perm !== null ? `permafrost probability ${perm.toFixed(2)}` : (e("permafrost_probability")?.missing_reason ?? NONE), reading: iceReading, tone: iceTone },
    { dim: "Temperature · climate", mars: marsText(f("surface_temperature")), earth: kgText, reading: "Different quantities: a modelled Mars surface temperature and an Earth climate class", tone: null },
    { dim: "Dryness", mars: "no aridity record for Mars", earth: ai !== null ? `aridity index ${ai < 0.0001 ? "< 0.0001" : ai.toFixed(2)} (P / ET₀)` : (e("aridity_index")?.missing_reason ?? NONE), reading: null, tone: null },
    { dim: "Surface cover", mars: [f("rock_abundance") ? `rock abundance ${marsText(f("rock_abundance"))}` : null, f("thermal_inertia") ? `thermal inertia ${marsText(f("thermal_inertia"))}` : null].filter(Boolean).join(" · ") || NONE,
      earth: bareFraction !== null ? `bare-like ground ${(bareFraction * 100).toFixed(bareFraction > 0.995 ? 1 : 0)} % (WorldCover)` : "no land-cover record for this candidate", reading: null, tone: null },
    { dim: "Geologic unit", mars: marsText(f("geologic_unit")), earth: "no geologic map connected", reading: null, tone: null },
    { dim: "Solar energy", mars: marsText(f("solar_energy")), earth: "no insolation record connected", reading: null, tone: null },
  ];
}
