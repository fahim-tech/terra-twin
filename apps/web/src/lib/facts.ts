import { useMemo } from "react";
import { useDatasets, useEarthPool, useEvidence, useMissions, useSites, type DatasetsResponse } from "../services/api";
import { useApp } from "../store/app";
import type { AnalogSearch } from "../types/contracts";
import { type GlossaryFacts, numberIn } from "./glossary";

type Dataset = DatasetsResponse["datasets"][number];

/**
 * Read the research counts and grid facts from the payloads that state them. The current search wins where
 * it carries the same fact (its own pool and gate); a fact no payload states stays null.
 */
export function factsFrom(p: {
  datasets?: Dataset[] | null;
  zones?: number | null;
  windows?: number | null;
  tier1Weights?: Record<string, number> | null;
  t2Features?: unknown[] | null;
  search?: AnalogSearch | null;
}): GlossaryFacts {
  const ds = (id: string) => p.datasets?.find((d) => d.id === id);
  const screen = ds("earth_global_screen");
  const pool = ds("earth_pool_463m");
  const cover = ds("worldcover_2021");
  const t2 = p.search && p.search.status === "available" ? p.search.tier2 : null;
  const gate = t2?.landcover_gate ?? null;
  const searchWeights = p.search?.tier1?.weights ?? null;
  const weights = searchWeights ?? p.tier1Weights ?? null;
  return {
    zones: p.zones ?? null,
    cells: numberIn(screen?.coverage, /([\d,]+)\s+land cells/),
    cellKm: numberIn(screen?.native_resolution, /(\d+(?:\.\d+)?)\s*km cells/),
    t1Descriptors: weights ? Object.keys(weights).length : null,
    windows: t2?.candidate_pool?.n_windows ?? p.windows ?? null,
    windowKm: t2?.candidate_pool?.window_km ?? numberIn(pool?.native_resolution, /\((\d+(?:\.\d+)?)\s*km\)/),
    gridM: numberIn(ds("mars_ez_tier1")?.native_resolution, /(\d+(?:\.\d+)?)\s*m MOLA/),
    t2Descriptors: p.t2Features ? p.t2Features.length : null,
    bareMin: gate?.bare_min ?? numberIn(cover?.notes, /bare-like\s*≥\s*(\d*\.?\d+)/),
    vegMax: gate?.veg_max ?? numberIn(cover?.notes, /vegetated\s*≤\s*(\d*\.?\d+)/),
    megdrPpd: numberIn(ds("mars_ez_support")?.title, /(\d+)\s*ppd/),
  };
}

/** The glossary facts from the cached payloads (each query is shared app-wide, so this costs no extra request). */
export function useGlossaryFacts(): GlossaryFacts {
  const datasets = useDatasets();
  const sites = useSites();
  const pool = useEarthPool();
  const missions = useMissions();
  const evidence = useEvidence();
  const search = useApp((s) => s.search);
  return useMemo(() => factsFrom({
    datasets: datasets.data?.datasets,
    zones: sites.data ? sites.data.length : null,
    windows: pool.data ? pool.data.length : null,
    tier1Weights: missions.data?.find((m) => m.id === (search?.request as { mission?: string } | undefined)?.mission)?.tier1_weights
      ?? missions.data?.find((m) => m.tier1_weights)?.tier1_weights ?? null,
    t2Features: Array.isArray(evidence.data?.method?.features) ? evidence.data.method.features : null,
    search,
  }), [datasets.data, sites.data, pool.data, missions.data, evidence.data, search]);
}
