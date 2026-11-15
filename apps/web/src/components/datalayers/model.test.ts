import { describe, expect, it } from "vitest";
import type { GridInfo, GridLayer } from "../../services/gis";
import { cellSpacing, dataLayerSpec, figureDigits, flagList, groupLayers, landMask, legendFor, legendNumber, pointSurface, pointTerrain, stretchDigits, unitSuffix } from "./model";

const viridis = { name: "viridis", stops: [[0, "#440154"], [0.5, "#21918c"], [1, "#fde725"]] as [number, string][] };
const elev: GridLayer = { name: "elevation_m", label: "Elevation", group: "terrain", kind: "continuous", units: "m (EGM96 geoid, GMTED2010)",
  stretch: { min: -5098.75, max: 4702.76, basis: "2nd to 98th percentile of the planet's cells with a value (display stretch, not a threshold)" }, palette: viridis };
const slope: GridLayer = { name: "slope_local_deg", label: "Local slope, cell", group: "terrain", kind: "continuous", units: "deg", stretch: { min: 0.12, max: 7.39, basis: "b" }, palette: viridis };
const obs: GridLayer = { name: "obs_bins", label: "Observed MEGDR bins in the cell", group: "support", kind: "categorical", units: "count (0-4)",
  classes: [{ value: 4, label: "4 of 4", color: "#fde725" }, { value: 0, label: "none (fully interpolated)", color: "#2b2f36" }] };
const surface: GridLayer = { name: "surface_class", label: "Surface class (GSHHG)", group: "surface", kind: "categorical", units: "class",
  classes: [{ value: 1, label: "land", color: "#c9b48a" }, { value: 2, label: "ocean", color: "#0d2f4a" }] };

const info = (planet: "mars" | "earth", layers: GridLayer[]): GridInfo => ({
  planet, product: `${planet}_grid_1km_v1`, layers, max_level: planet === "mars" ? 6 : 7, tile_size: 256,
  tile_url: `/api/gis/grid/${planet}/tile/{z}/{x}/{y}.png?layer={layer}&v=abc`, version: "abc", flags: { "2": "two", "1": "one" }, use_rules: ["r"],
  grid: planet === "mars" ? { degrees_per_cell: 0.015625 } : { arcsec_per_cell: 30 },
} as GridInfo);
const tileUrl = (i: GridInfo, l: string) => i.tile_url.replace("{layer}", l);

describe("data layers model", () => {
  it("groups layers in a fixed order and drops empty groups", () => {
    const g = groupLayers([obs, elev, slope]);
    expect(g.map((x) => x.group)).toEqual(["terrain", "support"]);
    expect(g[0].layers.map((l) => l.name)).toEqual(["elevation_m", "slope_local_deg"]);
  });

  it("builds a ramp legend from the payload's stretch, palette, units and basis", () => {
    const l = legendFor(elev);
    expect(l.kind).toBe("ramp");
    if (l.kind !== "ramp") return;
    expect(l.min).toBe("−5,099");
    expect(l.max).toBe("4,703");
    expect(l.units).toBe("m (EGM96 geoid, GMTED2010)");
    expect(l.basis).toMatch(/display stretch, not a threshold/);
    expect(l.gradient).toContain("#440154 0.00%");
  });

  it("lists classes in value order for a categorical layer", () => {
    const l = legendFor(obs);
    expect(l.kind === "classes" && l.classes.map((c) => c.value)).toEqual([0, 4]);
  });

  it("prints stretch ends at the precision their span needs, with a true minus", () => {
    expect(stretchDigits(0.12, 7.39)).toBe(2);
    expect(stretchDigits(0, 50)).toBe(1);
    expect(stretchDigits(-5000, 5000)).toBe(0);
    expect(legendNumber(-0.001, 2)).toBe("0.00");
    expect(legendNumber(-1.5, 1)).toBe("−1.5");
  });

  it("makes the globe's tile spec from the payload, and nothing for an unknown layer", () => {
    const i = info("mars", [elev]);
    expect(dataLayerSpec(i, "elevation_m", 0.85, tileUrl)).toEqual({
      id: "mars:abc:elevation_m", url: "/api/gis/grid/mars/tile/{z}/{x}/{y}.png?layer=elevation_m&v=abc", maximumLevel: 6, tileSize: 256, alpha: 0.85,
    });
    expect(dataLayerSpec(i, "nope", 1, tileUrl)).toBeNull();
    expect(dataLayerSpec(i, null, 1, tileUrl)).toBeNull();
    expect(dataLayerSpec(i, "elevation_m", 3, tileUrl)?.alpha).toBe(1);
  });

  it("masks Earth terrain layers to land cells by the grid's own surface classes", () => {
    const e = info("earth", [elev, surface]);
    expect(landMask(e, elev, tileUrl)).toEqual({ url: "/api/gis/grid/earth/tile/{z}/{x}/{y}.png?layer=surface_class&v=abc", keep: ["#c9b48a"] });
    expect(dataLayerSpec(e, "elevation_m", 1, tileUrl)?.mask?.keep).toEqual(["#c9b48a"]);
    expect(landMask(e, surface, tileUrl)).toBeNull();
    expect(landMask(info("mars", [elev]), elev, tileUrl)).toBeNull();
    expect(landMask(info("earth", [elev]), elev, tileUrl)).toBeNull();
  });

  it("states cell spacing as the payload gives it", () => {
    expect(cellSpacing(info("mars", []))).toBe("0.015625°");
    expect(cellSpacing(info("earth", []))).toBe("30″");
  });

  it("orders flags by bit", () => {
    expect(flagList({ "2": "two", "1": "one" })).toEqual([{ bit: 1, text: "one" }, { bit: 2, text: "two" }]);
    expect(flagList(null)).toEqual([]);
  });

  it("reads an ocean point as its class, never as terrain", () => {
    const e = info("earth", [elev, slope, surface]);
    const ocean = pointSurface({ surface_class: 2, elevation_m: 0 }, "ocean", e);
    expect(ocean).toEqual({ label: "ocean", land: false });
    expect(pointSurface({ surface_class: 1 }, null, e)).toEqual({ label: "land", land: true });
    expect(pointSurface({}, null, e)).toEqual({ label: null, land: false });
  });

  it("keeps a missing descriptor missing and labels descriptors from the payload", () => {
    const t = pointTerrain({ elevation_m: 15, slope_local_deg: null }, { elevation_m: "m (EGM96 geoid, GMTED2010)", slope_local_deg: "deg" }, info("earth", [elev, slope, surface]));
    expect(t).toEqual([
      { key: "elevation_m", label: "Elevation", value: 15, unit: "m", units: "m (EGM96 geoid, GMTED2010)" },
      { key: "slope_local_deg", label: "Local slope, cell", value: null, unit: "deg", units: "deg" },
    ]);
  });

  it("shortens units and picks figure digits", () => {
    expect(unitSuffix("m (areoid-referenced MOLA heights)")).toBe("m");
    expect(unitSuffix("1")).toBe("");
    expect(unitSuffix("1 (P / ET0)")).toBe("");
    expect(figureDigits("deg", 5.1)).toBe(1);
    expect(figureDigits("m", 2066)).toBe(0);
    expect(figureDigits("", 0.0243)).toBe(3);
  });
});
