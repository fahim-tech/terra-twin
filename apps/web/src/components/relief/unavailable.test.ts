import { describe, expect, it } from "vitest";
import { unavailableWords } from "./unavailable";

/** The detail `GET /api/mars/relief?site=` answers with today (503): no MOLA mosaic connected. */
const MOSAIC_503 = {
  status: 503,
  message: "MOLA mosaic not connected",
  detail: {
    status: "unavailable", reason: "MOLA mosaic not connected",
    missing_inputs: ["USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)"], owner: "GIS workstream", site: "Jezero",
  },
};

describe("relief unavailable wording", () => {
  it("says in plain words that no Mars grid is connected, and keeps the setting name to the technical line", () => {
    const w = unavailableWords("mars", MOSAIC_503);
    expect(w.plain).toBe("No Mars elevation grid is connected to this server (MOLA mosaic).");
    expect(w.plain).not.toMatch(/TERRATWIN_|GIS/);
    expect(w.technical).toBe("503 · MOLA mosaic not connected · needs USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC) · GIS workstream");
    expect(w.title).toBe("No Mars elevation grid");
  });

  it("does not claim the mosaic is missing when the server says it is connected but unread", () => {
    const w = unavailableWords("mars", {
      status: 503,
      detail: { reason: "MOLA mosaic connected, but the API has no reader for it (the research extraction aoi.mars_aoi needs GDAL)", missing_inputs: ["Mars AOI extraction service (aoi.mars_aoi, GDAL)"] },
    });
    expect(w.plain).toBe("This server cannot serve a Mars elevation grid yet.");
    expect(w.technical).toContain("connected, but the API has no reader");
  });

  it("separates an unreachable server and an unknown window from a missing dataset", () => {
    expect(unavailableWords("mars", { status: 0, message: "Scientific API is not reachable" })).toEqual({
      title: "No Mars elevation grid", plain: "The Mars elevation grid could not be loaded.", technical: "Scientific API is not reachable",
    });
    const e = unavailableWords("earth", { status: 404, detail: "unknown research-pool window 'x'" });
    expect(e.plain).toBe("This window has no relief grid on this server.");
    expect(e.technical).toBe("404 · unknown research-pool window 'x'");
    expect(unavailableWords("earth", null).technical).toBe("");
  });
});
