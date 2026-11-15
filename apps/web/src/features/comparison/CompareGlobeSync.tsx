import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { selectedCandidate } from "../analogs/candidates";
import { destination, R_EARTH_MEAN_M, R_MARS_M } from "../../lib/geodesy";
import { OBLIQUE_PITCH_DEG, flightPitchDeg } from "../../globes/camera";
import { aimEastForShift, type CompareSide, type ComparedSquare, type HalfFrame, matchedDepthKm } from "./framing";
import { useCompareFraming, useCompareStage, WHY_SLIVER_MARGIN_PX, whyLayout } from "./layout";
import { type CompareTargets, compareTargets } from "./model";
import type { Planet } from "../../globes/protocol";

const PLANETS = ["mars", "earth"] as const;

/** The compared square on a planet, on the sphere its globe draws it on. */
function squareOf(planet: Planet, targets: CompareTargets): ComparedSquare {
  const t = planet === "mars" ? targets.mars : targets.earth;
  return { lat: t.lat, lon: t.lon, km: t.km, radiusM: planet === "mars" ? R_MARS_M : R_EARTH_MEAN_M };
}

/** One half's globe canvas: half the stage on desktop and tablet, all of it on phones (one planet at a time). */
function halfFrame(planet: Planet): HalfFrame {
  const { w: W, h: H } = useCompareStage.getState();
  return { w: W < 768 ? W : W / 2, h: H, insets: useGlobes.getState().insets[planet] };
}

/** Pitch both halves fly to: oblique with the 3D preference on (while the framing is site-scale), else straight down. */
function sharedPitch(depthKm: number, tilt: boolean): number {
  return PLANETS.every((p) => flightPitchDeg(p, depthKm, tilt) === OBLIQUE_PITCH_DEG) ? OBLIQUE_PITCH_DEG : -90;
}

/**
 * Where a globe aims to show its compared window. The Why drawer covers the right of the Earth half on
 * desktop. The shell's inset model would read a drawer that wide as a top/bottom cover, so the drawer
 * does not mark itself as an occluder; instead the Earth window is shifted left into the uncovered part
 * by aiming east of it — by as much as moves the window, as projected for the shared pitch, into the middle
 * of that room. When there is too little room for that, the brief takes the whole Earth half and the window
 * stays centred.
 */
function aimAt(planet: Planet, targets: CompareTargets, depthKm: number, pitchDeg: number, whyOpen: boolean): { lat: number; lon: number } {
  const sq = squareOf(planet, targets);
  if (planet === "mars") return { lat: sq.lat, lon: sq.lon };
  const { w: W, h: H } = useCompareStage.getState();
  const shiftPx = whyOpen && W >= 768 ? whyLayout(W).earthShiftPx : 0;
  if (!shiftPx || !(H > 0)) return { lat: sq.lat, lon: sq.lon };
  const east = aimEastForShift(sq, depthKm, pitchDeg, halfFrame("earth"), shiftPx);
  return destination(sq.lat, sq.lon, 90, east, sq.radiusM);
}

/**
 * In the comparison stage: draw the compared footprint (the 50 km research window, or the 25 km
 * screening cell) on both planets with identical styling, and fly both globes to the same distance and the
 * same pitch — both in the 3D view when the shared 3D preference is on, both straight down when it is off —
 * so the footprints sit in the free area above the strip at matched ground scale.
 */
export function CompareGlobeSync() {
  const bus = useGlobeBus();
  const stage = useApp((s) => s.stage);
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const insets = useGlobes((s) => s.insets);
  const tilt = useGlobes((s) => s.tilt);
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
  // comparing, and shown again — exactly as their own syncs keep them — on the way out.
  useEffect(() => {
    if (!active) return;
    const show = (on: boolean) => {
      bus.send("mars", { t: "setGroupShown", kind: "footprints", group: "aoi", on });
      bus.send("mars", { t: "setGroupShown", kind: "footprints", group: "zones", on });
      bus.send("earth", { t: "setGroupShown", kind: "footprints", group: "cand", on });
    };
    show(false);
    return () => show(true);
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

  // The shared framing — one camera distance and one pitch for both halves, and the Why-brief shift — from the
  // free area of both frames (smallest of the two), measured on the compared squares as projected for that
  // pitch. Debounced, so the strip expanding or the drawer opening re-frames once rather than on every
  // measurement, and so a pitch change is flown once, at the distance measured for it.
  const [plan, setPlan] = useState<{ depth: number; pitch: number; why: boolean; shiftPx: number } | null>(null);
  const stageW = useCompareStage((s) => s.w);
  const stageH = useCompareStage((s) => s.h);
  const whyOpen = useApp((s) => s.whyOpen);
  useEffect(() => {
    if (!active || !targets || !stageW || !stageH) return;
    const t = setTimeout(() => {
      // Side drawers (Why this analog?) re-centre the globe but do not change the shared distance, except
      // that the Earth window must fit the room the brief leaves beside it (tall stages, where FILL of the
      // half would be wider than that room); then both planets go up together, so the scales still match.
      const why = whyOpen && stageW >= 768 ? whyLayout(stageW) : null;
      const sides: CompareSide[] = PLANETS.map((p) => ({
        square: squareOf(p, targets), frame: halfFrame(p),
        capPx: p === "earth" && why?.beside ? why.sliverPx - 2 * WHY_SLIVER_MARGIN_PX : undefined,
      }));
      const oblique = tilt ? matchedDepthKm(sides, OBLIQUE_PITCH_DEG) : null;
      // A framing too wide for the oblique approach is flown straight down by the globes: measure it that way.
      const depth = oblique !== null && sharedPitch(oblique, true) === OBLIQUE_PITCH_DEG ? oblique : matchedDepthKm(sides, -90);
      setPlan({ depth, pitch: oblique !== null && depth === oblique ? OBLIQUE_PITCH_DEG : -90, why: whyOpen, shiftPx: why?.earthShiftPx ?? 0 });
    }, 220);
    return () => clearTimeout(t);
  }, [active, targets, insets, stageW, stageH, whyOpen, tilt]);

  /** Fly one half to its window at the shared distance and pitch (the pitch is passed, not left to each globe). */
  const flyHalf = (p: Planet, t: CompareTargets, f: NonNullable<typeof plan>) => {
    bus.send(p, { t: "flyTo", ...aimAt(p, t, f.depth, f.pitch, f.why), heightKm: f.depth, tilt: f.pitch === OBLIQUE_PITCH_DEG });
  };

  const flown = useRef<string>("");
  useEffect(() => {
    if (!active || !targets || plan === null) return;
    const key = `${targets.mars.lat},${targets.mars.lon},${targets.earth.lat},${targets.earth.lon},${plan.shiftPx},${plan.pitch}`;
    const prev = flown.current.split("|");
    // Re-fly on a new pair, drawer state or pitch, or when the needed distance changes by more than 12 %.
    if (prev[0] === key && Math.abs(Number(prev[1]) - plan.depth) / plan.depth < 0.12) return;
    flown.current = `${key}|${plan.depth}`;
    for (const p of PLANETS) flyHalf(p, targets, plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, active, targets, plan]);

  // A half's Frame control: fly that globe back to its window at the matched distance, even when nothing
  // else changed (the user zoomed or panned it away), so both ground scales agree again.
  const framing = useCompareFraming();
  const lastFraming = useRef(framing);
  useEffect(() => {
    const prev = lastFraming.current;
    lastFraming.current = framing;
    if (!active || !targets || plan === null) return;
    for (const p of PLANETS) {
      if (framing[p] !== prev[p]) flyHalf(p, targets, plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, active, targets, plan, framing]);

  useEffect(() => { if (stage !== "compare") flown.current = ""; }, [stage]);
  return null;
}
