import type { AnalogSearch, Tier1Candidate, Tier2Candidate } from "../../types/contracts";

/** A flattened, display-ready candidate from either tier. */
export interface CandidateView {
  id: string;
  tier: 1 | 2;
  lat: number;
  lon: number;
  label: string;
  rank?: number;
  score: number | null;
  coverage: number | null;
  bbox?: [number, number, number, number];
  t1?: Tier1Candidate;
  t2?: Tier2Candidate;
}

export function prettyWindow(id: string) {
  const m = /^rand_d(\d)_(\d+)$/.exec(id);
  return m ? `Window ${m[2]} · roughness decile ${m[1]}` : id;
}

export function cellLabel(c: Tier1Candidate) {
  return c.known_analog.name ? `Cell near ${c.known_analog.name}` : `Cell ${c.region_id.split(":")[1]}`;
}

export function candidateList(search: AnalogSearch | null): CandidateView[] {
  if (!search) return [];
  const out: CandidateView[] = [];
  for (const c of search.tier2?.candidates ?? []) {
    if (c.lat === null || c.lon === null) continue;
    out.push({ id: `t2:${c.id}`, tier: 2, lat: c.lat, lon: c.lon, label: prettyWindow(c.id), score: c.S, coverage: c.coverage, t2: c });
  }
  for (const c of search.tier1?.candidates ?? []) {
    out.push({ id: `t1:${c.region_id}`, tier: 1, lat: c.lat, lon: c.lon, label: cellLabel(c), rank: c.rank, score: c.similarity, coverage: c.coverage, bbox: c.footprint.bbox, t1: c });
  }
  return out;
}

export function selectedCandidate(search: AnalogSearch | null, id: string | null): CandidateView | null {
  if (!id) return null;
  const norm = id.startsWith("t1:") || id.startsWith("t2:") ? id : null;
  return candidateList(search).find((c) => c.id === (norm ?? `t2:${id}`) || c.id === `t1:${id}`) ?? null;
}
