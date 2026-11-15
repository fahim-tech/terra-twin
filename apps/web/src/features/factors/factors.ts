/**
 * Additional Mars scientific layers (`GET /api/gis/mars/factors`, contract mars-factors-1.0; records from the GIS
 * library passed through). Mars characterization only: never similarity, ranking or mission suitability.
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { API_BASE, ApiError } from "../../services/api";

export const FACTOR_STATUS = ["available", "unavailable", "outside_coverage", "not_integrated", "unsupported_resolution", "error"] as const;
export type FactorStatus = (typeof FACTOR_STATUS)[number];

export const FactorRecord = z.object({
  factor_id: z.string(), label: z.string(), status: z.enum(FACTOR_STATUS),
  value: z.union([z.number(), z.string()]).nullable(), unit: z.string().nullable().optional(),
  state: z.string().nullable().optional(), measurement_kind: z.string().nullable().optional(),
  source_id: z.string().nullable().optional(), source_url: z.string().nullable().optional(),
  product_version: z.string().nullable().optional(), citation: z.string().nullable().optional(),
  native_resolution: z.string().nullable().optional(), coverage: z.string().nullable().optional(),
  temporal_context: z.record(z.string(), z.unknown()).nullable().optional(),
  method: z.string().nullable().optional(), reason: z.string().nullable().optional(), explanation: z.string().nullable().optional(),
  limitations: z.array(z.string()).optional(), quality_flags: z.array(z.string()).optional(),
}).loose();
export type FactorRecord = z.infer<typeof FactorRecord>;
export const MarsContext = z.object({
  contract_version: z.string(), factors: z.array(FactorRecord), rules: z.array(z.string()),
  provider: z.string().nullable().optional(),
}).loose();
export type MarsContext = z.infer<typeof MarsContext>;

export async function fetchFactors(lat: number, lon: number): Promise<MarsContext> {
  let res: Response;
  try { res = await fetch(`${API_BASE}/api/gis/mars/factors?lat=${lat}&lon=${lon}`); } catch { throw new ApiError("Scientific API is not reachable", 0); }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.detail?.reason ?? `Request failed (${res.status})`, res.status, body?.detail);
  const parsed = MarsContext.safeParse(body);
  if (!parsed.success) throw new ApiError("API response violated the factor contract", res.status, parsed.error.issues);
  return parsed.data;
}

export const useMarsFactors = (p: { lat: number; lon: number } | null) =>
  useQuery({ queryKey: ["gis", "factors", p?.lat, p?.lon], queryFn: () => fetchFactors(p!.lat, p!.lon), enabled: !!p, staleTime: 10 * 60_000, retry: 1 });

/** Words for a status; never a value for anything but "available". */
export const STATUS_WORDS: Record<FactorStatus, string> = {
  available: "Available", unavailable: "Unavailable", outside_coverage: "Outside coverage",
  not_integrated: "Not integrated", unsupported_resolution: "Resolution not supported", error: "Error",
};

/** Value text with units, or null when the factor has no value (callers show the status and reason instead). */
export function factorValue(f: FactorRecord): string | null {
  if (f.status !== "available" || f.value === null || f.value === undefined) return null;
  const v = typeof f.value === "number"
    ? f.value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(f.value) >= 100 ? 0 : Math.abs(f.value) >= 10 ? 1 : 3 })
    : f.value;
  const u = f.unit && f.unit !== "class" ? ` ${f.unit}` : "";
  return `${v}${u}`;
}

/** One-line temporal context from the record (season / local time / period), when it states one. */
export function temporalText(f: FactorRecord): string | null {
  const t = f.temporal_context as Record<string, unknown> | null | undefined;
  if (!t) return null;
  const parts: string[] = [];
  if (typeof t.season_ls === "number") parts.push(`Ls ${t.season_ls}°`);
  if (typeof t.local_time_ltst_h === "number") parts.push(`${t.local_time_ltst_h} h LTST`);
  if (typeof t.statistic === "string") parts.push(t.statistic);
  return parts.length ? parts.join(" · ") : typeof t.period === "string" ? t.period : null;
}

const SHORT: Record<string, string> = {
  thermal_inertia: "Thermal inertia", geologic_unit: "Geology", rock_abundance: "Rocks",
  surface_temperature: "Surface temp.", water_ice: "Water-ice index", solar_energy: "Solar",
};
/** Compact label for a factor (falls back to the record's own label). */
export const factorShortLabel = (f: FactorRecord) => SHORT[f.factor_id] ?? f.label;

/** Units in the compact form used beside figures. */
export function compactUnit(u: string | null | undefined): string {
  if (!u || u === "class") return "";
  if (u.startsWith("consistency index")) return "";
  return u.replace("J m-2 K-1 s-1/2", "J m⁻² K⁻¹ s⁻½").replace("W m-2", "W m⁻²");
}
