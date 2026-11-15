import { useEffect, useMemo } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import type { GlobeMarker } from "../../globes/protocol";
import { api, useEarthPool, useEarthSites } from "../../services/api";
import { useApp } from "../../store/app";
import { candidateList, selectedCandidate } from "./candidates";

/** Keeps the Earth globe in step with search results and the selected candidate. */
export function EarthGlobeSync() {
  const bus = useGlobeBus();
  const earthSites = useEarthSites();
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const stage = useApp((s) => s.stage);
  const overlays = useApp((s) => s.earthOverlays);
  const pool = useEarthPool();
  const site = search?.mars.site ?? null;
  const mission = (search?.request as { mission?: string } | undefined)?.mission ?? null;
  const cands = useMemo(() => candidateList(search), [search]);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => {
    if (!earthSites.data) return;
    bus.send("earth", {
      t: "setMarkers", group: "reference", markers: earthSites.data.map((x) => ({
        id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name,
      })),
    });
  }, [bus, earthSites.data]);

  useEffect(() => {
    const markers: GlobeMarker[] = cands.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: c.tier === 2 ? "leader" : "candidate", label: c.label, rank: c.tier === 1 ? c.rank : undefined }));
    bus.send("earth", { t: "setMarkers", group: "candidates", markers, options: { cluster: true } });
  }, [bus, cands]);

  useEffect(() => {
    if (!current) {
      bus.send("earth", { t: "setFootprints", group: "cand", footprints: [] });
      bus.send("earth", { t: "select", id: null });
      return;
    }
    bus.send("earth", { t: "select", id: current.id });
    bus.send("earth", {
      t: "setFootprints", group: "cand", footprints: [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: 50 }],
    });
    if (stage === "earth") bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: 1600 });
  }, [bus, current, stage]);

  useEffect(() => {
    if (stage === "earth" && !current) bus.send("earth", { t: "reset" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Tier-1 similarity field for the searched Mars target (display product from the API).
  useEffect(() => {
    const url = overlays.similarity && site && mission && search?.tier1 ? api.similarityRasterUrl(site, mission) : null;
    bus.send("earth", { t: "setOverlay", id: "similarity", url, alpha: 0.92 });
  }, [bus, overlays.similarity, site, mission, search?.tier1]);

  useEffect(() => {
    bus.send("earth", { t: "setOverlay", id: "coverage", url: overlays.coverage ? api.coverageRasterUrl() : null, alpha: 1 });
  }, [bus, overlays.coverage]);

  // The 230 windows tier-2 actually examined, shown faintly so refinement coverage is honest.
  useEffect(() => {
    const show = overlays.pool && !!search && pool.data;
    bus.send("earth", {
      t: "setMarkers", group: "pool", options: { labels: "none" },
      markers: show ? pool.data!.filter((w) => w.kind === "random").map((w) => ({ id: `pool:${w.id}`, lat: w.lat, lon: w.lon, kind: "pool" as const })) : [],
    });
  }, [bus, overlays.pool, search, pool.data]);

  useEffect(() => {
    bus.send("earth", { t: "setGraticule", on: useApp.getState().graticule });
  }, [bus]);

  useGlobeEvents("earth", (m) => {
    if (m.t === "markerClick" && !m.id.startsWith("ref:") && !m.id.startsWith("pool:")) useApp.getState().set({ candidateId: m.id });
  });
  return null;
}
