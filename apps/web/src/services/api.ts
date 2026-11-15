import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { create } from "zustand";
import { AnalogSearch, MarsAnalysis, MarsSite, MissionProfile, PoolWindow, Relief, ResearchSiteSummary, Tier1Result, VisualizationLegend } from "../types/contracts";

/**
 * API origin. VITE_API_BASE_URL wins when set (an empty value means the page's own origin). Otherwise the
 * dev server talks to the local API, and a production build uses its own origin: on Vercel, /api and /v1
 * are forwarded to the API server (apps/web/vercel.json).
 */
const CONFIGURED_API = import.meta.env.VITE_API_BASE_URL;
export const API_BASE = (CONFIGURED_API ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");

/**
 * When the API last answered any request (any HTTP status: a 404 or 422 still proves it is reachable). The
 * health banner uses it so that one failed health poll never reports a working API as unreachable.
 */
export const useApiPulse = create<{ okAt: number | null; beat: () => void }>((set) => ({
  okAt: null,
  beat: () => set({ okAt: Date.now() }),
}));
/** How long an answer from any API request counts as proof the API is reachable. */
export const API_PULSE_MS = 90_000;

/** Reachability: "ok" when health answers or any API call answered recently, "down" only when both fail. */
export function apiReachability(h: { isError: boolean; isSuccess: boolean }, okAt: number | null, now: number): "ok" | "down" | "checking" {
  if (h.isSuccess && !h.isError) return "ok";
  if (okAt !== null && now - okAt < API_PULSE_MS) return "ok";
  return h.isError ? "down" : "checking";
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, schema: z.ZodType<T> | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init?.body ? { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } } : init);
  } catch {
    throw new ApiError("Scientific API is not reachable", 0);
  }
  if (res.status < 502) useApiPulse.getState().beat();
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    const msg = typeof d === "string" ? d : d?.reason ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, d);
  }
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("contract violation", path, parsed.error.issues);
    throw new ApiError("API response violated the scientific data contract", res.status, parsed.error.issues);
  }
  return parsed.data;
}

export const api = {
  health: () => request<{ status: string; versions: Record<string, string>; research_data: boolean }>("/api/health", null),
  sites: () => request("/api/mars/sites", z.object({ sites: z.array(MarsSite) })).then((r) => r.sites),
  earthSites: () => request<{ sites: { id: string; name: string; lat: number; lon: number; kind: string; category: string; landcover_gate_pass: boolean | null }[] }>("/api/earth/sites", null).then((r) => r.sites),
  missions: () => request("/api/mission-profiles", z.object({ missions: z.array(MissionProfile) })).then((r) => r.missions),
  datasets: () => request<DatasetsResponse>("/api/datasets", null),
  evidence: () => request<Record<string, any>>("/api/evidence", null),
  analyseMars: (b: { lat: number; lon: number; footprint_km: number; mission: string }) =>
    request("/api/analysis/mars", MarsAnalysis, { method: "POST", body: JSON.stringify(b) }),
  findAnalogs: (b: { lat: number; lon: number; footprint_km: number; mission: string; limit?: number }) =>
    request("/api/analysis/analogs", AnalogSearch, { method: "POST", body: JSON.stringify({ limit: 100, ...b }) }),
  researchSummary: () => request("/api/research/summary", z.object({ sites: z.array(ResearchSiteSummary) })).then((r) => r.sites),
  earthPool: () => request("/api/earth/pool", z.object({ windows: z.array(PoolWindow) })).then((r) => r.windows),
  legend: () => request("/api/visualization/legend", VisualizationLegend),
  similarityRasterUrl: (site: string, mission: string) =>
    `${API_BASE}/api/visualization/tier1-similarity.png?site=${encodeURIComponent(site)}&mission=${encodeURIComponent(mission)}`,
  coverageRasterUrl: () => `${API_BASE}/api/visualization/tier1-coverage.png`,
  tier1Page: (site: string, mission: string, offset: number, limit: number) =>
    request(`/api/analysis/tier1/candidates?site=${encodeURIComponent(site)}&mission=${mission}&offset=${offset}&limit=${limit}`, Tier1Result),
  /** Elevation grid of one 50 km research-pool window (Earth as measured). Ids may contain spaces and "#". */
  relief: (id: string) => request(`/api/earth/pool/${encodeURIComponent(id)}/relief`, Relief),
  /** Mars elevation grid for an Exploration Zone: 503 "MOLA mosaic not connected" until the GIS workstream connects it. */
  marsRelief: (site: string) => request(`/api/mars/relief?site=${encodeURIComponent(site)}`, Relief),
};

export interface DatasetsResponse {
  datasets: { id: string; title: string; planet: string; role: string; status: string; native_resolution?: string | null; coverage?: string | null; url?: string | null; notes?: string | null; owner?: string | null }[];
  research_import: { package: string; package_sha256: string; imported_at: string; n_files: number } | null;
  integrity_checks: { name: string; ok: boolean; detail: string }[];
  live_refinement: { status: string; missing_inputs: string[] };
}

/** Health poll: retried with backoff, re-checked every minute, so a transient failure recovers on its own. */
export const useHealth = () => useQuery({
  queryKey: ["health"], queryFn: api.health, staleTime: 30_000, refetchInterval: 60_000,
  retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
});

/** The API's reachability for banners and status lines (see apiReachability). Re-evaluates every 15 s. */
export function useApiReachable(): { state: "ok" | "down" | "checking"; retry: () => void } {
  const health = useHealth();
  const okAt = useApiPulse((s) => s.okAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return { state: apiReachability(health, okAt, Math.max(now, okAt ?? 0)), retry: () => { void health.refetch(); } };
}
export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: api.sites });
export const useEarthSites = () => useQuery({ queryKey: ["earthSites"], queryFn: api.earthSites });
export const useMissions = () => useQuery({ queryKey: ["missions"], queryFn: api.missions });
export const useDatasets = () => useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
export const useEvidence = () => useQuery({ queryKey: ["evidence"], queryFn: api.evidence });

export const useMarsAnalysis = (p: { lat: number; lon: number; footprint_km: number; mission: string } | null) =>
  useQuery({
    queryKey: ["mars", p], queryFn: () => api.analyseMars(p!), enabled: !!p,
    // Keep showing the previous result only while the same point is re-queried (footprint or mission
    // change); a different point must never borrow another location's measurements.
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey[1] as { lat: number; lon: number } | null | undefined;
      return k && p && k.lat === p.lat && k.lon === p.lon ? keepPreviousData(prev) : undefined;
    },
  });

export const useResearchSummary = () => useQuery({ queryKey: ["researchSummary"], queryFn: api.researchSummary });
export const useEarthPool = () => useQuery({ queryKey: ["earthPool"], queryFn: api.earthPool });
export const useLegend = () => useQuery({ queryKey: ["legend"], queryFn: api.legend });

export const useFindAnalogs = () => useMutation({ mutationFn: api.findAnalogs });

export const useRelief = (id: string | null | undefined) =>
  useQuery({ queryKey: ["relief", id], queryFn: () => api.relief(id!), enabled: !!id });
/** A 503 here is a state (the mosaic is not connected), not a transient failure, so it is never retried. */
export const useMarsRelief = (site: string | null | undefined) =>
  useQuery({ queryKey: ["marsRelief", site], queryFn: () => api.marsRelief(site!), enabled: !!site, retry: false, retryOnMount: false, staleTime: 10 * 60_000 });
