import { useEffect, useMemo, useRef } from "react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import type { GlobeFootprint, GlobeMarker } from "../../globes/protocol";
import { api, useEarthPool, useEarthSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useLayout } from "../../app/useLayout";
import { useGlobes } from "../../store/globes";
import { boundsOf, type CandidateView, candidateList, centroidOf, selectedCandidate, shortWindow } from "./candidates";
import { phoneFrame, targetForNadir } from "./phoneFrame";
import { useEarthLocal } from "./earthLocal";
import { chooseCandidate, useTierMemorySync } from "./tierMemory";
import { useDiscoveryRun, useGisStatus, useGisTier1 } from "../../services/gis";
import { searchTarget } from "../../store/searchTarget";
import { cellLabel, liveId } from "./discoveryModel";
import { useDiscoverySync } from "./useDiscovery";

/** Drawing groups of the research stages, hidden while the Live discovery stage is shown (and back after). */
const RESEARCH_MARKERS = ["t1", "t2", "candidates"] as const;
const RESEARCH_FOOTPRINTS = ["members", "cand"] as const;

/**
 * Live discovery on the Earth globe: every refined window of the shown run as its true 50 km footprint, the
 * decision's windows as leader markers and the rest as candidates; the selected window highlighted and flown
 * to. The research stages' groups are hidden meanwhile (one basis on screen at a time), and the GIS tier-1
 * cells of an off-zone point are drawn while that screen is shown.
 */
function useLiveGlobe() {
  const bus = useGlobeBus();
  useDiscoverySync();
  const stage = useApp((s) => s.stage);
  const liveOpen = useApp((s) => s.liveOpen);
  const liveRunId = useApp((s) => s.liveRunId);
  const liveCandidate = useApp((s) => s.liveCandidate);
  const search = useApp((s) => s.search);
  const gis = useGisStatus().data?.status === "available";
  const live = liveOpen && gis;
  const run = useDiscoveryRun(live ? liveRunId : null);
  const r = run.data?.refinement ?? null;

  useEffect(() => {
    for (const g of RESEARCH_MARKERS) bus.send("earth", { t: "setGroupShown", kind: "markers", group: g, on: !live });
    for (const g of RESEARCH_FOOTPRINTS) bus.send("earth", { t: "setGroupShown", kind: "footprints", group: g, on: !live });
  }, [bus, live]);

  useEffect(() => {
    // Only a stable leader or a tied set names windows; the closest windows of "no convincing analog" stay candidates.
    const named = r && (r.decision.type === "named_leader" || r.decision.type === "tied_set");
    const members = new Set(named ? r.decision.members : []);
    const cands = live && r ? r.candidates : [];
    bus.send("earth", {
      t: "setMarkers", group: "live", options: { labels: "none" },
      markers: cands.map((c) => ({ id: liveId(c.id), lat: c.lat, lon: c.lon, kind: members.has(c.id) ? "leader" : "candidate", label: cellLabel(c.lat, c.lon) })),
    });
    bus.send("earth", {
      t: "setFootprints", group: "live",
      footprints: cands.filter((c) => c.id !== liveCandidate).map((c) => ({ id: `lw:${c.id}`, kind: "window", lat: c.lat, lon: c.lon, km: r!.window_km })),
    });
  }, [bus, live, r, liveCandidate]);

  // The selected live window: highlighted with its footprint, and flown to when picked.
  const sel = live && r ? r.candidates.find((c) => c.id === liveCandidate) ?? null : null;
  useEffect(() => {
    bus.send("earth", { t: "setFootprints", group: "livecand", footprints: sel && r ? [{ id: liveId(sel.id), kind: "window", lat: sel.lat, lon: sel.lon, km: r.window_km }] : [] });
    if (!live) return;
    bus.send("earth", { t: "select", id: sel ? liveId(sel.id) : null });
    if (sel) bus.send("earth", { t: "flyTo", lat: sel.lat, lon: sel.lon, heightKm: 1100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, sel?.id, live]);

  // Frame the run's windows when a run opens on the Earth stage.
  const framed = useRef<string | null>(null);
  useEffect(() => {
    if (!live || stage !== "earth" || !r || !run.data) { if (!live) framed.current = null; return; }
    if (framed.current === run.data.run_id) return;
    framed.current = run.data.run_id;
    const b = boundsOf(r.candidates.map((c) => ({ lat: c.lat, lon: c.lon })));
    if (!b) return;
    const span = ((b.east - b.west) % 360 + 360) % 360;
    if (span > 140 || b.north - b.south > 100) {
      const c = centroidOf(r.candidates.map((x) => ({ lat: x.lat, lon: x.lon })) as CandidateView[]);
      if (c) bus.send("earth", { t: "flyTo", lat: Math.max(-35, Math.min(35, c.lat)), lon: c.lon, heightKm: 14_000 });
      return;
    }
    bus.send("earth", { t: "fitBounds", ...b, padding: 0.16, minHeightKm: 600, maxHeightKm: 20_000 });
  }, [bus, live, stage, r, run.data]);

  // GIS tier-1 cells of an off-zone point (the same query the panel's screen reads, so it is cached).
  const t = searchTarget(search);
  const offZone = !!search && search.status === "unavailable" && gis;
  const t1 = useGisTier1(offZone && t ? { lat: t.lat, lon: t.lon, mission: t.mission } : null);
  useEffect(() => {
    const cells = offZone && !live ? t1.data?.candidates ?? [] : [];
    bus.send("earth", {
      t: "setMarkers", group: "gis1", options: { cluster: true, labels: "none" },
      markers: cells.map((c) => ({ id: `gis1:${c.region_id}`, lat: c.latitude, lon: c.longitude, kind: "candidate", rank: c.rank })),
    });
  }, [bus, offZone, live, t1.data]);
}

/** Short marker labels: the panel carries the full name. */
function markerLabel(c: CandidateView) {
  if (c.tier === 1) return undefined;
  return shortWindow(c.t2!.id);
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
  useLiveGlobe();
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
  const phone = useLayout() === "phone";
  const liveShown = useApp((s) => s.liveOpen);

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
    // Cesium labels are demoted (spec §15): on the research stage every member has its 50 km window drawn and
    // a label would straddle the box edge, and on phones they collide with cell clusters at the limb. The
    // panel and its footer name the windows.
    const labels = tier === 2 || phone ? "none" : "selected";
    bus.send("earth", { t: "setMarkers", group: "t2", markers: t2, options: { labels } });
    bus.send("earth", { t: "setMarkers", group: "t1", markers: t1, options: { cluster: true, labels: "none" } });
  }, [bus, cands, members, tier, phone]);

  // Research windows of the tier-2 members, drawn while the research comparison is the active stage.
  useEffect(() => {
    const fps: GlobeFootprint[] = tier === 2
      ? cands.filter((c) => c.tier === 2 && members.includes(c.t2!.id) && c.id !== current?.id)
        .map((c) => ({ id: `m:${c.id}`, kind: "window", lat: c.lat, lon: c.lon, km: c.t2!.window_km }))
      : [];
    bus.send("earth", { t: "setFootprints", group: "members", footprints: fps });
  }, [bus, cands, members, tier, current?.id]);

  // Selected candidate: highlight + its true footprint (screening-cell box or research window).
  useEffect(() => {
    bus.send("earth", { t: "select", id: current?.id ?? null });
    bus.send("earth", {
      t: "setFootprints", group: "cand", footprints: !current ? [] : [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: current.t2!.window_km }],
    });
  }, [bus, current]);

  // Camera: frame the active set on arrival, on a new search and on a stage switch; fly to a candidate
  // only when the user picks one.
  const frameKey = stage === "earth" && search && !liveShown ? `${search.id}|${tier}` : null;
  const last = useRef<{ frameKey: string | null; candidateId: string | null }>({ frameKey: null, candidateId: null });
  /** The set framed by `frameShortFree`, until the user moves the camera or picks a candidate. */
  const phoneFramed = useRef<CandidateView[] | null>(null);
  const insets = useGlobes((s) => s.insets.earth);
  // The globe re-aims its last target when the free area changes (the sheet settles after arrival), which
  // would move the nadir chosen for the strip; frame the set again for the new strip instead.
  useEffect(() => {
    if (phone && stage === "earth" && phoneFramed.current) frameShortFree(phoneFramed.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom, insets.left, insets.right]);
  useEffect(() => {
    const prev = last.current;
    last.current = { frameKey, candidateId };
    if (!frameKey || !search) return;
    if (frameKey !== prev.frameKey || candidateId !== prev.candidateId) phoneFramed.current = null;
    if (frameKey !== prev.frameKey) {
      const intent = useEarthLocal.getState().intent;
      useEarthLocal.setState({ intent: null });
      if (intent === "select" && current) {
        bus.send("earth", { t: "flyTo", lat: current.lat, lon: current.lon, heightKm: current.tier === 1 ? 900 : 1100 });
        return;
      }
      const set = activeSet(cands, tier, members, search.tier1?.limit || 50);
      if (phone && frameShortFree(set)) return;
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

  // Tier-1 similarity field for the searched Mars target (display product from the API). Never during
  // the spatial comparison: it is a different basis (tier 1, as measured) from the compared windows.
  const comparing = stage === "compare";
  useEffect(() => {
    // Nor during live discovery: its windows come from the GIS shortlist, not this research search's screen.
    const url = !comparing && !liveShown && overlays.similarity && site && mission && search?.tier1 ? api.similarityRasterUrl(site, mission) : null;
    bus.send("earth", { t: "setOverlay", id: "similarity", url, alpha: 0.92 });
  }, [bus, comparing, liveShown, overlays.similarity, site, mission, search?.tier1]);

  useEffect(() => {
    bus.send("earth", { t: "setOverlay", id: "coverage", url: overlays.coverage ? api.coverageRasterUrl() : null, alpha: 1 });
  }, [bus, overlays.coverage]);

  // The 230 windows the research comparison actually examined, shown faintly so its coverage is honest.
  useEffect(() => {
    const show = overlays.pool && !!search && pool.data;
    bus.send("earth", {
      t: "setMarkers", group: "pool", options: { labels: "none" },
      markers: show ? pool.data!.map((w) => ({ id: `pool:${w.id}`, lat: w.lat, lon: w.lon, kind: "pool" as const })) : [],
    });
  }, [bus, overlays.pool, search, pool.data]);

  useEffect(() => {
    bus.send("earth", { t: "setGraticule", on: useApp.getState().graticule });
  }, [bus]);

  /**
   * Phone: the free area is a short strip above the sheet, and a nadir camera keeps the planet's disc centred
   * on the canvas, so a box fit of a spread-out set leaves most of the disc under the sheet. Frame such sets
   * by searching for the nadir and altitude that put the members inside the strip. False = use the box fit.
   */
  function frameShortFree(set: CandidateView[]): boolean {
    const b = boundsOf(set);
    if (!b || set.length < 2) return false;
    const span = ((b.east - b.west) % 360 + 360) % 360;
    if (span < 20 && b.north - b.south < 20) return false;
    const main = document.querySelector("main")?.getBoundingClientRect();
    if (!main) return false;
    const frame = { w: main.width, h: main.height, ...useGlobes.getState().insets.earth };
    const centre = centroidOf(set) ?? { lat: (b.north + b.south) / 2, lon: b.west + span / 2 };
    const fit = phoneFrame(set, frame, centre, { reserveRight: 48 });
    if (!fit || fit.inside === 0) return false;
    const t = targetForNadir(fit.nadir, fit.heightKm, frame);
    bus.send("earth", { t: "flyTo", lat: t.lat, lon: t.lon, heightKm: fit.heightKm });
    phoneFramed.current = set;
    return true;
  }

  useGlobeEvents("earth", (m) => {
    if (m.t === "interaction") phoneFramed.current = null;
    if (m.t !== "markerClick" || m.id.startsWith("ref:") || m.id.startsWith("pool:") || m.id.startsWith("gis1:")) return;
    if (m.id.startsWith("live:")) { useApp.getState().set({ liveCandidate: m.id.slice(5) }); return; }
    useEarthLocal.setState({ intent: "select" });
    chooseCandidate(m.id);
  });
  return null;
}
