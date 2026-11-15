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
import { useHealth } from "../services/api";
import { GlobeBusProvider, useGlobeBus } from "./globeBus";
import { LiveRegion, useEscapeToClose, useStageFocus } from "./a11y";
import { useUrlState } from "./useUrlState";
import { useGlobeInsets } from "./useGlobeInsets";
import { useLayout } from "./useLayout";
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
  const marsLayer = useApp((s) => s.marsLayer);
  const earthLayer = useApp((s) => s.earthLayer);
  const graticule = useApp((s) => s.graticule);
  const set = useApp((s) => s.set);

  useEffect(() => { bus.send("mars", { t: "setLayer", layer: marsLayer }); }, [bus, marsLayer]);
  useEffect(() => { bus.send("earth", { t: "setLayer", layer: earthLayer }); }, [bus, earthLayer]);
  useEffect(() => { bus.send("mars", { t: "setGraticule", on: graticule }); bus.send("earth", { t: "setGraticule", on: graticule }); }, [bus, graticule]);
  useEffect(() => { bus.send("mars", { t: "setSpin", on: introOpen }); }, [bus, introOpen]);

  const onGlobe = useCallback((planet: Planet) => (m: GlobeToParent) => {
    bus.emit(planet, m);
    if (m.t === "hover") useGlobes.getState().setHover(m.lat === null || m.lon === null ? null : { planet, lat: m.lat, lon: m.lon });
    else if (m.t === "error") console.warn(`[${planet} globe]`, m.message);
  }, [bus]);
  const onMars = useMemo(() => onGlobe("mars"), [onGlobe]);
  const onEarth = useMemo(() => onGlobe("earth"), [onGlobe]);

  const fullPage = stage === "evidence" || stage === "report";
  const split = stage === "compare";
  const phone = layout === "phone";
  // On phones the comparison shows one planet at a time.
  const [phonePlanet, setPhonePlanet] = useState<Planet>("earth");
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
      <main ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* Globe stage: both viewers stay mounted; stages change layout and opacity only (no WebGL resize animation). */}
        <div className={cx("absolute inset-0 transition-opacity duration-500", fullPage && "opacity-35")}>
          <div ref={marsFrame} {...inert(!marsActive)}
            className={cx("absolute inset-y-0 left-0 transition-[opacity,transform] duration-[600ms] ease-[var(--ease-out-soft)]",
              split && !phone ? "w-1/2" : "w-full",
              introOpen && stage === "mars" && !phone && "md:translate-x-[16vw]",
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
          <>
            {/* Navigator capsule (top-left). */}
            <div className="no-print absolute left-3 right-3 top-3 z-30 sm:right-auto sm:w-[360px]">
              {stage === "mars" ? <MarsSearch /> : <EarthLayers />}
            </div>
            <Instruments planet={activePlanet} phone={phone} />
            <ContextSurface stage={stage} phone={phone} open={stage === "mars" ? !!selection : !!search}>
              {stage === "mars" ? <MarsInspector /> : <AnalogResults />}
            </ContextSurface>
          </>
        )}

        {split && (
          <>
            {phone && (
              <div role="radiogroup" aria-label="Planet" onKeyDown={radioGroupKeys<Planet>(["mars", "earth"], phonePlanet, setPhonePlanet)}
                className="surface no-print absolute left-1/2 top-3 z-20 flex -translate-x-1/2 rounded-full p-1">
                {(["mars", "earth"] as Planet[]).map((p) => (
                  <button key={p} role="radio" aria-checked={phonePlanet === p} tabIndex={phonePlanet === p ? 0 : -1} onClick={() => setPhonePlanet(p)}
                    className={cx("hit rounded-full px-4 py-1.5 text-label", phonePlanet === p ? (p === "mars" ? "bg-mars text-space" : "bg-earth text-space") : "text-muted")}>
                    {p === "mars" ? "Mars" : "Earth"}
                  </button>
                ))}
              </div>
            )}
            <ComparisonPanel />
          </>
        )}

        {fullPage && (
          <div className="absolute inset-0 z-20 overflow-y-auto scroll-thin bg-space/95">
            <Suspense fallback={<div className="p-10"><Spinner label="Loading" /></div>}>
              {stage === "evidence" ? <EvidenceView /> : <ReportView />}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}

/** Right-hand context surface on desktop/tablet; bottom sheet on phones. Enters and leaves along its own edge. */
function ContextSurface({ stage, phone, open, children }: { stage: "mars" | "earth"; phone: boolean; open: boolean; children: React.ReactNode }) {
  const [snap, setSnap] = useState<SheetSnap>("half");
  useEffect(() => { if (open) setSnap("half"); }, [open, stage]);
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
          className="no-print pointer-events-none absolute bottom-3 right-3 top-3 z-20 flex w-[min(380px,calc(100%-24px))] flex-col">
          {/* The aside keeps the full-height box (globe framing uses it); the surface itself is sized to
              its content and capped at the stage, so it appears only as tall as what it has to say. */}
          <div className="surface pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-surface">
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
  if (phone) {
    return <NavControls planet={planet} className="no-print absolute right-3 top-[68px] z-10" />;
  }
  return (
    <>
      {/* A small dark backing keeps the readouts legible over bright terrain without becoming a surface. */}
      <div className="no-print on-imagery pointer-events-none absolute z-10 flex items-end gap-6 rounded-[10px] bg-[rgb(5_7_10/0.5)] px-3 py-2 transition-[left,bottom] duration-300"
        style={{ left: ins.left + 12, bottom: ins.bottom + 24 }}>
        <ScaleBar planet={planet} />
        <AltitudeReadout planet={planet} />
        <CenterReadout planet={planet} className="hidden lg:flex" />
      </div>
      <NavControls planet={planet} className="no-print absolute z-10 transition-[right,bottom] duration-300" style={{ right: ins.right + 16, bottom: ins.bottom + 34 }} />
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
