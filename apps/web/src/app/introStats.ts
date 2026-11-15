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
