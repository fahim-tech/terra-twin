import { describe, expect, it } from "vitest";
import { gisSentence, gisSummary } from "./gisStatus";

const live = {
  status: "available", reason: null, missing_inputs: [], contract_version: "gis-contract-1.0",
  grids: { mars: { available: true, product: "mars_grid_1km_v1" }, earth: { available: true, product: "earth_grid_1km_v1" } },
  discovery: { status: "available", reason: null, missing_inputs: [], active_runs: 0, max_active_runs: 2 },
} as never;

describe("gisSummary", () => {
  it("reads grids, their cell size and discovery from the status payload", () => {
    const g = gisSummary(live);
    expect(g).toMatchObject({ state: "live", gridKm: 1, grids: ["mars", "earth"], discovery: "available", activeRuns: 0, maxRuns: 2 });
    expect(gisSentence(g)).toBe("GIS data: Mars and Earth 1 km grids live, discovery available");
  });
  it("says busy only when every run slot is taken", () => {
    const busy = { ...(live as object), discovery: { status: "available", reason: null, missing_inputs: [], active_runs: 2, max_active_runs: 2 } } as never;
    expect(gisSummary(busy).discovery).toBe("busy");
  });
  it("keeps an unknown cell size unknown and passes the server's reason through", () => {
    const off = { ...(live as object), status: "unavailable", reason: "GIS data not mounted", grids: { mars: { available: true, product: "mars_grid" } } } as never;
    const g = gisSummary(off);
    expect(g.gridKm).toBeNull();
    expect(g.state).toBe("off");
    expect(gisSentence(g)).toBe("GIS data not connected: GIS data not mounted");
  });
  it("is unknown before the payload arrives and off when the request failed", () => {
    expect(gisSummary(undefined).state).toBe("unknown");
    expect(gisSummary(undefined, true).state).toBe("off");
  });
});
