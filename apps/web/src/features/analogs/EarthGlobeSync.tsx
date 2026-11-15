import { useEffect, useMemo, useRef } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import type { GlobeFootprint, GlobeMarker } from "../../globes/protocol";
import { api, useEarthPool, useEarthSites } from "../../services/api";
import { useApp } from "../../store/app";
import { boundsOf, type CandidateView, candidateList, centroidOf, selectedCandidate } from "./candidates";
import { useEarthLocal } from "./earthLocal";
import { chooseCandidate, useTierMemorySync } from "./tierMemory";

/** Short marker labels: the panel carries the full name. */
function markerLabel(c: CandidateView) {
  if (c.tier === 1) return undefined;
  const m = /^rand_d\d_(\d+)$/.exec(c.t2!.id);
  return m ? `Window ${m[1]}` : c.label;
}

/**
 * The set the Earth stage is about right now: tier-2 decision members (else all tier-2 windows),
 * or — on the global screen, or when the research comparison has nothing — the first page of cells.
 */
export function activeSet(cands: CandidateView[], tier: 1 | 2, members: string[], firstPage: number): CandidateView[] {
  const t2 = cands.filter((c) => c.tier === 2);
  const t1 = cands.filter((c) => c.tier === 1).slice(0, firstPage);
  if (tier === 2 && t2.length) {
    const m = t2.filter((c) => members.includes(c.t2!.id));
    return m.length ? m : t2;
  }
  return t1.length ? t1 : t2;
}

/** Keeps the Earth globe in step with search results, the active stage and the selected candidate. */
export function EarthGlobeSync() {
  useTierMemorySync();
  const bus = useGlobeBus();
  const earthSites = useEarthSites();
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const tier = useApp((s) => s.tier);
  const stage = useApp((s) => s.stage);
  const overlays = useApp((s) => s.earthOverlays);
  const showReference = useEarthLocal((s) => s.referenceSites);
  const pool = useEarthPool();
  const site = search?.mars.site ?? null;
  const mission = (search?.request as { mission?: string } | undefined)?.mission ?? null;
  const cands = useMemo(() => candidateList(search), [search]);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  const members = useMemo(() => search?.tier2.decision.members ?? [], [search]);

  // Named reference / control windows only when their layer is on.
  useEffect(() => {
    const show = showReference && earthSites.data;
    bus.send("earth", {
      t: "setMarkers", group: "reference", options: { labels: "selected" }, markers: show ? earthSites.data!.map((x) => ({
        id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name,
      })) : [],
    });
  }, [bus, earthSites.data, showReference]);

  // Research windows (tier 2) and screened cells (tier 1) are separate groups: cells cluster, windows never do.
  useEffect(() => {
    const t2: GlobeMarker[] = cands.filter((c) => c.tier === 2).map((c) => ({
      id: c.id, lat: c.lat, lon: c.lon, kind: members.includes(c.t2!.id) ? "leader" : "candidate", label: markerLabel(c),
    }));
    const t1: GlobeMarker[] = cands.filter((c) => c.tier === 1).map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: "candidate", rank: c.rank }));
    bus.send("earth", { t: "setMarkers", group: "candidates", markers: [] });
    bus.send("earth", { t: "setMarkers", group: "t2", markers: t2, options: { labels: "selected" } });
    bus.send("earth", { t: "setMarkers", group: "t1", markers: t1, options: { cluster: true, labels: "none" } });
  }, [bus, cands, members]);

  // 50 km windows of the tier-2 members, drawn while the research comparison is the active stage.
  useEffect(() => {
    const fps: GlobeFootprint[] = tier === 2
      ? cands.filter((c) => c.tier === 2 && members.includes(c.t2!.id) && c.id !== current?.id)
        .map((c) => ({ id: `m:${c.id}`, kind: "window", lat: c.lat, lon: c.lon, km: c.t2!.window_km || 50 }))
      : [];
    bus.send("earth", { t: "setFootprints", group: "members", footprints: fps });
  }, [bus, cands, members, tier, current?.id]);

  // Selected candidate: highlight + its true footprint (25 km cell box or 50 km window).
  useEffect(() => {
    bus.send("earth", { t: "select", id: current?.id ?? null });
    bus.send("earth", {
      t: "setFootprints", group: "cand", footprints: !current ? [] : [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: current.t2?.window_km || 50 }],
    });
  }, [bus, current]);

  // Camera: frame the active set on arrival, on a new search and on a stage switch; fly to a candidate
  // only when the user picks one.
  const frameKey = stage === "earth" && search ? `${search.id}|${tier}` : null;
  const last = useRef<{ frameKey: string | null; candidateId: string | null }>({ frameKey: null, candidateId: null });
  useEffect(() => {
    const prev = last.current;
    last.current = { frameKey, candidateId };
    if (!frameKey || !search) return;
    if (frameKey !== prev.frameKey) {
      const intent = useEarthLocal.getState().intent;
      useEarthLocal.setState({ intent: null });
      if (intent === "select" && current) {
        bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: current.tier === 1 ? 900 : 1100 });
        return;
      }
      const set = activeSet(cands, tier, members, search.tier1?.limit || 50);
      let b = boundsOf(set.map((c) => ({ lat: c.lat, lon: c.lon, bbox: c.tier === 1 ? c.bbox : undefined })));
      if (!b) { bus.send("earth", { t: "reset" }); return; }
      let span = ((b.east - b.west) % 360 + 360) % 360;
      // A set spread over continents has no meaningful box; show the hemisphere around its centroid instead.
      if (span > 140 || b.north - b.south > 100) {
        const c = centroidOf(set);
        if (!c) { bus.send("earth", { t: "reset" }); return; }
        const lat = Math.max(-35, Math.min(35, c.lat));
        b = { west: c.lon - 55, east: c.lon + 55, south: lat - 55, north: lat + 55 };
        span = 110;
      }
      // A single 50 km window still gets regional context around it.
      const padLat = Math.max(0, (3 - (b.north - b.south)) / 2);
      const padLon = Math.max(0, (3 - span) / 2);
      bus.send("earth", {
        t: "fitBounds", west: b.west - padLon, east: b.east + padLon,
        south: Math.max(-89, b.south - padLat), north: Math.min(89, b.north + padLat), padding: 0.16, minHeightKm: 600, maxHeightKm: 20_000,
      });
      return;
    }
    if (candidateId && candidateId !== prev.candidateId && current) {
      useEarthLocal.setState({ intent: null });
      bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: current.tier === 1 ? 900 : 1100 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, candidateId]);

  // Tier-1 similarity field for the searched Mars target (display product from the API).
  useEffect(() => {
    const url = overlays.similarity && site && mission && search?.tier1 ? api.similarityRasterUrl(site, mission) : null;
    bus.send("earth", { t: "setOverlay", id: "similarity", url, alpha: 0.92 });
  }, [bus, overlays.similarity, site, mission, search?.tier1]);

  useEffect(() => {
    bus.send("earth", { t: "setOverlay", id: "coverage", url: overlays.coverage ? api.coverageRasterUrl() : null, alpha: 1 });
  }, [bus, overlays.coverage]);

  // The 230 windows the research comparison actually examined, shown faintly so its coverage is honest.
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
    if (m.t !== "markerClick" || m.id.startsWith("ref:") || m.id.startsWith("pool:")) return;
    useEarthLocal.setState({ intent: "select" });
    chooseCandidate(m.id);
  });
  return null;
}
