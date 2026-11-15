import { describe, expect, it } from "vitest";
import { G5 } from "../../lib/glossary";
import { clock, marsTime } from "../../lib/instruments";
import type { AnalogSearch } from "../../types/contracts";
import { candidateList, T1_MEASURES, T2_MEASURES } from "../analogs/candidates";
import { DIMENSIONS } from "../comparison/RelevanceMode";
import {
  buildCsv, buildReportJson, candidateRole, CSV_COLUMNS, decisionHeadline, decisionLabel, decisionMemberRows, decisionMembers, dimensions, dossierSections,
  footprintRobustness, generatedStamp, limitations, provenanceSummary, resolveCandidate, terrainRows,
} from "./model";

const t1cand = {
  region_id: "gmted25k:207754", planet: "earth", lat: 52.787, lon: -124.883,
  footprint: { kind: "approx_cell", cell_km_ns: 25.07, cell_km_ew: 24.74, bbox: [-125.07, 52.67, -124.7, 52.9] },
  features: { mean_slope_deg: 2.66, hurst_2pt: 0.645 }, baselines_m: { short: 1857, long: 7427 }, quality_flags: [],
  known_analog: { status: "not_in_reference_set", name: null }, novelty_claim: "not_assessed",
  rank: 1, similarity: 0.909, coverage: 1, n_features_used: 7, verdict: "strong", per_feature: { mean_slope_deg: 0.96, hurst_2pt: 0.96 }, representation: "as_measured",
};

function makeSearch(decision: "named_leader" | "tied_set" | "insufficient_evidence"): AnalogSearch {
  const tie = decision === "tied_set";
  const members = decision === "named_leader" ? ["Atacama Yungay"] : tie ? ["rand_d8_233", "rand_d8_217", "rand_d8_224"] : [];
  const candidates = decision === "named_leader"
    ? [{ id: "Atacama Yungay", lat: -24.09, lon: -69.99, window_km: 50, S: 0.614, coverage: 1, tier1_context: { region_id: "gmted25k:153073", similarity: 0.529, coverage: 1, rows: [{ key: "mean_slope_deg", unit: "deg", mars: 2.69, earth: 3.57, s: 0.34 }, { key: "slope_p90_deg", unit: "deg", mars: 6.0, earth: 6.1, s: 0.95 }] } }]
    : tie ? [{ id: "rand_d8_233", lat: 1, lon: 2, window_km: 50, S: 0.718, coverage: 1 }, { id: "rand_d8_217", lat: 3, lon: 4, window_km: 50, S: 0.703, coverage: 1 }, { id: "rand_d8_224", lat: 5, lon: 6, window_km: 50, S: 0.646, coverage: 1 }] : [];
  return {
    id: "abc", status: "available",
    request: { lat: 17.6756, lon: 77.0127, mission: tie ? "terrain_geometry_only" : "landing_site", footprint_km: 25 },
    mars: { status: "available", site: "Jezero", site_name: "Jezero", coordinate: { lat: 17.6756, lon: 77.0127 }, footprint_km: 25,
      tier1_features: [{ key: "mean_slope_deg", label: "Mean slope", value: 2.69, unit: "deg", state: "derived" }, { key: "hurst_2pt", label: "Hurst", value: 0.642, unit: "-", state: "derived" }],
      ez_features: [], unavailable_factors: [], observation_support: null, quality_flags: [], unavailable: null },
    tier1: decision === "insufficient_evidence" ? null : {
      tier: 1, method_version: "m", site: "Jezero", mission: "landing_site", representation: "as_measured", weights: null, weights_source: null,
      candidate_pool: { scope: "g", n_cells_searched: 249165, cell_size_km: 25, source: "GMTED2010", lat_range: [-89, 83], coverage_note: "note" },
      summary: { leader_similarity: 0.909, n_within_0p05_of_leader: 11, n_strong_ge_0p75: 1, n_partial_ge_0p55: 1, n_insufficient_evidence: 0 },
      total: 249165, offset: 0, limit: 50, candidates: [t1cand], disclaimer: "d",
    },
    tier2: {
      tier: 2, source: "research_record", target: { site: "Jezero", lat: 17.6756, lon: 77.0127, window_km: 50, observed_fraction_native: 0.3 },
      representation: "mars_observation_space", operator: { status: decision === "insufficient_evidence" ? "unavailable" : "ok" },
      landcover_gate: tie ? { mode: "report", bare_min: 0.5, veg_max: 0.2, status: "hypothesis" } : { mode: "exclude", bare_min: 0.5, veg_max: 0.2, status: "hypothesis" },
      decision: { type: decision, members, rotations_checked: 4, label: decision === "insufficient_evidence" ? "Operator unavailable. No comparison is made." : null },
      candidates, as_measured_baseline: null, candidate_pool: { scope: "fixed", n_windows: 230, window_km: 50, note: "Stratified research sample." },
      validation_status: "synthetic_twins_only",
      disclaimers: ["terrain_only", "synthetic_validation_only", "footprint_dependent", "no_gravity_atmosphere_radiation", "fixed_230_window_research_pool"],
      live_refinement: { status: "unavailable", missing_inputs: [] },
    },
  } as unknown as AnalogSearch;
}

describe("report model", () => {
  it("resolves tier-prefixed candidates and labels the role", () => {
    const s = makeSearch("named_leader");
    const c = resolveCandidate(s, "t2:Atacama Yungay")!;
    expect(c).toMatchObject({ tier: 2, label: "Atacama Yungay", score: 0.614, measures: { used: 8, of: 8 } });
    expect(candidateRole(s, c)).toBe("stable_leader");
    const cell = resolveCandidate(s, "t1:gmted25k:207754")!;
    expect(cell).toMatchObject({ tier: 1, measures: { used: 7, of: 7 } });
    expect(candidateRole(s, cell)).toBe("screening_cell");
    expect(resolveCandidate(s, "t2:nope")).toBeNull();
    expect(resolveCandidate(s, null)).toBeNull();
  });

  it("exports tie members west to east, not in the API's S order", () => {
    const s = makeSearch("tied_set");
    // API order is S-descending; place the highest-S member furthest east.
    (s.tier2.candidates as { lon: number }[]).forEach((c, i) => { c.lon = 30 - i * 10; });
    const json = buildReportJson(s, null, null, "t") as { tier2_decision: { members: string[] } };
    expect(json.tier2_decision.members).toEqual(["rand_d8_224", "rand_d8_217", "rand_d8_233"]);
    const ids = buildCsv(s, null).split("\n").filter((l) => l.startsWith("research_comparison")).map((l) => l.split(",")[3]);
    expect(ids).toEqual(["rand_d8_224", "rand_d8_217", "rand_d8_233"]);
  });

  it("never presents a tie member as a winner", () => {
    const s = makeSearch("tied_set");
    const c = resolveCandidate(s, "t2:rand_d8_217")!;
    expect(candidateRole(s, c)).toBe("tie_member");
    expect(decisionHeadline(s)).toBe("Tie · 3 equivalent windows");
    expect(decisionLabel(s)).toBe(G5.tied);
    // Unordered group: west to east (the order every view uses), not by score.
    expect(decisionMembers(s)).toEqual(["Window 233 · stratified random · roughness decile 8", "Window 217 · stratified random · roughness decile 8", "Window 224 · stratified random · roughness decile 8"]);
  });

  it("keeps abstention explicit and shows no score", () => {
    const s = makeSearch("insufficient_evidence");
    expect(decisionHeadline(s)).toBe("Not enough evidence");
    expect(decisionLabel(s)).toBe("Operator unavailable. No comparison is made.");
    const json = buildReportJson(s, null, null, "2026-01-01T00:00:00Z");
    expect(json.earth_candidate).toBeNull();
    expect(json.terrain_comparison).toBeNull();
  });

  it("carries the G5 strings verbatim in the limitations", () => {
    const texts = limitations(makeSearch("named_leader")).map((l) => l.text);
    for (const g of [G5.scope, G5.validation, G5.scale, G5.operator, G5.gate]) expect(texts).toContain(g);
    expect(limitations(makeSearch("tied_set")).map((l) => l.text)).not.toContain(G5.gate);
  });

  it("marks a limitation verbatim exactly when it is a G5 string, so the dossier's 'Verbatim' mark is true", () => {
    const g5 = new Set<string>(Object.values(G5));
    for (const d of ["named_leader", "tied_set", "insufficient_evidence"] as const) {
      const ls = limitations(makeSearch(d));
      for (const l of ls) expect(l.verbatim, l.code).toBe(g5.has(l.text));
      // Some statements summarise the record: the section must not call all of them verbatim.
      expect(ls.some((l) => !l.verbatim)).toBe(true);
    }
  });

  it("reports the 50 km vs 25 km diagnostic as a ranking change, never as a leader (a tie has none)", () => {
    const tie = makeSearch("tied_set");
    expect(footprintRobustness(tie)).toBeNull();
    (tie.tier2 as { diagnostics?: object }).diagnostics = { footprint_leader_same_50_vs_25km: false };
    const r = footprintRobustness(tie)!;
    expect(r.value).not.toMatch(/leader/i);
    expect(r.note).toContain(G5.scale);
    (tie.tier2 as { diagnostics?: object }).diagnostics = { footprint_leader_same_50_vs_25km: true };
    expect(footprintRobustness(tie)).toBeNull();
  });

  it("labels terrain rows from the screening basis, not the research score", () => {
    const s = makeSearch("named_leader");
    const t = terrainRows(s, resolveCandidate(s, "t2:Atacama Yungay")!)!;
    expect(t.S).toBe(0.529);
    expect(t.rows.map((r) => r.kind)).toEqual(["mismatch", "match"]);
  });

  it("exports a CSV with tier, unit, representation and decision on every row", () => {
    const s = makeSearch("named_leader");
    const csv = buildCsv(s, resolveCandidate(s, "t2:Atacama Yungay"));
    const [head, ...rows] = csv.split("\n");
    expect(head.split(",")).toEqual([...CSV_COLUMNS]);
    const sel = rows.find((r) => r.startsWith("selected_candidate"))!;
    expect(sel).toContain(",2,mars_observation_space,Atacama Yungay,");
    expect(sel).toContain("named_leader");
    const screen = rows.find((r) => r.startsWith("global_screen"))!;
    expect(screen).toContain(",1,as_measured,");
    expect(screen).toContain("screen_rank_not_a_decision");
    expect(rows.filter((r) => r.startsWith("terrain_comparison")).every((r) => r.includes("context_not_research_score"))).toBe(true);
    // The contract holds on every row of every section, not only the result rows.
    const parse = (line: string) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1]).slice(0, CSV_COLUMNS.length);
    const col = (k: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(k);
    const sections = new Set<string>();
    for (const r of rows) {
      const cells = parse(r);
      sections.add(cells[col("section")]);
      for (const k of ["tier", "representation", "decision"] as const) expect(cells[col(k)], `${k} in ${r.slice(0, 40)}`).not.toBe("");
    }
    expect([...sections]).toEqual(expect.arrayContaining(["mars_target", "mars_descriptor", "selected_candidate", "terrain_comparison", "research_comparison", "global_screen", "limitation"]));
    // Escaping: the scope string contains commas, so it must be quoted intact.
    expect(rows.find((r) => r.includes(",terrain_only,"))).toContain(`"${G5.scope}"`);
  });

  it("binds the target to the search, not to any later selection", () => {
    const json = buildReportJson(makeSearch("named_leader"), null, null, "t");
    expect(json.mars_target).toMatchObject({ label: "Jezero", site: "Jezero", lat: 17.6756 });
  });
});

describe("dossier layout", () => {
  it("numbers only the sections the search can fill, without gaps", () => {
    const s = makeSearch("named_leader");
    const full = dossierSections(s, resolveCandidate(s, "t2:Atacama Yungay"));
    expect(full.map((x) => x.id)).toEqual(["plates", "figures", "research", "screen", "terrain", "dimensions", "differences", "provenance", "limitations", "claims", "references"]);
    expect(full.map((x) => x.index)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
    // No candidate: no terrain or dimensions. No global screen: no screen section. Numbering closes up.
    const bare = dossierSections(makeSearch("insufficient_evidence"), null);
    expect(bare.map((x) => x.id)).toEqual(["plates", "figures", "research", "differences", "provenance", "limitations", "claims", "references"]);
    expect(bare.at(-1)).toMatchObject({ index: "08", title: "References" });
  });

  it("lists tie members west to east with their window centres, never by S", () => {
    const s = makeSearch("tied_set");
    (s.tier2.candidates as { lon: number }[]).forEach((c, i) => { c.lon = 30 - i * 10; }); // highest S furthest east
    const rows = decisionMemberRows(s);
    expect(rows.map((r) => r.id)).toEqual(["rand_d8_224", "rand_d8_217", "rand_d8_233"]);
    expect(rows.map((r) => r.lon)).toEqual([10, 20, 30]);
    expect(rows.map((r) => r.label)).toEqual(decisionMembers(s));
    // A member without a located window keeps its place with no invented coordinate.
    const t = makeSearch("tied_set");
    (t.tier2.candidates as { lat: number | null; lon: number | null }[])[1].lon = null;
    expect(decisionMemberRows(t).find((r) => r.id === "rand_d8_217")).toMatchObject({ lon: null });
  });

  it("stamps the generation time in UTC and as Mars time from the same instant", () => {
    const iso = "2026-11-15T08:16:39.123Z";
    const m = marsTime(Date.parse(iso));
    expect(generatedStamp(iso)).toEqual({ date: "2026-11-15", time: "08:16:39", msd: Math.floor(m.msd), mtc: clock(m.mtcHours) });
    expect(generatedStamp("not a date")).toBeNull();
  });

  it("summarises only the data sources the search drew on, with counts from the payload", () => {
    const s = makeSearch("named_leader");
    (s.mars.tier1_features[0] as { source_id?: string; native_resolution_m?: number }).source_id = "Mars_MGS_MOLA_DEM_mosaic_global_463m";
    (s.mars.tier1_features[0] as { native_resolution_m?: number }).native_resolution_m = 463.09;
    (s.tier2.operator as { version?: string }).version = "oom-1.0";
    const p = provenanceSummary(s);
    expect(p.find((l) => l.body === "mars")!.items).toEqual(["MOLA 463 m mosaic", "Observation model oom-1.0"]);
    expect(p.find((l) => l.body === "earth")!.items).toEqual(["GMTED2010 · 249,165 cells", "Copernicus GLO-90 · 230 windows", "ESA WorldCover 2021"]);
    // Off-zone point: no screen, no pool, no operator — nothing is claimed.
    const off = makeSearch("insufficient_evidence");
    (off.tier2 as { candidate_pool: unknown; landcover_gate: unknown }).candidate_pool = null;
    (off.tier2 as { landcover_gate: unknown }).landcover_gate = null;
    (off.mars as { tier1_features: unknown[] }).tier1_features = [];
    const q = provenanceSummary(off);
    expect(q.find((l) => l.body === "mars")!.items).toEqual(["No Mars measurement for this target"]);
    expect(q.find((l) => l.body === "earth")!.items).toEqual(["No Earth comparison ran"]);
  });

  it("names the dimensions of analogy as the comparison does, counting descriptors as figures", () => {
    const s = makeSearch("named_leader");
    const landcover = { available: true, frac_bare_like: 1, frac_vegetated: 0 };
    (s.tier2.candidates[0] as { landcover?: unknown }).landcover = landcover;
    const c = resolveCandidate(s, "t2:Atacama Yungay")!;
    const view = candidateList(s).find((x) => x.id === "t2:Atacama Yungay")!;
    const dossier = dimensions(c);
    const strip = DIMENSIONS(view);
    expect(dossier.map((d) => [d.name, d.status])).toEqual(strip.map((d) => [d.name, d.status]));
    expect(dossier[0].detail.startsWith(`${T2_MEASURES} multiscale terrain descriptors`)).toBe(true);
    expect(strip[0].detail.startsWith(`${T2_MEASURES} multiscale terrain descriptors`)).toBe(true);
    // Percentages as every view prints them.
    expect(dossier[1].detail).toBe(strip[1].detail);
    const cell = resolveCandidate(s, "t1:gmted25k:207754")!;
    expect(dimensions(cell, 25)[0].detail.startsWith(`${T1_MEASURES} global-screen terrain descriptors on 25 km`)).toBe(true);
  });
});
