import type { GisStatus } from "../services/gis";

/** One compact reading of /api/gis/status for the rail and the intro console. Every part comes from the payload. */
export interface GisSummary {
  /** "live" = GIS library and data connected; "off" = the server says unavailable; "unknown" = not loaded. */
  state: "live" | "off" | "unknown";
  /** Grid cell size in km read from the grid product id ("mars_grid_1km_v1" → 1); null when not stated. */
  gridKm: number | null;
  /** Planets whose grid is served. */
  grids: ("mars" | "earth")[];
  /** Discovery: available, busy (every run slot taken), or off. */
  discovery: "available" | "busy" | "off" | "unknown";
  activeRuns: number | null;
  maxRuns: number | null;
  /** The server's own reason when something is unavailable. */
  reason: string | null;
}

export function gisSummary(s: GisStatus | null | undefined, failed = false): GisSummary {
  if (!s) return { state: failed ? "off" : "unknown", gridKm: null, grids: [], discovery: failed ? "off" : "unknown", activeRuns: null, maxRuns: null, reason: null };
  const grids = (["mars", "earth"] as const).filter((p) => s.grids?.[p]?.available);
  const kms = grids.map((p) => s.grids[p]?.product?.match(/_(\d+(?:\.\d+)?)km/)?.[1]).filter(Boolean).map(Number);
  const gridKm = kms.length && kms.every((k) => k === kms[0]) ? kms[0] : null;
  const d = s.discovery;
  const active = typeof d?.active_runs === "number" ? d.active_runs : null;
  const max = typeof d?.max_active_runs === "number" ? d.max_active_runs : null;
  const discovery = d?.status !== "available" ? "off" : active !== null && max !== null && active >= max ? "busy" : "available";
  return {
    state: s.status === "available" ? "live" : "off",
    gridKm, grids, discovery, activeRuns: active, maxRuns: max,
    reason: s.status !== "available" ? s.reason : d?.status !== "available" ? d?.reason ?? null : null,
  };
}

/** Accessible sentence for the rail item. */
export function gisSentence(g: GisSummary): string {
  if (g.state === "unknown") return "GIS data: checking";
  if (g.state === "off") return `GIS data not connected${g.reason ? `: ${g.reason}` : ""}`;
  const grids = g.grids.length ? `${g.grids.map((p) => (p === "mars" ? "Mars" : "Earth")).join(" and ")} ${g.gridKm !== null ? `${g.gridKm} km ` : ""}grids live` : "no grids served";
  const disc = g.discovery === "available" ? "discovery available" : g.discovery === "busy" ? "discovery busy, every run slot in use" : "discovery not available";
  return `GIS data: ${grids}, ${disc}`;
}
