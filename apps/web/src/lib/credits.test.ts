import { describe, expect, it } from "vitest";
import { imageryCredit, MARS_ION_CREDIT } from "./credits";
import { factsFrom } from "./facts";
import { glossaryDefinition, GLOSSARY, NO_FACTS } from "./glossary";

const layers = [
  { id: "viking_color", label: "Viking", kind: "imagery" as const, note: "NASA Mars Trek · Viking MDIM 2.1 colour, 232 m. Visualization only." },
  { id: "mola_shade", label: "MOLA", kind: "imagery" as const, note: "NASA Mars Trek · MOLA elevation colour shaded relief, 463 m." },
];

describe("imageryCredit", () => {
  it("credits the layer the globe reports for the selected id", () => {
    expect(imageryCredit("mars", { mode: "fallback", layers }, "viking_color")).toBe("NASA Mars Trek · Viking MDIM 2.1 colour, 232 m. Visualization only");
    expect(imageryCredit("mars", { mode: "fallback", layers }, "mola_shade")).toContain("MOLA");
  });
  it("credits the Cesium Mars tiles when ion replaced the Mars imagery", () => {
    expect(imageryCredit("mars", { mode: "ion", layers }, "viking_color")).toBe(MARS_ION_CREDIT);
  });
  it("says nothing before the globe has reported, or for an unknown layer", () => {
    expect(imageryCredit("mars", null, "viking_color")).toBeNull();
    expect(imageryCredit("earth", { mode: "fallback", layers }, "nope")).toBeNull();
  });
});

describe("glossary facts", () => {
  const datasets = [
    { id: "earth_global_screen", title: "", planet: "earth", role: "", status: "", native_resolution: "~25 km cells; descriptors", coverage: "249,165 land cells, lat -89.5..83.6" },
    { id: "mars_ez_tier1", title: "", planet: "mars", role: "", status: "", native_resolution: "463 m MOLA grid, 25 km cells" },
    { id: "earth_pool_463m", title: "", planet: "earth", role: "", status: "", native_resolution: "108 × 108 px @ 463.09 m local AEQD (50 km)" },
    { id: "worldcover_2021", title: "", planet: "earth", role: "", status: "", notes: "Thresholds bare-like ≥ 0.50, vegetated ≤ 0.20 are working hypotheses." },
    { id: "mars_ez_support", title: "MOLA MEGDR 128 ppd observation counts", planet: "mars", role: "", status: "" },
  ];
  it("reads every count and grid fact from the payloads", () => {
    const f = factsFrom({ datasets, zones: 39, windows: 230, tier1Weights: { a: 1, b: 1, c: 1 }, t2Features: [1, 2, 3, 4] });
    expect(f).toEqual({ zones: 39, cells: 249165, cellKm: 25, t1Descriptors: 3, windows: 230, windowKm: 50, gridM: 463, t2Descriptors: 4, bareMin: 0.5, vegMax: 0.2, megdrPpd: 128 });
    expect(glossaryDefinition("globalScreen", f)).toContain("All 249,165 GMTED2010 land cells (≈25 km)");
    expect(glossaryDefinition("landCover", f)).toContain("vegetated (> 20 %)");
  });
  it("prints a dash for a fact no payload states, never a typed-in figure", () => {
    expect(glossaryDefinition("researchZone", NO_FACTS)).toBe("One of — candidate human-landing zones from NASA's 2015 workshop, with terrain measured from the — m MOLA grid.");
  });
  it("keeps the fixed text of terms that quote no figures, and no fixed text quotes a research count", () => {
    expect(glossaryDefinition("similarity", NO_FACTS)).toBe(GLOSSARY.similarity.definition);
    for (const k of ["globalScreen", "researchComparison", "researchZone", "landCover", "megdr"] as const) {
      // Product names, tier names and the workshop year are names, not research counts.
      expect(GLOSSARY[k].definition.replace(/GMTED2010|2015|tier-\d/g, "")).not.toMatch(/\d/);
    }
  });
});
