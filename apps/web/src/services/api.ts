import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AnalogSearch, MarsAnalysis, MarsSite, MissionProfile, Tier1Result } from "../types/contracts";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, schema: z.ZodType<T> | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError("Scientific API is not reachable", 0);
  }
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
  tier1Page: (site: string, mission: string, offset: number, limit: number) =>
    request(`/api/analysis/tier1/candidates?site=${encodeURIComponent(site)}&mission=${mission}&offset=${offset}&limit=${limit}`, Tier1Result),
};

export interface DatasetsResponse {
  datasets: { id: string; title: string; planet: string; role: string; status: string; native_resolution?: string | null; coverage?: string | null; url?: string | null; notes?: string | null; owner?: string | null }[];
  research_import: { package: string; package_sha256: string; imported_at: string; n_files: number } | null;
  integrity_checks: { name: string; ok: boolean; detail: string }[];
  live_refinement: { status: string; missing_inputs: string[] };
}

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: api.health, retry: 0, staleTime: 30_000 });
export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: api.sites });
export const useEarthSites = () => useQuery({ queryKey: ["earthSites"], queryFn: api.earthSites });
export const useMissions = () => useQuery({ queryKey: ["missions"], queryFn: api.missions });
export const useDatasets = () => useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
export const useEvidence = () => useQuery({ queryKey: ["evidence"], queryFn: api.evidence });

export const useMarsAnalysis = (p: { lat: number; lon: number; footprint_km: number; mission: string } | null) =>
  useQuery({ queryKey: ["mars", p], queryFn: () => api.analyseMars(p!), enabled: !!p });

export const useFindAnalogs = () => useMutation({ mutationFn: api.findAnalogs });
