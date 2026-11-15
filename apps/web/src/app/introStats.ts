/**
 * The intro's telemetry figures, grouped by the planet they describe. Values come from the API only
 * (sites, research pool, dataset records); a figure that is missing stays null and is shown as a dash,
 * never as 0. Each figure names the payload it was read from (`source`), shown beside it in the console.
 */
export interface Readout {
  /** Short caps label shown on screen. */
  label: string;
  /** Full meaning, used as the accessible term. */
  term: string;
  value: number | null;
  unit?: string;
  /** The API record the value was read from (an endpoint or a dataset id). */
  source: string;
}

export interface ReadoutGroup {
  planet: "mars" | "earth";
  name: string;
  items: Readout[];
}

/** First integer captured by `re` in a dataset text, e.g. "249,165 land cells" → 249165. Null when absent (never invented). */
export function firstInt(text: string | null | undefined, re: RegExp): number | null {
  const m = text?.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function readoutGroups(v: { zones: number | null; gridM: number | null; cells: number | null; windows: number | null }): ReadoutGroup[] {
  return [
    {
      planet: "mars", name: "Mars",
      items: [
        // "Research zones" everywhere in the app (search, inspector, legend); the term popover keeps "Exploration Zone".
        { label: "Research zones", term: "Research zones: NASA candidate human-landing Exploration Zones", value: v.zones, source: "mars/sites" },
        { label: "MOLA grid", term: "MOLA comparison grid spacing", value: v.gridM, unit: "m", source: "mars_ez_tier1" },
      ],
    },
    {
      planet: "earth", name: "Earth",
      items: [
        { label: "Cells screened", term: "Earth land cells screened", value: v.cells, source: "earth_global_screen" },
        { label: "Research windows", term: "Earth research windows", value: v.windows, source: "earth_pool_463m" },
      ],
    },
  ];
}

/** The intro's problem → method → finding lines, built only from API figures (null pieces are left out). */
export interface StoryInput {
  jezeroObserved: number | null;          // /api/mars/sites: Jezero observed_fraction
  cells: number | null;                   // /api/datasets: earth_global_screen land cells
  finding: { type: string; members: string[]; leader_S: number | null } | null; // /api/research/summary: Jezero, gated
  mrr: { baseline: number | null; oom: number | null };                           // /api/evidence: synthetic twins
  top1?: { baseline: number | null; oom: number | null };                        // /api/evidence: synthetic twins, top-1
  nTwins?: number | null;                                                         // /api/evidence: mrr_ci[].n_targets
  /** Newest cached whole-Earth discovery run for Jezero (/api/gis/runs/{id}): decision members with S. */
  discovery?: { type: string; refined: number; members: { lat: number; lon: number; S: number | null; place: string | null }[] } | null;
}
export interface StoryLines { problem: string; method: string; finding: string | null; discovery: string | null; caveat: string }

export function storyLines(s: StoryInput): StoryLines {
  const interp = s.jezeroObserved === null ? null : Math.round((1 - s.jezeroObserved) * 100);
  const problem = "Crews and instruments rehearse Mars work at Earth analog sites, mostly chosen by eye. NASA's MOLA "
    + `altimeter mapped Mars with laser tracks, so its grid is largely interpolated${interp !== null ? ` (${interp} % at Jezero)` : ""}; `
    + "set beside raw Earth elevation, the two do not measure the same thing.";
  const method = `TerraTwin screens ${s.cells !== null ? `all ${s.cells.toLocaleString("en-US")} Earth land cells` : "every Earth land cell"}, then re-observes `
    + "Earth windows through the Mars site's own MOLA sampling before scoring terrain, and names a leader only if it "
    + "holds under four window orientations.";
  let finding: string | null = null;
  const f = s.finding;
  if (f && f.type === "named_leader" && f.members[0] && f.leader_S !== null) {
    finding = `Jezero (landing site): ${f.members[0]}, S ${f.leader_S.toFixed(3)}, stable under all four orientations — `
      + "research record over the fixed 230-window pool.";
  } else if (f && f.type === "tied_set") {
    finding = `Jezero (landing site): a tie of ${f.members.length} windows — no single analog is named.`;
  }
  // What is established first, then what is not: both from the benchmark payload.
  const t = s.top1;
  const established = t && t.baseline !== null && t.oom !== null
    ? `Established on ${s.nTwins ?? "the"} synthetic twins: the true twin is found first ${Math.round(t.oom * 100)} % of the time, against ${Math.round(t.baseline * 100)} % uncorrected`
    : s.mrr.baseline !== null && s.mrr.oom !== null
      ? `Established on the twin benchmark: twin recovery MRR ${s.mrr.baseline.toFixed(2)} → ${s.mrr.oom.toFixed(2)}`
      : null;
  const caveat = `${established ? `${established}. ` : ""}Not yet: field validation — the benchmark is synthetic, and similarity is terrain geometry only.`;
  let discovery: string | null = null;
  const d = s.discovery;
  if (d && d.members.length > 0 && d.members.every((m) => m.S !== null)) {
    const ms = [...d.members].sort((a, b) => a.lon - b.lon); // a tie is unordered: west to east
    const one = (m: (typeof ms)[number]) => `${Math.abs(m.lat).toFixed(2)}° ${m.lat >= 0 ? "N" : "S"} ${Math.abs(m.lon).toFixed(2)}° ${m.lon >= 0 ? "E" : "W"}${m.place ? ` (≈ ${m.place})` : ""}, S ${m.S!.toFixed(3)}`;
    const lead = d.type === "tied_set" ? `a tie of ${ms.length} windows` : d.type === "named_leader" ? "a stable leader" : null;
    const pool = f && f.leader_S !== null && ms.every((m) => m.S! > f.leader_S!) && f.members[0]
      ? ` Each scores above ${f.members[0]} (S ${f.leader_S.toFixed(3)}), the classic analog that leads the fixed pool.` : "";
    if (lead) discovery = `Searching the whole Earth for Jezero (${d.refined} windows refined) returns ${lead}: ${ms.map(one).join("; ")}.${pool}`;
  }
  return { problem, method, finding, discovery, caveat };
}
