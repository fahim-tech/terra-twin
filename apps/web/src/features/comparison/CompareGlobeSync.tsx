import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { selectedCandidate } from "../analogs/candidates";
import { normLon, R_EARTH_MEAN_M } from "../../lib/geodesy";
import { FOVY, matchedHeightKm } from "./framing";
import { useCompareStage, WHY_SLIVER_MARGIN_PX, whyLayout } from "./layout";
import { compareTargets } from "./model";

export { COMPARE_HEIGHT_KM, matchedHeightKm } from "./framing";

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

  // Only the compared footprints may be drawn: the explorer's AOI and the research-zone outlines (Mars,
  // unlabelled orange lines that cross the half whenever the camera sits high enough to reach a zone
  // edge) and the results' candidate footprint (Earth, a filled cell for tier 1) are hidden while
  // comparing. Local workaround until the globe protocol can hide a group by stage: clear those groups
  // here, after the owning syncs have run, and put the Mars AOI and zone outlines back on the way out
  // (the Earth results sync re-sends its footprint itself when the stage changes).
  const sites = useSites();
  const sitesRef = useRef(sites.data);
  sitesRef.current = sites.data;
  const selection = useApp((s) => s.selection);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      bus.send("mars", { t: "setFootprints", group: "aoi", footprints: [] });
      bus.send("mars", { t: "setFootprints", group: "zones", footprints: [] });
      bus.send("earth", { t: "setFootprints", group: "cand", footprints: [] });
    }, 0);
    return () => clearTimeout(t);
  }, [bus, active, targets, selection, sites.data]);
  useEffect(() => {
    if (!active) return;
    return () => {
      const all = sitesRef.current;
      // The zones layer exactly as the explorer draws it (MarsGlobeSync: every zone's bbox, faint).
      if (all) {
        bus.send("mars", {
          t: "setFootprints", group: "zones",
          footprints: all.map((x) => ({ id: x.id, kind: "research_bbox" as const, lat: x.lat, lon: x.lon, bbox: [x.bbox.lon_min, x.bbox.lat_min, x.bbox.lon_max, x.bbox.lat_max] as [number, number, number, number] })),
        });
      }
      const { selection: sel, footprintKm } = useApp.getState();
      if (!sel) return;
      const site = all?.find((x) => x.id === sel.siteId);
      bus.send("mars", {
        t: "setFootprints", group: "aoi", footprints: [
          { id: "aoi", kind: "aoi", lat: sel.lat, lon: sel.lon, km: footprintKm },
          ...(site ? [{ id: "ez", kind: "research_bbox" as const, lat: site.lat, lon: site.lon, bbox: [site.bbox.lon_min, site.bbox.lat_min, site.bbox.lon_max, site.bbox.lat_max] as [number, number, number, number] }] : []),
        ],
      });
    };
  }, [bus, active]);

  // The global-screen similarity field is a different basis (tier 1, as measured); EarthGlobeSync keeps
  // it off while comparing. Clear it here too in case a raster requested just before entering is still
  // loading in the globe.
  useEffect(() => {
    if (stage !== "compare") return;
    const off = () => bus.send("earth", { t: "setOverlay", id: "similarity", url: null });
    off();
    const timers = [600, 1800, 4000].map((ms) => setTimeout(off, ms));
    return () => timers.forEach(clearTimeout);
  }, [bus, stage]);

  // Matched altitude from the free area of both frames (smallest of the two), debounced so the
  // strip expanding re-frames once rather than on every measurement.
  const [height, setHeight] = useState<number | null>(null);
  const stageW = useCompareStage((s) => s.w);
  const stageH = useCompareStage((s) => s.h);
  const whyOpen = useApp((s) => s.whyOpen);
  useEffect(() => {
    if (!active || !targets || !stageW || !stageH) return;
    const t = setTimeout(() => {
      const W = stageW, H = stageH;
      const frameW = W < 768 ? W : W / 2;
      // Side drawers (Why this analog?) re-centre the globe but do not change the shared altitude, except
      // that the Earth window must fit the room the brief leaves beside it (tall stages, where FILL of the
      // half would be wider than that room); then both planets go up together, so the scales still match.
      const free = (["mars", "earth"] as const).map((p) => Math.min(frameW, H - insets[p].top - insets[p].bottom));
      const why = whyOpen && W >= 768 ? whyLayout(W) : null;
      const cap = why?.beside ? why.sliverPx - 2 * WHY_SLIVER_MARGIN_PX : Infinity;
      setHeight(matchedHeightKm(Math.max(targets.mars.km, targets.earth.km), H, Math.min(...free), cap));
    }, 220);
    return () => clearTimeout(t);
  }, [active, targets, insets, stageW, stageH, whyOpen]);

  const flown = useRef<string>("");
  useEffect(() => {
    if (!active || !targets || height === null) return;
    const { w: W, h: H } = useCompareStage.getState();
    // The Why drawer covers the right of the Earth half on desktop. The shell's inset model would read
    // a drawer that wide as a top/bottom cover, so the drawer does not mark itself as an occluder;
    // instead the Earth window is shifted left into the uncovered part by aiming east of it. When there
    // is too little room for that, the brief takes the whole Earth half and the window stays centred.
    const shiftPx = whyOpen && W >= 768 ? whyLayout(W).earthShiftPx : 0;
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
