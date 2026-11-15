/**
 * Client for the GIS workstream routes (`/api/gis`, gis-contract-1.0 via the API). Payloads are passed
 * through from the GIS library: zod checks only the fields the UI relies on; everything else stays.
 * A 503 means the GIS library, its data or its worker is not connected on this server (a state, not a
 * transient failure), so those queries are not retried.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useApp, type NRefine } from "../store/app";
import { Relief } from "../types/contracts";
import { API_BASE, ApiError } from "./api";

const num = z.number().nullable();

async function get<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init?.body ? { ...init, headers: { "Content-Type": "application/json" } } : init);
  } catch {
    throw new ApiError("Scientific API is not reachable", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw new ApiError(typeof d === "string" ? d : d?.reason ?? `Request failed (${res.status})`, res.status, d);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("contract violation", path, parsed.error.issues);
    throw new ApiError("API response violated the GIS data contract", res.status, parsed.error.issues);
  }
  return parsed.data;
}

const noRetry503 = (n: number, e: unknown) => !(e instanceof ApiError && (e.status === 503 || e.status === 422 || e.status === 404)) && n < 2;

export const GisDiscoveryStatus = z.object({
  status: z.enum(["available", "unavailable"]), reason: z.string().nullable(), missing_inputs: z.array(z.string()),
  worker: z.object({ alive: z.boolean(), age_s: num.optional() }).loose().optional(),
  active_runs: z.number().optional(), max_active_runs: z.number().optional(),
  n_refine_choices: z.array(z.number()).optional(), window_km: z.number().optional(),
}).loose();
export const GisStatus = z.object({
  status: z.enum(["available", "unavailable"]), reason: z.string().nullable(), missing_inputs: z.array(z.string()),
  contract_version: z.string().nullable(),
  grids: z.record(z.string(), z.object({ available: z.boolean(), product: z.string().optional(), reason: z.string().optional() })),
  discovery: GisDiscoveryStatus,
}).loose();
export type GisStatus = z.infer<typeof GisStatus>;

/** GIS Mars feature record (gis-contract-1.0 §6): 50 km window features, tier-1 200 km record, support metadata. */
export const MarsFeatureRecord = z.object({
  region_id: z.string(), latitude: z.number(), longitude: z.number(), status: z.string(), reasons: z.array(z.string()),
  footprint_km: z.number(), pixel_m: z.number(),
  features: z.record(z.string(), num), units: z.record(z.string(), z.string()),
  feature_state: z.record(z.string(), z.string()).optional(),
  baselines_m: z.record(z.string(), z.union([num, z.array(z.number())])).optional(),
  observation_support: z.object({ available: z.boolean(), observed_fraction_native: num.optional(), reason: z.string().optional() }).loose(),
  operator: z.object({ status: z.enum(["ok", "unavailable"]), reason: z.string().optional() }).loose(),
  quality_flags: z.array(z.string()), notes: z.array(z.string()),
  tier1: z.object({ footprint_km: z.number(), cell_km: z.number(), n_cells: z.number().optional(), features: z.record(z.string(), num) }).loose().nullable().optional(),
}).loose();
export type MarsFeatureRecord = z.infer<typeof MarsFeatureRecord>;

export const GisTier1Candidate = z.object({
  rank: z.number(), region_id: z.string(), latitude: z.number(), longitude: z.number(), similarity: num, coverage: num.optional(),
  verdict: z.string().optional(), glo90_refinement_eligible: z.boolean().optional(), quality_flags: z.array(z.string()).optional(),
  features: z.record(z.string(), num).optional(),
}).loose();
export const GisTier1Search = z.object({
  status: z.string(), mission: z.string().optional(), footprint_km: z.number().optional(), n_cells_scored: z.number().optional(),
  candidate_pool_scope: z.string().optional(), weights: z.string().optional(),
  specificity: z.object({ leader_similarity: num, n_within_0p05_of_leader: z.number() }).loose().optional(),
  candidates: z.array(GisTier1Candidate), disclaimers: z.array(z.string()).optional(), reasons: z.array(z.string()).optional(),
}).loose();
export type GisTier1Search = z.infer<typeof GisTier1Search>;

export const DiscoveryProgress = z.object({
  stage: z.string(), stage_label: z.string(), cells_scored: num, windows_ready: num, windows_target: num, last_line: z.string().optional(),
}).loose();
export const DiscoveryJob = z.object({
  job_id: z.string().nullable(), status: z.enum(["pending", "running", "paused", "blocked", "done", "failed"]),
  state_label: z.string(), run_id: z.string().nullable(), cached: z.boolean(),
  params: z.object({ lat: z.number(), lon: z.number(), mission: z.string(), n_refine: z.number(), window_km: z.number(), name: z.string().nullable().optional() }).loose(),
  submitted: z.string().nullable().optional(), started: z.string().nullable().optional(), finished: z.string().nullable().optional(),
  elapsed_s: num.optional(), queue_position: num.optional(), progress: DiscoveryProgress.nullable().optional(),
  error: z.object({ type: z.string().nullable(), message: z.string().nullable() }).nullable().optional(),
  run_available: z.boolean().optional(),
}).loose();
export type DiscoveryJob = z.infer<typeof DiscoveryJob>;

/** One refined Earth window of a discovery run (G5 candidate + scope fields). */
export const DiscoveryCandidate = z.object({
  id: z.string(), lat: z.number(), lon: z.number(), origin: z.string().optional(), rank: num.optional(),
  S: num, S_by_rotation: z.array(num).optional(), S_range_over_rotations: z.array(num).nullable().optional(),
  coverage: num, verdict: z.string().optional(), eligible: z.boolean().optional(),
  landcover: z.object({ gate: z.string().optional(), frac_bare_like: num.optional(), frac_vegetated: num.optional(), reason: z.string().optional() }).loose().optional(),
  features: z.object({ mars: z.record(z.string(), num).optional(), earth_as_mola_would_see: z.record(z.string(), num).optional(), earth_as_measured: z.record(z.string(), num).optional() }).loose().optional(),
  as_measured_comparison: z.object({ S: num.optional(), rank: num.optional() }).loose().optional(),
  tier1_rank: num.optional(), tier1_similarity: num.optional(),
}).loose();
export type DiscoveryCandidate = z.infer<typeof DiscoveryCandidate>;
export const DiscoveryRun = z.object({
  run_id: z.string(), status: z.string(), seconds: num.optional(),
  mars: z.object({ region_id: z.string(), latitude: z.number(), longitude: z.number() }).loose().optional(),
  refinement: z.object({
    target: z.object({ site: z.string().nullable().optional(), lat: z.number(), lon: z.number(), window_km: z.number() }).loose(),
    representation: z.string(), mission: z.string(), window_km: z.number(),
    operator: z.object({ status: z.enum(["ok", "unavailable"]) }).loose(),
    landcover_gate: z.object({ mode: z.string() }).loose().nullable().optional(),
    decision: z.object({ type: z.enum(["named_leader", "tied_set", "no_convincing_analog", "insufficient_evidence"]), members: z.array(z.string()) }).loose(),
    candidates: z.array(DiscoveryCandidate), excluded: z.array(z.unknown()).optional(),
    number_of_windows_refined: z.number(), candidate_pool_scope: z.string(),
    shortlist_selection: z.record(z.string(), z.unknown()).optional(), coarse_index_coverage: z.record(z.string(), z.unknown()).optional(),
    source_quality: z.record(z.string(), z.unknown()).optional(),
    disclaimers: z.array(z.string()), limitations: z.array(z.string()).optional(), ui_strings: z.record(z.string(), z.unknown()).optional(),
  }).loose().optional(),
  reasons: z.array(z.string()).optional(),
}).loose();
export type DiscoveryRun = z.infer<typeof DiscoveryRun>;
export const DiscoveryRunSummary = z.object({
  run_id: z.string(), status: z.string().nullable(),
  target: z.object({ site: z.string().nullable(), lat: num, lon: num }), mission: z.string().nullable(),
  decision: z.object({ type: z.string().nullable(), members: z.array(z.string()) }), number_of_windows_refined: num,
  n_refine: num, seconds: num, finished: z.string().nullable(),
}).loose();

export const GridLayer = z.object({
  name: z.string(), label: z.string(), group: z.enum(["terrain", "support", "surface"]), kind: z.enum(["continuous", "categorical"]),
  units: z.string().nullable(),
  stretch: z.object({ min: z.number(), max: z.number(), basis: z.string() }).optional(),
  palette: z.object({ name: z.string(), stops: z.array(z.tuple([z.number(), z.string()])) }).optional(),
  classes: z.array(z.object({ value: z.number(), label: z.string(), color: z.string() })).optional(),
}).loose();
export type GridLayer = z.infer<typeof GridLayer>;
export const GridInfo = z.object({
  planet: z.enum(["mars", "earth"]), product: z.string(), layers: z.array(GridLayer), max_level: z.number(), tile_size: z.number(),
  tile_url: z.string(), version: z.string(), flags: z.record(z.string(), z.string()).nullable(), use_rules: z.array(z.string()).nullable(),
}).loose();
export type GridInfo = z.infer<typeof GridInfo>;
export const GridPoint = z.object({
  planet: z.string(), cell: z.object({ lat: z.number(), lon: z.number() }).loose(),
  values: z.record(z.string(), z.union([num, z.string()])), units: z.record(z.string(), z.string()),
  flags_set: z.array(z.string()), use_rules: z.array(z.string()), surface_class_label: z.string().nullable().optional(),
}).loose();
export type GridPoint = z.infer<typeof GridPoint>;
export const ContextLayerValue = z.object({
  layer: z.string(), source_id: z.string(), value: z.union([num, z.string()]), units: z.string(), feature_state: z.string(),
  missing_reason: z.string().nullable(), native_resolution: z.string().nullable(), comparability: z.string().nullable(),
}).loose();
export const ContextPoint = z.object({ planet: z.string(), layers: z.record(z.string(), ContextLayerValue), rules: z.array(z.string()).optional() }).loose();
export type ContextPoint = z.infer<typeof ContextPoint>;

const q = (lat: number, lon: number) => `lat=${lat}&lon=${lon}`;

export const gisApi = {
  status: () => get("/api/gis/status", GisStatus),
  marsFeatures: (lat: number, lon: number) => get(`/api/gis/mars/features?${q(lat, lon)}`, MarsFeatureRecord),
  /** app mission id (e.g. "landing_site"); the API maps it to the GIS mission. */
  tier1: (lat: number, lon: number, mission: string, topN = 50) => get(`/api/gis/tier1?${q(lat, lon)}&mission=${encodeURIComponent(mission)}&top_n=${topN}`, GisTier1Search),
  submitDiscovery: (b: { lat: number; lon: number; mission: string; n_refine?: NRefine; include_research_pool?: boolean; site?: string | null }) =>
    get("/api/gis/discovery", DiscoveryJob, { method: "POST", body: JSON.stringify(b) }),
  job: (id: string) => get(`/api/gis/jobs/${encodeURIComponent(id)}`, DiscoveryJob),
  runs: () => get("/api/gis/runs", z.object({ runs: z.array(DiscoveryRunSummary) })).then((r) => r.runs),
  run: (id: string) => get(`/api/gis/runs/${encodeURIComponent(id)}`, DiscoveryRun),
  gridInfo: (planet: "mars" | "earth") => get(`/api/gis/grid/${planet}/info`, GridInfo),
  gridPoint: (planet: "mars" | "earth", lat: number, lon: number) => get(`/api/gis/grid/${planet}/point?${q(lat, lon)}`, GridPoint),
  contextPoint: (planet: "mars" | "earth", lat: number, lon: number) => get(`/api/gis/context/${planet}/point?${q(lat, lon)}`, ContextPoint),
  /**
   * Elevation grid of a refined discovery window (Earth as measured: the run's Copernicus GLO-90 window), in the
   * research pool's Relief shape. 404 when the server holds no cached window at that centre.
   */
  windowRelief: (lat: number, lon: number) => get(`/api/gis/windows/relief?${q(lat, lon)}`, Relief),
  /** Absolute tile URL template for a Cesium UrlTemplateImageryProvider ({z}/{x}/{y} kept). */
  tileUrl: (info: GridInfo, layer: string) => `${API_BASE}${info.tile_url.replace("{layer}", encodeURIComponent(layer))}`,
};

const base = { retry: noRetry503, staleTime: 5 * 60_000 };
export const useGisStatus = () => useQuery({ queryKey: ["gis", "status"], queryFn: gisApi.status, ...base, staleTime: 30_000 });
export const useMarsFeatures = (p: { lat: number; lon: number } | null) =>
  useQuery({ queryKey: ["gis", "mars", p?.lat, p?.lon], queryFn: () => gisApi.marsFeatures(p!.lat, p!.lon), enabled: !!p, ...base });
export const useGisTier1 = (p: { lat: number; lon: number; mission: string } | null, topN = 50) =>
  useQuery({ queryKey: ["gis", "tier1", p?.lat, p?.lon, p?.mission, topN], queryFn: () => gisApi.tier1(p!.lat, p!.lon, p!.mission, topN), enabled: !!p, ...base });
/**
 * Submits a discovery. When the caller does not say, the research-pool choice is read from the store, so every
 * submit path sends the parameter set the Discovery action shows (the published runs also refine the pool).
 */
export const useSubmitDiscovery = () => useMutation({
  mutationFn: (b: Parameters<typeof gisApi.submitDiscovery>[0]) =>
    gisApi.submitDiscovery({ ...b, include_research_pool: b.include_research_pool ?? useApp.getState().discoveryPool }),
});
/** Polls every 4 s while the job is queued or running; stops when done or failed. */
export const useDiscoveryJob = (id: string | null) =>
  useQuery({
    queryKey: ["gis", "job", id], queryFn: () => gisApi.job(id!), enabled: !!id, retry: noRetry503,
    refetchInterval: (query) => { const s = query.state.data?.status; return s === "done" || s === "failed" ? false : 4000; },
  });
export const useDiscoveryRuns = () => useQuery({ queryKey: ["gis", "runs"], queryFn: gisApi.runs, ...base, staleTime: 30_000 });
export const useDiscoveryRun = (id: string | null) =>
  useQuery({ queryKey: ["gis", "run", id], queryFn: () => gisApi.run(id!), enabled: !!id, ...base, staleTime: Infinity });
export const useGridInfo = (planet: "mars" | "earth", enabled = true) =>
  useQuery({ queryKey: ["gis", "grid", planet], queryFn: () => gisApi.gridInfo(planet), enabled, ...base, staleTime: Infinity });
export const useGridPoint = (planet: "mars" | "earth", p: { lat: number; lon: number } | null) =>
  useQuery({ queryKey: ["gis", "gridPoint", planet, p?.lat, p?.lon], queryFn: () => gisApi.gridPoint(planet, p!.lat, p!.lon), enabled: !!p, ...base });
/**
 * Relief-cache id of a discovery window. The relief views key grids by id (["relief", id]); a discovery window
 * gets its own namespace, so it never collides with a research-pool window name.
 */
export const windowReliefId = (lat: number, lon: number) => `gis-window:${lat.toFixed(4)},${lon.toFixed(4)}`;
/** The grid of a refined discovery window; a 404 (not cached on this server) is a state and is not retried. */
export const useWindowRelief = (p: { lat: number; lon: number } | null) =>
  useQuery<Relief, Error>({
    queryKey: ["relief", p ? windowReliefId(p.lat, p.lon) : null], queryFn: () => gisApi.windowRelief(p!.lat, p!.lon), enabled: !!p,
    retry: noRetry503, retryOnMount: false, staleTime: Infinity,
  });
export const useContextPoint =(planet: "mars" | "earth", p: { lat: number; lon: number } | null) =>
  useQuery({ queryKey: ["gis", "context", planet, p?.lat, p?.lon], queryFn: () => gisApi.contextPoint(planet, p!.lat, p!.lon), enabled: !!p, ...base });
