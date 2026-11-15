/**
 * Clean captures for the location plates.
 *
 * A plate is captioned as NASA imagery with one frame drawn by the report, so nothing the globes draw for
 * the explorer may be baked into it: no data layers (similarity field, coverage raster, research-pool
 * dots), no markers or labels, no selection / AOI / zone / candidate footprints. Otherwise the plate shows
 * two concentric squares with no legend and a label struck through by the report's frame.
 *
 * The globe protocol has no "hide group" message (see shared_file_requests), so the groups are emptied for
 * the capture and then re-sent from current app state, mirroring what MarsGlobeSync / EarthGlobeSync send.
 * Messages to a globe are delivered in order, so the removals reach the globe before the snapshot request.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { GlobeBus } from "../../app/globeBus";
import type { GlobeMarker, ParentToGlobe, Planet } from "../../globes/protocol";
import type { api } from "../../services/api";
import { useApp } from "../../store/app";
import { candidateList, selectedCandidate } from "../analogs/candidates";

type Sites = Awaited<ReturnType<typeof api.sites>>;
type EarthSites = Awaited<ReturnType<typeof api.earthSites>>;

/** Messages that clear everything the explorer draws on a globe (data layers are handled separately). */
export function clearMessages(planet: Planet): ParentToGlobe[] {
  return planet === "mars"
    ? [
        { t: "select", id: null },
        { t: "setMarkers", group: "sites", markers: [] },
        { t: "setMarkers", group: "selection", markers: [] },
        { t: "setFootprints", group: "aoi", footprints: [] },
      ]
    : [
        { t: "select", id: null },
        { t: "setMarkers", group: "reference", markers: [] },
        { t: "setMarkers", group: "candidates", markers: [] },
        { t: "setFootprints", group: "cand", footprints: [] },
      ];
}

/** Messages that put back what the explorer draws, from the app state as it is now (not as it was). */
export function restoreMessages(planet: Planet, qc: QueryClient): ParentToGlobe[] {
  const app = useApp.getState();
  const out: ParentToGlobe[] = [];
  if (planet === "mars") {
    const sites = qc.getQueryData<Sites>(["sites"]);
    if (sites) out.push({ t: "setMarkers", group: "sites", markers: sites.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: x.name })) });
    const sel = app.selection;
    if (sel) {
      const site = sites?.find((x) => x.id === sel.siteId);
      out.push({ t: "setMarkers", group: "selection", markers: [{ id: "selection", lat: sel.lat, lon: sel.lon, kind: "selection", label: sel.label }] });
      out.push({
        t: "setFootprints", group: "aoi", footprints: [
          { id: "aoi", kind: "aoi", lat: sel.lat, lon: sel.lon, km: app.footprintKm },
          ...(site ? [{ id: "ez", kind: "research_bbox" as const, lat: site.lat, lon: site.lon, bbox: [site.bbox.lon_min, site.bbox.lat_min, site.bbox.lon_max, site.bbox.lat_max] as [number, number, number, number] }] : []),
        ],
      });
      out.push({ t: "select", id: sel.siteId ? `site:${sel.siteId}` : "selection" });
    }
    return out;
  }
  const ref = qc.getQueryData<EarthSites>(["earthSites"]);
  if (ref) {
    out.push({ t: "setMarkers", group: "reference", markers: ref.map((x) => ({ id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name })) });
  }
  const markers: GlobeMarker[] = candidateList(app.search).map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: c.tier === 2 ? "leader" : "candidate", label: c.label, rank: c.tier === 1 ? c.rank : undefined }));
  out.push({ t: "setMarkers", group: "candidates", markers, options: { cluster: true } });
  const current = selectedCandidate(app.search, app.candidateId);
  if (current) {
    out.push({ t: "select", id: current.id });
    out.push({
      t: "setFootprints", group: "cand", footprints: [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: 50 }],
    });
  }
  return out;
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
