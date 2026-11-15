import { describe, expect, it } from "vitest";
import type { GisStatus } from "../../services/gis";
import { gisRows, liveSentence } from "./gisRows";

const LIVE = {
  status: "available", reason: null, missing_inputs: [], contract_version: "gis-contract-1.0",
  processing_version: "terratwin-gis-0.1.0", method_version: "oom-1.0",
  grids: { mars: { available: true, product: "mars_grid_1km_v1" }, earth: { available: true, product: "earth_grid_1km_v1" } },
  context: { available: true },
  discovery: { status: "available", reason: null, missing_inputs: [], worker: { alive: true, age_s: 51 }, active_runs: 0, max_active_runs: 2, window_km: 50 },
} as unknown as GisStatus;

const DATASETS = [
  { id: "mola_mosaic", status: "connected", native_resolution: "463 m grid (binned altimetry)" },
  { id: "mola_counts_tiles", status: "missing", native_resolution: null },
];

describe("GIS integration rows", () => {
  it("reads every value from the payloads", () => {
    const rows = gisRows(LIVE, DATASETS);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.contract.value).toBe("gis-contract-1.0");
    expect(by["grid-mars"].detail).toBe("mars_grid_1km_v1");
    expect(by.context.value).toBe("Live");
    expect(by.context.detail).toMatch(/never a similarity feature/);
    expect(by.discovery.detail).toBe("worker alive (heartbeat 51 s ago) · active runs 0 of 2 · 50 km windows");
    expect(by.mola_mosaic.value).toBe("Connected");
    expect(by.mola_counts_tiles.value).toBe("Not connected");
    expect(by.mola_counts_tiles.state).toBe("struck");
  });

  it("says 'not reported' instead of inventing a state, and omits datasets the API does not list", () => {
    const bare = { ...LIVE, contract_version: null, grids: {}, context: undefined, discovery: { status: "unavailable", reason: "worker offline", missing_inputs: [] } } as unknown as GisStatus;
    const rows = gisRows(bare, []);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.contract.value).toBe("not reported");
    expect(by["grid-mars"].value).toBe("not reported");
    expect(by.context.value).toBe("not reported");
    expect(by.discovery.value).toBe("Not available");
    expect(by.discovery.detail).toBe("worker offline");
    expect(by.mola_mosaic).toBeUndefined();
  });

  it("keeps research records and live discovery apart in the live sentence", () => {
    expect(liveSentence(LIVE)).toMatch(/published research records\. Live discovery runs through the GIS worker/);
    expect(liveSentence(undefined)).toMatch(/could not be read/);
    const down = { ...LIVE, discovery: { ...LIVE.discovery, worker: { alive: false } } } as unknown as GisStatus;
    expect(liveSentence(down)).toMatch(/not available/);
  });
});
