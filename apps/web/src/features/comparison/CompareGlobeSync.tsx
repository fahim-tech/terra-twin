import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { api, useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { selectedCandidate } from "../analogs/candidates";
import { normLon, R_EARTH_MEAN_M } from "../../lib/geodesy";
import { useCompareStage, whyDrawerWidth } from "./layout";
import { compareTargets } from "./model";

/** Fallback altitude when the stage has not been measured yet. */
export const COMPARE_HEIGHT_KM = 420;

/** Share of the smaller free-area side the compared footprint should span on screen. */
const FILL = 0.3;
const FOVY = Math.PI / 3; // Cesium default frustum (60°), vertical for these landscape/portrait frames

/**
 * The camera height (same on both planets, so ground scale matches) that makes a `km` footprint span
 * FILL of the smaller free-area side. mpp = 2·h·tan(fovy/2) / canvasHeight (see globe-entry mppAtHeight).
 */
export function matchedHeightKm(km: number, canvasH: number, freePx: number): number {
  if (!(canvasH > 0) || !(freePx > 40)) return COMPARE_HEIGHT_KM;
  const targetPx = Math.max(60, freePx * FILL);
  const mpp = (km * 1000) / targetPx;
  return Math.round((mpp * canvasH) / (2 * Math.tan(FOVY / 2)) / 1000);
}

/**
 * In the comparison stage: draw the compared footprint (the 50 km research window, or the 25 km
 * screening cell) on both planets with identical styling, and fly both globes to the same altitude
 * so the footprints sit in the free area above the strip at matched ground scale.
 */
export function CompareGlobeSync() {
  const bus = useGlobeBus();
  const stage = useApp((s) => s.stage);
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const insets = useGlobes((s) => s.insets);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  const targets = useMemo(() => (search && current ? compareTargets(search, current) : null), [search, current]);
  const active = stage === "compare" && !!targets;

  // Footprints on both planets (kind "window" = identical white outline), cleared on leaving.
  useEffect(() => {
    if (!active || !targets) return;
    bus.send("mars", { t: "setFootprints", group: "compare", footprints: [{ id: "compare:mars", kind: "window", lat: targets.mars.lat, lon: targets.mars.lon, km: targets.mars.km }] });
    bus.send("earth", { t: "setFootprints", group: "compare", footprints: [{ id: "compare:earth", kind: "window", lat: targets.earth.lat, lon: targets.earth.lon, km: targets.earth.km }] });
    return () => {
      bus.send("mars", { t: "setFootprints", group: "compare", footprints: [] });
      bus.send("earth", { t: "setFootprints", group: "compare", footprints: [] });
    };
  }, [bus, active, targets]);

  // Only the compared footprints may be drawn: the explorer's AOI and research-zone outline (Mars)
  // and the results' candidate footprint (Earth, a filled cell for tier 1) are hidden while comparing.
  // Local workaround until the globe protocol can hide a group by stage: clear those groups here,
  // after the owning syncs have run, and put the Mars AOI back on the way out (the Earth results
  // sync re-sends its footprint itself when the stage changes).
  const sites = useSites();
  const sitesRef = useRef(sites.data);
  sitesRef.current = sites.data;
  const selection = useApp((s) => s.selection);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [] });
      bus.send("earth", { t: "setFootprints", group: "cand", footprints: [] });
    }, 0);
    return () => clearTimeout(t);
  }, [bus, active, targets, selection]);
  useEffect(() => {
    if (!active) return;
    return () => {
      const { selection: sel, footprintKm } = useApp.getState();
      if (!sel) return;
      const site = sitesRef.current?.find((x) => x.id === sel.siteId);
      bus.send("mars", {
        t: "setFootprints", group: "aoi", footprints: [
          { id: "aoi", kind: "aoi", lat: sel.lat, lon: sel.lon, km: footprintKm },
          ...(site ? [{ id: "ez", kind: "research_bbox" as const, lat: site.lat, lon: site.lon, bbox: [site.bbox.lon_min, site.bbox.lat_min, site.bbox.lon_max, site.bbox.lat_max] as [number, number, number, number] }] : []),
        ],
      });
    };
  }, [bus, active]);

  // The global-screen similarity field is a different basis (tier 1, as measured); keep it off the
  // spatial comparison and restore the user's layer on the way out.
  useEffect(() => {
    if (stage !== "compare") return;
    // Re-sent briefly: a raster requested just before entering may still be loading in the globe.
    const off = () => bus.send("earth", { t: "setOverlay", id: "similarity", url: null });
    off();
    const timers = [600, 1800, 4000].map((ms) => setTimeout(off, ms));
    return () => {
      timers.forEach(clearTimeout);
      const s = useApp.getState();
      const site = s.search?.mars.site ?? null;
      const mission = (s.search?.request as { mission?: string } | undefined)?.mission ?? null;
      const url = s.earthOverlays.similarity && site && mission && s.search?.tier1 ? api.similarityRasterUrl(site, mission) : null;
      bus.send("earth", { t: "setOverlay", id: "similarity", url, alpha: 0.92 });
    };
  }, [bus, stage]);

  // Matched altitude from the free area of both frames (smallest of the two), debounced so the
  // strip expanding re-frames once rather than on every measurement.
  const [height, setHeight] = useState<number | null>(null);
  const stageW = useCompareStage((s) => s.w);
  const stageH = useCompareStage((s) => s.h);
  useEffect(() => {
    if (!active || !targets || !stageW || !stageH) return;
    const t = setTimeout(() => {
      const W = stageW, H = stageH;
      const frameW = W < 768 ? W : W / 2;
      // Side drawers (Why this analog?) re-centre the globe but must not change the shared altitude.
      const free = (["mars", "earth"] as const).map((p) => Math.min(frameW, H - insets[p].top - insets[p].bottom));
      setHeight(matchedHeightKm(Math.max(targets.mars.km, targets.earth.km), H, Math.min(...free)));
    }, 220);
    return () => clearTimeout(t);
  }, [active, targets, insets, stageW, stageH]);

  const flown = useRef<string>("");
  const whyOpen = useApp((s) => s.whyOpen);
  useEffect(() => {
    if (!active || !targets || height === null) return;
    const { w: W, h: H } = useCompareStage.getState();
    // The Why drawer covers the right of the Earth half on desktop. The shell's inset model would read
    // a drawer that wide as a top/bottom cover, so the drawer does not mark itself as an occluder;
    // instead the Earth window is shifted left into the uncovered part by aiming east of it.
    const shiftPx = whyOpen && W >= 768 ? (whyDrawerWidth(W) + 12) / 2 : 0;
    const key = `${targets.mars.lat},${targets.mars.lon},${targets.earth.lat},${targets.earth.lon},${shiftPx}`;
    const prev = flown.current.split("|");
    // Re-fly on a new pair or drawer state, or when the needed altitude changes by more than 12 %.
    if (prev[0] === key && Math.abs(Number(prev[1]) - height) / height < 0.12) return;
    flown.current = `${key}|${height}`;
    const mpp = H > 0 ? (2 * height * 1000 * Math.tan(FOVY / 2)) / H : 0;
    const dLon = ((shiftPx * mpp) / (R_EARTH_MEAN_M * Math.max(Math.cos((targets.earth.lat * Math.PI) / 180), 0.05))) * (180 / Math.PI);
    bus.send("mars", { t: "flyTo", lat: targets.mars.lat, lon: targets.mars.lon, heightKm: height });
    bus.send("earth", { t: "flyTo", lat: targets.earth.lat, lon: normLon(targets.earth.lon + dLon), heightKm: height });
  }, [bus, active, targets, height, whyOpen]);

  useEffect(() => { if (stage !== "compare") flown.current = ""; }, [stage]);
  return null;
}
