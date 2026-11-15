/**
 * Clean captures for the location plates.
 *
 * A plate is captioned as NASA imagery with one frame drawn by the report, so nothing the globes draw for
 * the explorer may be baked into it: no data layers (similarity field, coverage raster, research-pool
 * dots), no markers or labels, no zone / AOI / candidate / member / comparison footprints.
 *
 * The globe protocol has no "hide group" message (see open issues), so the groups are emptied for the
 * capture and then re-sent from current app state, mirroring what MarsGlobeSync and EarthGlobeSync send
 * (`restoreFor` follows their effects message for message). Messages to a globe are delivered in order, so
 * the removals reach the globe before the snapshot request.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { GlobeBus } from "../../app/globeBus";
import type { GlobeFootprint, GlobeMarker, ParentToGlobe, Planet } from "../../globes/protocol";
import { zoneName } from "../../lib/glossary";
import type { api } from "../../services/api";
import { type Selection, useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import { candidateList, selectedCandidate, shortWindow } from "../analogs/candidates";
import { useEarthLocal } from "../analogs/earthLocal";

type Sites = Awaited<ReturnType<typeof api.sites>>;
type EarthSites = Awaited<ReturnType<typeof api.earthSites>>;

/** Every group the explorer, results and comparison syncs draw on each globe. */
export const CAPTURE_GROUPS = {
  mars: { markers: ["sites", "selection"], footprints: ["zones", "aoi", "compare"] },
  earth: { markers: ["reference", "candidates", "t1", "t2", "pool"], footprints: ["cand", "members", "compare"] },
} as const satisfies Record<Planet, { markers: readonly string[]; footprints: readonly string[] }>;

/**
 * Messages that clear everything the app draws on a globe (data overlays are switched off through app state).
 * The graticule is the user's map toggle; its lines would be baked into imagery captioned as NASA's, so it is
 * switched off for the capture too (the plate's own neatline carries the coordinates).
 */
export function clearMessages(planet: Planet): ParentToGlobe[] {
  const g = CAPTURE_GROUPS[planet];
  return [
    { t: "select", id: null },
    ...g.markers.map((group): ParentToGlobe => ({ t: "setMarkers", group, markers: [] })),
    ...g.footprints.map((group): ParentToGlobe => ({ t: "setFootprints", group, footprints: [] })),
    { t: "setGraticule", on: false },
  ];
}

/** The app state the syncs draw from, as plain data. */
export interface DrawState {
  selection: Selection | null;
  footprintKm: number;
  search: AnalogSearch | null;
  candidateId: string | null;
  tier: 1 | 2;
  sites: Sites | undefined;
  earthSites: EarthSites | undefined;
  referenceSites: boolean;
  phone: boolean;
  /** The graticule toggle (App sends it to both globes). */
  graticule: boolean;
}

/** What the syncs would send for this state, for every group `clearMessages` empties (pool via overlay state). */
export function restoreFor(planet: Planet, s: DrawState): ParentToGlobe[] {
  // App.tsx keeps both globes' graticule in step with the toggle.
  const out: ParentToGlobe[] = [{ t: "setGraticule", on: s.graticule }];
  if (planet === "mars") {
    // MarsGlobeSync: research zones (markers + faint footprints), then the selection and its AOI.
    if (s.sites) {
      out.push({ t: "setMarkers", group: "sites", options: { labels: "none" }, markers: s.sites.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: zoneName(x.id) })) });
      out.push({ t: "setFootprints", group: "zones", footprints: s.sites.map((x) => ({ id: x.id, kind: "research_bbox", lat: x.lat, lon: x.lon, bbox: [x.bbox.lon_min, x.bbox.lat_min, x.bbox.lon_max, x.bbox.lat_max] })) });
    }
    const sel = s.selection;
    if (!sel) {
      out.push({ t: "setMarkers", group: "selection", markers: [] }, { t: "setFootprints", group: "aoi", footprints: [] }, { t: "select", id: null });
    } else {
      const atCentre = !!sel.siteId && !!s.sites?.some((x) => x.id === sel.siteId && Math.abs(x.lat - sel.lat) < 1e-6 && Math.abs(x.lon - sel.lon) < 1e-6);
      out.push({ t: "setMarkers", group: "selection", options: { labels: "none" }, markers: atCentre ? [] : [{ id: "selection", lat: sel.lat, lon: sel.lon, kind: "selection", label: sel.label }] });
      out.push({ t: "setFootprints", group: "aoi", footprints: [{ id: `aoi:${sel.lat.toFixed(5)}:${sel.lon.toFixed(5)}:${s.footprintKm}`, kind: "aoi", lat: sel.lat, lon: sel.lon, km: s.footprintKm }] });
      out.push({ t: "select", id: atCentre ? `site:${sel.siteId}` : "selection" });
    }
    // CompareGlobeSync draws only while comparing; the report is never the compare stage.
    out.push({ t: "setFootprints", group: "compare", footprints: [] });
    return out;
  }

  // EarthGlobeSync: reference windows (layer), research windows and cells, members' windows, the selection.
  const show = s.referenceSites && s.earthSites;
  out.push({
    t: "setMarkers", group: "reference", options: { labels: "selected" }, markers: show ? s.earthSites!.map((x) => ({
      id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name,
    })) : [],
  });
  const cands = candidateList(s.search);
  const members = s.search?.tier2.decision.members ?? [];
  const current = selectedCandidate(s.search, s.candidateId);
  const t2: GlobeMarker[] = cands.filter((c) => c.tier === 2).map((c) => ({
    id: c.id, lat: c.lat, lon: c.lon, kind: members.includes(c.t2!.id) ? "leader" : "candidate", label: shortWindow(c.t2!.id),
  }));
  const t1: GlobeMarker[] = cands.filter((c) => c.tier === 1).map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: "candidate", rank: c.rank }));
  out.push({ t: "setMarkers", group: "candidates", markers: [] });
  out.push({ t: "setMarkers", group: "t2", markers: t2, options: { labels: s.tier === 2 || s.phone ? "none" : "selected" } });
  out.push({ t: "setMarkers", group: "t1", markers: t1, options: { cluster: true, labels: "none" } });
  const fps: GlobeFootprint[] = s.tier === 2
    ? cands.filter((c) => c.tier === 2 && members.includes(c.t2!.id) && c.id !== current?.id).map((c) => ({ id: `m:${c.id}`, kind: "window", lat: c.lat, lon: c.lon, km: c.t2!.window_km }))
    : [];
  out.push({ t: "setFootprints", group: "members", footprints: fps });
  out.push({ t: "select", id: current?.id ?? null });
  out.push({
    t: "setFootprints", group: "cand", footprints: !current ? [] : [current.tier === 1 && current.bbox
      ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
      : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: current.t2!.window_km }],
  });
  out.push({ t: "setFootprints", group: "compare", footprints: [] });
  return out;
}

/** Messages that put back what the syncs draw, from the app state as it is now (not as it was). */
export function restoreMessages(planet: Planet, qc: QueryClient): ParentToGlobe[] {
  const app = useApp.getState();
  return restoreFor(planet, {
    selection: app.selection,
    footprintKm: app.footprintKm,
    search: app.search,
    candidateId: app.candidateId,
    tier: app.tier,
    sites: qc.getQueryData<Sites>(["sites"]),
    earthSites: qc.getQueryData<EarthSites>(["earthSites"]),
    referenceSites: useEarthLocal.getState().referenceSites,
    phone: window.innerWidth < 768, // useLayout's phone breakpoint
    graticule: app.graticule,
  });
}

type Overlays = ReturnType<typeof useApp.getState>["earthOverlays"];
const holds: Record<Planet, number> = { mars: 0, earth: 0 };
let savedOverlays: Overlays | null = null;

/** Run a capture with the globe's annotations and data layers hidden; restore them afterwards. */
export async function withCleanGlobe<T>(bus: GlobeBus, qc: QueryClient, planet: Planet, run: () => Promise<T>): Promise<T> {
  if (holds[planet]++ === 0) {
    for (const m of clearMessages(planet)) bus.send(planet, m);
    if (planet === "earth") {
      const app = useApp.getState();
      savedOverlays = app.earthOverlays;
      app.set({ earthOverlays: { similarity: false, coverage: false, pool: false } });
    }
  }
  try {
    await new Promise((r) => setTimeout(r, 120)); // let the globe sync effects post their overlay removals
    return await run();
  } finally {
    if (--holds[planet] === 0) {
      for (const m of restoreMessages(planet, qc)) bus.send(planet, m);
      if (planet === "earth" && savedOverlays) {
        const now = useApp.getState().earthOverlays;
        // Restore only if nobody changed the layers meanwhile.
        if (!now.similarity && !now.coverage && !now.pool) useApp.getState().set({ earthOverlays: savedOverlays });
        savedOverlays = null;
      }
    }
  }
}
