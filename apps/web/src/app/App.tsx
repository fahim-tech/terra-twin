import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { GlobeFrame } from "../globes/GlobeFrame";
import type { GlobeToParent, Planet } from "../globes/protocol";
import { cx, Spinner } from "../components/ui";
import { radioGroupKeys, SPRING } from "../components/primitives";
import { Sheet, type SheetSnap } from "../components/Sheet";
import { AltitudeReadout, CenterReadout, NavControls, Reticle, ScaleBar } from "../components/map/Instruments";
import { useApp } from "../store/app";
import { useGlobes } from "../store/globes";
import { usePhonePlanet } from "../store/phone";
import { useHealth } from "../services/api";
import { GlobeBusProvider, useGlobeBus } from "./globeBus";
import { LiveRegion, useEscapeToClose, useStageFocus } from "./a11y";
import { useUrlState } from "./useUrlState";
import { useGlobeInsets } from "./useGlobeInsets";
import { useLandscapePhone, useLayout } from "./useLayout";
import { useGlobeSources } from "./globeSources";
import { TopBar } from "./TopBar";
import { Intro } from "./Intro";
import { MarsSearch } from "../features/explorer/MarsSearch";
import { MarsInspector } from "../features/explorer/MarsInspector";
import { MarsOverlay } from "../features/explorer/MarsOverlay";
import { MarsGlobeSync } from "../features/explorer/MarsGlobeSync";
import { EarthLayers } from "../features/analogs/EarthLayers";
import { AnalogResults } from "../features/analogs/AnalogResults";
import { EarthGlobeSync } from "../features/analogs/EarthGlobeSync";
import { ComparisonPanel } from "../features/comparison/ComparisonPanel";
import { CompareGlobeSync } from "../features/comparison/CompareGlobeSync";

const EvidenceView = lazy(() => import("../features/evidence/EvidenceView"));
const ReportView = lazy(() => import("../features/report/ReportView"));

/**
 * Where the Mars frame sits while the intro is open: right of the copy in landscape from 768 px, raised
 * above it in portrait (phones and portrait tablets). Intro.tsx sizes its column against these offsets.
 * Tailwind v4 translate utilities set the CSS `translate` property (not `transform`), so the frame's
 * transition lists `translate`: the planet glides back to centre when the intro closes.
 */
const INTRO_POSE = "portrait:-translate-y-[24%] portrait:md:-translate-y-[20%] landscape:md:translate-x-[20vw] landscape:xl:translate-x-[16vw]";

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <GlobeBusProvider>
        <Workspace />
      </GlobeBusProvider>
    </MotionConfig>
  );
}

function Workspace() {
  const bus = useGlobeBus();
  useEscapeToClose();
  useStageFocus();
  useUrlState();
  const layout = useLayout();
  const landscapePhone = useLandscapePhone();
  const stageRef = useRef<HTMLElement>(null);
  const marsFrame = useRef<HTMLDivElement>(null);
  const earthFrame = useRef<HTMLDivElement>(null);
  const frames = useMemo(() => ({ mars: marsFrame, earth: earthFrame }), []);
  useGlobeInsets(stageRef, frames);

  const stage = useApp((s) => s.stage);
  const previousStage = useApp((s) => s.previousStage);
  const introOpen = useApp((s) => s.introOpen);
  const selection = useApp((s) => s.selection);
  const search = useApp((s) => s.search);
  const liveRunId = useApp((s) => s.liveRunId);
  const marsLayer = useApp((s) => s.marsLayer);
  const earthLayer = useApp((s) => s.earthLayer);
  const graticule = useApp((s) => s.graticule);
  const set = useApp((s) => s.set);

  useEffect(() => { bus.send("mars", { t: "setLayer", layer: marsLayer }); }, [bus, marsLayer]);
  useEffect(() => { bus.send("earth", { t: "setLayer", layer: earthLayer }); }, [bus, earthLayer]);
  useEffect(() => { bus.send("mars", { t: "setGraticule", on: graticule }); bus.send("earth", { t: "setGraticule", on: graticule }); }, [bus, graticule]);
  useEffect(() => { bus.send("mars", { t: "setSpin", on: introOpen }); }, [bus, introOpen]);

  // Printing: blur the focused control first, so an open glossary popover closes (index.css also hides any).
  useEffect(() => {
    const onPrint = () => (document.activeElement as HTMLElement | null)?.blur?.();
    window.addEventListener("beforeprint", onPrint);
    return () => window.removeEventListener("beforeprint", onPrint);
  }, []);

  const onGlobe = useCallback((planet: Planet) => (m: GlobeToParent) => {
    bus.emit(planet, m);
    // What the globe draws (ion tiles or NASA imagery, and its layer notes): imagery credits are built from it.
    if (m.t === "ready") useGlobeSources.getState().setSource(planet, { mode: m.mode, layers: m.layers });
    if (m.t === "hover") useGlobes.getState().setHover(m.lat === null || m.lon === null ? null : { planet, lat: m.lat, lon: m.lon });
    else if (m.t === "error") console.warn(`[${planet} globe]`, m.message);
  }, [bus]);
  const onMars = useMemo(() => onGlobe("mars"), [onGlobe]);
  const onEarth = useMemo(() => onGlobe("earth"), [onGlobe]);

  const fullPage = stage === "evidence" || stage === "report";
  const split = stage === "compare";
  const phone = layout === "phone";
  // On phones the comparison shows one planet at a time.
  // One value shared with the 3D relief's own Mars / Earth switch (store/phone.ts), so both always agree.
  const phonePlanet = usePhonePlanet((s) => s.planet);
  const setPhonePlanet = usePhonePlanet((s) => s.setPlanet);
  const marsShown = stage === "mars" || (split && (!phone || phonePlanet === "mars")) || (fullPage && previousStage === "mars");
  const earthShown = stage === "earth" || (split && (!phone || phonePlanet === "earth")) || (fullPage && previousStage !== "mars");
  const marsActive = !fullPage && marsShown;
  const earthActive = !fullPage && earthShown;
  const activePlanet: Planet = stage === "mars" ? "mars" : "earth";

  const startJezero = () => {
    set({ introOpen: false });
    useApp.getState().select({ lat: 17.67557431706733, lon: 77.01274064381283, siteId: "Jezero", label: "Jezero" });
  };

  return (
    <div className="flex h-full flex-col">
      <LiveRegion />
      <MarsGlobeSync />
      <EarthGlobeSync />
      <CompareGlobeSync />
      <TopBar compact={phone} />
      <StatusBanner />
      {/* overflow-clip, not hidden: a clip box is not a scroll container, so focus moving into the translated
          intro globe (Cesium's credit link) can never scroll the stage sideways and strand the intro off-screen. */}
      <main ref={stageRef} className="relative min-h-0 flex-1 overflow-clip">
        {/* Globe stage: both viewers stay mounted; stages change layout and opacity only (no WebGL resize animation).
            Full pages (Evidence, Report) hide it entirely (spec §15), so no globe or Cesium credit shows under the text. */}
        <div aria-hidden={fullPage || undefined} className={cx("absolute inset-0 overflow-clip transition-opacity duration-500", fullPage && "pointer-events-none opacity-0")}>
          <div ref={marsFrame} {...inert(!marsActive)}
            className={cx("absolute inset-y-0 left-0 transition-[opacity,translate] duration-[600ms] ease-[var(--ease-out-soft)]",
              split && !phone ? "w-1/2" : "w-full",
              introOpen && stage === "mars" && INTRO_POSE,
              marsShown ? "opacity-100" : "pointer-events-none opacity-0")}>
            <GlobeFrame planet="mars" ref={bus.handles.mars} onMessage={onMars} />
            {stage === "mars" && !introOpen && <Reticle planet="mars" />}
            {stage === "mars" && !introOpen && <MarsOverlay />}
          </div>
          <div ref={earthFrame} {...inert(!earthActive)}
            className={cx("absolute inset-y-0 right-0 transition-opacity duration-[600ms]",
              split && !phone ? "w-1/2 border-l border-line" : "w-full",
              earthShown ? "opacity-100 delay-200" : "pointer-events-none opacity-0")}>
            <GlobeFrame planet="earth" ref={bus.handles.earth} onMessage={onEarth} />
            {stage === "earth" && <Reticle planet="earth" />}
          </div>
        </div>

        <AnimatePresence>
          {introOpen && stage === "mars" && (
            <motion.div key="intro" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Intro onStart={() => set({ introOpen: false })} onJezero={startJezero} />
            </motion.div>
          )}
        </AnimatePresence>

        {!introOpen && (stage === "mars" || stage === "earth") && (
          // Stage chrome enters in step with its globe: the Earth frame fades in after a 200 ms delay over
          // 600 ms, so Earth panels wait until that planet is half up instead of sitting over the Mars view.
          <motion.div key={stage} className="pointer-events-none absolute inset-0 z-20"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: stage === "earth" ? 0.45 : 0.12 }}>
            {/* Navigator capsule (top-left). */}
            <div className="chrome-scale no-print pointer-events-auto absolute left-3 right-3 top-3 z-30 sm:right-auto sm:w-[360px]">
              {stage === "mars" ? <MarsSearch /> : <EarthLayers />}
            </div>
            <Instruments planet={activePlanet} phone={phone} />
            <ContextSurface stage={stage} phone={phone} side={landscapePhone} open={stage === "mars" ? !!selection : !!search || !!liveRunId}>
              {stage === "mars" ? <MarsInspector /> : <AnalogResults />}
            </ContextSurface>
          </motion.div>
        )}

        {split && (
          <>
            {phone && (
              // Named "Globe" so it is never mistaken for a panel's own Mars / Earth switch (the relief view has one).
              <div className="no-print absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2">
                <span aria-hidden className="kicker on-imagery text-[10px]">Globe</span>
                <div role="radiogroup" aria-label="Globe shown" onKeyDown={radioGroupKeys<Planet>(["mars", "earth"], phonePlanet, setPhonePlanet)}
                  className="surface flex divide-x divide-line-strong rounded-control">
                  {(["mars", "earth"] as Planet[]).map((p) => (
                    <button key={p} role="radio" aria-checked={phonePlanet === p} tabIndex={phonePlanet === p ? 0 : -1} onClick={() => setPhonePlanet(p)}
                      className={cx("hit label-caps flex items-center gap-2 px-4 py-1.5 transition-colors active:duration-0 focus-visible:outline-offset-[-3px]",
                        phonePlanet === p ? "bg-ink text-space active:bg-ink/80" : "text-muted hover:text-ink active:bg-white/[0.12]")}>
                      <span aria-hidden className={cx("h-1.5 w-1.5", p === "mars" ? "bg-mars" : "bg-earth")} />
                      {p === "mars" ? "Mars" : "Earth"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ComparisonPanel />
          </>
        )}

        {fullPage && (
          <div className="absolute inset-0 z-20 overflow-y-auto scroll-thin bg-space">
            {/* Scroll-edge fade: text leaving the top dissolves into the rail instead of showing cut glyph fragments. */}
            <div aria-hidden className="no-print pointer-events-none sticky top-0 z-10 -mb-8 h-8 bg-gradient-to-b from-space to-transparent" />
            <Suspense fallback={<div className="p-10"><Spinner label="Loading" /></div>}>
              {stage === "evidence" ? <EvidenceView /> : <ReportView />}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Right-hand context surface on desktop/tablet; bottom sheet on phones; on a phone held sideways, a right-hand
 * side sheet the stage's full height, where the whole panel scrolls as one column and only its footer command
 * stays docked (PanelBody / PanelFooter read `.side-sheet`). Enters and leaves along its own edge.
 */
function ContextSurface({ stage, phone, side, open, children }: { stage: "mars" | "earth"; phone: boolean; side: boolean; open: boolean; children: React.ReactNode }) {
  const [snap, setSnap] = useState<SheetSnap>("half");
  useEffect(() => { if (open) setSnap("half"); }, [open, stage]);
  if (phone && side) {
    return (
      <AnimatePresence>
        {open && (
          <motion.aside key={stage} aria-label={stage === "mars" ? "Selected location" : "Earth analogs"} data-occludes={stage}
            initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={SPRING}
            className="side-sheet no-print pointer-events-none absolute bottom-2 right-2 top-2 z-20 flex w-[min(380px,46%)] flex-col [padding-right:env(safe-area-inset-right)]">
            <div className="surface frame scroll-thin pointer-events-auto block max-h-full min-h-0 overflow-y-auto overscroll-contain rounded-surface [&>*]:!h-auto">
              {children}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    );
  }
  if (phone) {
    return open ? (
      <div className="no-print pointer-events-none absolute inset-0 z-20 [&>section]:pointer-events-auto">
        <Sheet occludes={stage} label={stage === "mars" ? "Selected location" : "Earth analogs"} snap={snap} onSnapChange={setSnap}>
          <div className="flex h-full flex-col">{children}</div>
        </Sheet>
      </div>
    ) : null;
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.aside key={stage} aria-label={stage === "mars" ? "Selected location" : "Earth analogs"} data-occludes={stage}
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={SPRING}
          className="chrome-scale no-print pointer-events-none absolute bottom-3 right-3 top-3 z-20 flex w-[min(380px,calc(100%-24px))] flex-col">
          {/* The aside keeps the full-height box (globe framing uses it); the surface itself is sized to
              its content and capped at the stage, so it appears only as tall as what it has to say. */}
          <div className="surface frame pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-surface">
            {children}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Scale, altitude and centre (bottom-left) and navigation (bottom-right), placed inside the free area. */
function Instruments({ planet, phone }: { planet: Planet; phone: boolean }) {
  const ins = useGlobes((s) => s.insets[planet]);
  // The clusters follow the free area as panels open and sheets move, but never slide in from the previous
  // stage's insets: the first moments after mounting (a stage change) place them without a transition.
  const [settled, setSettled] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setSettled(true), 900); return () => clearTimeout(t); }, []);
  const glide = settled ? "transition-[left,right,bottom] duration-300" : "";
  if (phone) {
    // Spec §7: phones keep the scale bar and the nav controls. The scale bar sits just above whatever
    // covers the bottom of the globe (sheet peek, comparison strip), as measured by the insets; the nav
    // stack stays left of a side sheet (landscape phones).
    return (
      <>
        <div className={cx("no-print on-imagery pointer-events-none absolute z-10 bg-[rgb(2_3_4/0.55)] px-2 py-1.5", glide)}
          style={{ left: ins.left + 12, bottom: ins.bottom + 12 }}>
          <ScaleBar planet={planet} maxPx={88} />
        </div>
        <NavControls planet={planet} className={cx("no-print pointer-events-auto absolute top-[68px] z-10 short:top-3", glide)} style={{ right: ins.right + 12 }} />
      </>
    );
  }
  // Both clusters rest on one baseline, 24 px above the free area's bottom edge.
  return (
    <>
      {/* A small dark backing keeps the readouts legible over bright terrain without becoming a surface. */}
      <div className={cx("chrome-scale no-print on-imagery frame pointer-events-none absolute z-10 flex items-end gap-6 bg-[rgb(2_3_4/0.55)] px-3.5 py-2.5 [--frame-l:6px]", glide)}
        style={{ left: ins.left + 12, bottom: ins.bottom + 24 }}>
        <ScaleBar planet={planet} />
        <AltitudeReadout planet={planet} />
        <CenterReadout planet={planet} className="hidden lg:flex" />
      </div>
      <NavControls planet={planet} className={cx("chrome-scale no-print pointer-events-auto absolute z-10", glide)} style={{ right: ins.right + 16, bottom: ins.bottom + 24 }} />
    </>
  );
}

function StatusBanner() {
  const health = useHealth();
  const imagery = useGlobes((s) => s.imagery);
  const recent = (["mars", "earth"] as Planet[]).find((p) => imagery[p] && Date.now() - imagery[p]!.at < 30_000);
  if (!health.isError && !recent) return null;
  return (
    <div role="alert" className="no-print relative z-30 flex items-center justify-center gap-3 bg-bad/15 px-4 py-1.5 text-caption text-ink">
      {health.isError
        ? <>The scientific API is not reachable — measurements and searches are unavailable. <button className="underline" onClick={() => health.refetch()}>Retry</button></>
        : <>Some {recent === "mars" ? "Mars" : "Earth"} imagery tiles failed to load (NASA tile service). Measurements are unaffected.</>}
    </div>
  );
}

/** `inert` removes hidden UI from the tab order and accessibility tree (React 18 needs the string form). */
function inert(on: boolean): Record<string, string> {
  return on ? { inert: "" } : {};
}
