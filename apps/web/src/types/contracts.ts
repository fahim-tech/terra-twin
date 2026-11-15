/**
 * Runtime-validated API contract (mirrors apps/api/terratwin_api/schemas). Zod validates the
 * fields the UI relies on for scientific honesty; unknown fields pass through untouched.
 */
import { z } from "zod";

const num = z.number().nullable();

export const MeasurementState = z.enum(["measured", "derived", "modelled", "proxy", "unavailable", "insufficient_resolution"]);
export const DecisionType = z.enum(["named_leader", "tied_set", "no_convincing_analog", "insufficient_evidence"]);
export const Representation = z.enum(["mars_observation_space", "as_measured"]);

export const FeatureValue = z.object({
  key: z.string(), label: z.string(), value: num, unit: z.string(), state: MeasurementState,
  source_id: z.string().nullable().optional(), native_resolution_m: num.optional(), baseline_m: num.optional(),
  footprint: z.string().nullable().optional(), method: z.string().nullable().optional(),
  reason: z.string().nullable().optional(), explanation: z.string().nullable().optional(),
}).loose();
export type FeatureValue = z.infer<typeof FeatureValue>;

export const QualityFlag = z.object({ code: z.string(), severity: z.enum(["info", "warning", "critical"]), message: z.string() });
export type QualityFlag = z.infer<typeof QualityFlag>;

export const MarsSite = z.object({
  id: z.string(), name: z.string(), lat: z.number(), lon: z.number(),
  bbox: z.object({ lon_min: z.number(), lon_max: z.number(), lat_min: z.number(), lat_max: z.number() }),
  observed_fraction: num, category: z.string(), source: z.string(),
});
export type MarsSite = z.infer<typeof MarsSite>;

export const MissionProfile = z.object({
  id: z.string(), label: z.string(), description: z.string(), available: z.boolean(),
  research_key: z.string().nullable(), tier1_weights: z.record(z.string(), z.number()).nullable(),
  tier1_weights_source: z.string().nullable(), gate_mode: z.enum(["exclude", "report"]).nullable(),
  weights_status: z.string(), reason_unavailable: z.string().nullable(),
});
export type MissionProfile = z.infer<typeof MissionProfile>;

export const ObservationSupport = z.object({
  observed_fraction: num, observed_fraction_native_50km: num, mean_counts: num, p90_counts: num, max_counts: num,
  n_cells: z.number(), interpolation_dependence: num, source_grid: z.string(), note: z.string(),
});

export const Unavailable = z.object({
  status: z.string(), reason: z.string(), missing_inputs: z.array(z.string()), owner: z.string().nullable(),
});

export const MarsAnalysis = z.object({
  id: z.string(), status: z.enum(["available", "unavailable"]), site: z.string().nullable(),
  site_name: z.string().optional(), coordinate: z.object({ lat: z.number(), lon: z.number() }),
  footprint_km: z.number(), tier1_features: z.array(FeatureValue), ez_features: z.array(FeatureValue),
  unavailable_factors: z.array(FeatureValue), observation_support: ObservationSupport.nullable(),
  quality_flags: z.array(QualityFlag), unavailable: Unavailable.nullable(),
}).loose();
export type MarsAnalysis = z.infer<typeof MarsAnalysis>;

export const Tier1Candidate = z.object({
  region_id: z.string(), planet: z.literal("earth"), lat: z.number(), lon: z.number(),
  footprint: z.object({ kind: z.string(), cell_km_ns: z.number(), cell_km_ew: z.number(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  features: z.record(z.string(), num), baselines_m: z.object({ short: z.number(), long: z.number() }),
  quality_flags: z.array(QualityFlag),
  known_analog: z.object({ status: z.string(), name: z.string().nullable() }),
  novelty_claim: z.string(),
  rank: z.number(), similarity: num, coverage: z.number(), n_features_used: z.number(), verdict: z.string(),
  per_feature: z.record(z.string(), num), representation: Representation,
}).loose();
export type Tier1Candidate = z.infer<typeof Tier1Candidate>;

export const Tier1Result = z.object({
  tier: z.literal(1), method_version: z.string(), site: z.string(), mission: z.string(),
  representation: Representation, weights: z.record(z.string(), z.number()).nullable(), weights_source: z.string().nullable(),
  candidate_pool: z.object({ scope: z.string(), n_cells_searched: z.number(), cell_size_km: z.number(), source: z.string(), lat_range: z.array(z.number()), coverage_note: z.string() }),
  summary: z.object({ leader_similarity: z.number(), n_within_0p05_of_leader: z.number(), n_strong_ge_0p75: z.number(), n_partial_ge_0p55: z.number(), n_insufficient_evidence: z.number() }).loose(),
  total: z.number(), offset: z.number(), limit: z.number(), candidates: z.array(Tier1Candidate), disclaimer: z.string(),
}).loose();
export type Tier1Result = z.infer<typeof Tier1Result>;

export const Tier1ContextRow = z.object({ key: z.string(), unit: z.string(), mars: num, earth: num, s: num });

export const Tier2Candidate = z.object({
  id: z.string(), lat: z.number().nullable(), lon: z.number().nullable(), kind: z.string().optional(), window_km: z.number(),
  S: num, coverage: num, verdict: z.string().optional(),
  features: z.object({ earth_as_measured: z.record(z.string(), num).optional() }).loose().optional(),
  landcover: z.object({ available: z.boolean(), frac_bare_like: num.optional(), frac_vegetated: num.optional(), frac_water: num.optional(), gate: z.string(), reason: z.string().optional() }).loose().optional(),
  as_measured_comparison: z.object({ leader: z.string(), leader_S: num, this_is_leader: z.boolean() }).optional(),
  tier1_context: z.object({ region_id: z.string(), similarity: num, coverage: z.number(), rows: z.array(Tier1ContextRow) }).loose().optional(),
}).loose();
export type Tier2Candidate = z.infer<typeof Tier2Candidate>;

export const Tier2Result = z.object({
  tier: z.literal(2), source: z.string(),
  target: z.object({ site: z.string().nullable(), lat: z.number(), lon: z.number(), window_km: z.number(), observed_fraction_native: num }),
  representation: Representation,
  operator: z.object({ status: z.enum(["ok", "unavailable"]) }).loose(),
  landcover_gate: z.object({ mode: z.enum(["exclude", "report"]), bare_min: z.number(), veg_max: z.number(), status: z.string(), applied: z.string().optional() }).loose().nullable(),
  decision: z.object({ type: DecisionType, members: z.array(z.string()), rotations_checked: z.number(), label: z.string().nullable() }),
  candidates: z.array(Tier2Candidate),
  as_measured_baseline: z.object({ leader: z.string(), S: num, coverage: num, lat: num, lon: num, label: z.string() }).loose().nullable(),
  candidate_pool: z.object({ scope: z.string(), n_windows: z.number(), window_km: z.number(), note: z.string() }).loose().nullable(),
  validation_status: z.string(), disclaimers: z.array(z.string()),
  live_refinement: z.object({ status: z.string(), missing_inputs: z.array(z.string()) }).loose(),
}).loose().superRefine((v, ctx) => {
  // G5 contract: never S without coverage, representation and operator status.
  for (const c of v.candidates) {
    if (c.S !== null && c.S !== undefined && (c.coverage === null || c.coverage === undefined)) {
      ctx.addIssue({ code: "custom", message: `candidate ${c.id} has S without coverage` });
    }
  }
});
export type Tier2Result = z.infer<typeof Tier2Result>;

export const AnalogSearch = z.object({
  id: z.string(), status: z.enum(["available", "unavailable"]), mars: MarsAnalysis.omit({ id: true }).loose(),
  tier1: Tier1Result.nullable(), tier2: Tier2Result,
}).loose();
export type AnalogSearch = z.infer<typeof AnalogSearch>;
