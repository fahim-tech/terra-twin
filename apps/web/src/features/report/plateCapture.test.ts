import { describe, expect, it } from "vitest";
import type { ParentToGlobe } from "../../globes/protocol";
import type { AnalogSearch } from "../../types/contracts";
import { CAPTURE_GROUPS, clearMessages, type DrawState, restoreFor } from "./plateCapture";

const sites = [
  { id: "Jezero", name: "Jezero", lat: 18.4, lon: 77.5, bbox: { lon_min: 76.5, lon_max: 78.5, lat_min: 17.4, lat_max: 19.4 }, observed_fraction: 0.3, category: "ez", source: "s" },
] as unknown as DrawState["sites"];

function tieSearch(): AnalogSearch {
  return {
    id: "x", status: "available", request: { lat: 18.4, lon: 77.5, mission: "terrain_geometry_only", footprint_km: 25 },
    mars: { site: "Jezero", coordinate: { lat: 18.4, lon: 77.5 }, footprint_km: 25, tier1_features: [], ez_features: [], unavailable_factors: [], observation_support: null, quality_flags: [], unavailable: null, status: "available" },
    tier1: {
      candidate_pool: { cell_size_km: 25 },
      candidates: [{ region_id: "gmted25k:1", lat: 10, lon: 10, rank: 1, similarity: 0.9, coverage: 1, footprint: { bbox: [9.9, 9.9, 10.1, 10.1] }, known_analog: { name: null } }],
    },
    tier2: {
      target: { window_km: 50 },
      decision: { type: "tied_set", members: ["rand_d8_233", "rand_d8_217"], rotations_checked: 4, label: null },
      candidates: [
        { id: "rand_d8_233", lat: 1, lon: 2, window_km: 50, S: 0.7, coverage: 1 },
        { id: "rand_d8_217", lat: 3, lon: 4, window_km: 50, S: 0.69, coverage: 1 },
        { id: "rand_d2_011", lat: 5, lon: 6, window_km: 50, S: 0.5, coverage: 1 },
      ],
    },
  } as unknown as AnalogSearch;
}

const base: DrawState = {
  selection: null, footprintKm: 25, search: null, candidateId: null, tier: 2, sites: undefined, earthSites: undefined, referenceSites: false, phone: false,
  graticule: false,
};

const groupsOf = (msgs: ParentToGlobe[], t: "setMarkers" | "setFootprints") =>
  msgs.filter((m): m is Extract<ParentToGlobe, { t: typeof t }> => m.t === t).map((m) => (m as { group: string }).group);

describe("clean plate captures", () => {
  it("clears every group the explorer, results and comparison syncs draw", () => {
    expect(groupsOf(clearMessages("mars"), "setFootprints")).toEqual(expect.arrayContaining(["zones", "aoi", "compare"]));
    expect(groupsOf(clearMessages("mars"), "setMarkers")).toEqual(expect.arrayContaining(["sites", "selection"]));
    expect(groupsOf(clearMessages("earth"), "setMarkers")).toEqual(expect.arrayContaining(["t1", "t2", "reference", "pool"]));
    expect(groupsOf(clearMessages("earth"), "setFootprints")).toEqual(expect.arrayContaining(["cand", "members", "compare"]));
    for (const p of ["mars", "earth"] as const) expect(clearMessages(p)[0]).toEqual({ t: "select", id: null });
  });

  it("puts back every cleared group (the research pool returns with its overlay switch)", () => {
    const state = { ...base, sites, selection: { lat: 18.4, lon: 77.5, siteId: "Jezero", label: "Jezero" }, search: tieSearch(), candidateId: "t2:rand_d8_217" };
    for (const p of ["mars", "earth"] as const) {
      const r = restoreFor(p, state);
      for (const g of CAPTURE_GROUPS[p].markers) if (g !== "pool") expect(groupsOf(r, "setMarkers"), `${p} markers ${g}`).toContain(g);
      for (const g of CAPTURE_GROUPS[p].footprints) expect(groupsOf(r, "setFootprints"), `${p} footprints ${g}`).toContain(g);
    }
  });

  it("keeps the user's graticule out of the imagery and puts the toggle back as it is now", () => {
    for (const p of ["mars", "earth"] as const) {
      expect(clearMessages(p)).toContainEqual({ t: "setGraticule", on: false });
      expect(restoreFor(p, { ...base, graticule: true })).toContainEqual({ t: "setGraticule", on: true });
      expect(restoreFor(p, base)).toContainEqual({ t: "setGraticule", on: false });
    }
  });

  it("redraws the Mars zones and a selection at a zone centre the way MarsGlobeSync does", () => {
    const r = restoreFor("mars", { ...base, sites, selection: { lat: 18.4, lon: 77.5, siteId: "Jezero", label: "Jezero" } });
    expect(r).toContainEqual({ t: "setMarkers", group: "selection", options: { labels: "none" }, markers: [] });
    expect(r).toContainEqual({ t: "select", id: "site:Jezero" });
    expect(r).toContainEqual({ t: "setFootprints", group: "aoi", footprints: [{ id: "aoi:18.40000:77.50000:25", kind: "aoi", lat: 18.4, lon: 77.5, km: 25 }] });
    const zones = r.find((m) => m.t === "setFootprints" && m.group === "zones") as { footprints: { kind: string; bbox: number[] }[] };
    expect(zones.footprints[0]).toMatchObject({ kind: "research_bbox", bbox: [76.5, 17.4, 78.5, 19.4] });
  });

  it("redraws a tie without a winner: members marked alike, the chosen window not doubled, no legacy group", () => {
    const r = restoreFor("earth", { ...base, search: tieSearch(), candidateId: "t2:rand_d8_217" });
    const t2 = r.find((m) => m.t === "setMarkers" && m.group === "t2") as { markers: { id: string; kind: string }[]; options: { labels: string } };
    expect(t2.markers.map((m) => [m.id, m.kind])).toEqual([["t2:rand_d8_233", "leader"], ["t2:rand_d8_217", "leader"], ["t2:rand_d2_011", "candidate"]]);
    expect(t2.options.labels).toBe("none");
    const members = r.find((m) => m.t === "setFootprints" && m.group === "members") as { footprints: { id: string }[] };
    expect(members.footprints.map((f) => f.id)).toEqual(["m:t2:rand_d8_233"]);
    expect(r).toContainEqual({ t: "select", id: "t2:rand_d8_217" });
    // The legacy "candidates" group is only ever emptied.
    expect(r).toContainEqual({ t: "setMarkers", group: "candidates", markers: [] });
  });

  it("draws a screening cell's own box and no member windows on the global screen", () => {
    const r = restoreFor("earth", { ...base, search: tieSearch(), candidateId: "t1:gmted25k:1", tier: 1 });
    expect(r).toContainEqual({ t: "setFootprints", group: "cand", footprints: [{ id: "t1:gmted25k:1", kind: "cell", lat: 10, lon: 10, bbox: [9.9, 9.9, 10.1, 10.1] }] });
    expect(r).toContainEqual({ t: "setFootprints", group: "members", footprints: [] });
  });
});
