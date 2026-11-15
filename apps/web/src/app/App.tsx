import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { GlobeFrame } from "../globes/GlobeFrame";
import type { GlobeToParent } from "../globes/protocol";
import { cx, Spinner } from "../components/ui";
import { useApp } from "../store/app";
import { GlobeBusProvider, useGlobeBus } from "./globeBus";
import { useGlobes } from "../store/globes";
import { LiveRegion, useEscapeToClose, useStageFocus } from "./a11y";
import { TopBar } from "./TopBar";
import { Intro } from "./Intro";
import { MarsControls } from "../features/explorer/MarsControls";
import { MarsGlobeSync } from "../features/explorer/MarsGlobeSync";
import { EarthGlobeSync } from "../features/analogs/EarthGlobeSync";
import { CompareGlobeSync } from "../features/comparison/CompareGlobeSync";
import { MarsInspector } from "../features/explorer/MarsInspector";
import { AnalogResults } from "../features/analogs/AnalogResults";
import { SearchContext } from "../features/analogs/SearchContext";
import { ComparisonPanel } from "../features/comparison/ComparisonPanel";
import { selectedCandidate } from "../features/analogs/candidates";
import { AltitudeReadout, CenterReadout, NavControls, Reticle, ScaleBar } from "../components/map/Instruments";
import { AnnotationLayer } from "../components/map/Annotations";
import { formatLat, formatLon } from "../lib/geodesy";

const EvidenceView = lazy(() => import("../features/evidence/EvidenceView"));
const ReportView = lazy(() => import("../features/report/ReportView"));

export function App() {
  return (
    <GlobeBusProvider>
      <Workspace />
    </GlobeBusProvider>
  );
}

function Workspace() {
  const bus = useGlobeBus();
  useEscapeToClose();
  useStageFocus();
  const mars = bus.handles.mars;
  const earth = bus.handles.earth;
  const s = useApp();
  const { stage, selection, search, candidateId, introOpen, leftOpen, rightOpen, set } = s;
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => { bus.send("mars", { t: "setLayer", layer: s.marsLayer }); }, [bus, s.marsLayer]);
  useEffect(() => { bus.send("earth", { t: "setLayer", layer: s.earthLayer }); }, [bus, s.earthLayer]);
  useEffect(() => { bus.send("mars", { t: "setSpin", on: introOpen }); }, [bus, introOpen]);

  // Globe frames publish every event onto the bus; the shell only keeps the hover readout.
  const onMars = useCallback((m: GlobeToParent) => {
    bus.emit("mars", m);
    if (m.t === "hover") useGlobes.getState().setHover(m.lat === null || m.lon === null ? null : { planet: "mars", lat: m.lat, lon: m.lon });
    else if (m.t === "error") console.warn("[mars globe]", m.message);
  }, [bus, set]);
  const onEarth = useCallback((m: GlobeToParent) => {
    bus.emit("earth", m);
    if (m.t === "hover") useGlobes.getState().setHover(m.lat === null || m.lon === null ? null : { planet: "earth", lat: m.lat, lon: m.lon });
    else if (m.t === "error") console.warn("[earth globe]", m.message);
  }, [bus, set]);

  const fullPage = stage === "evidence" || stage === "report";
  const split = stage === "compare";

  return (
    <div className="flex h-full flex-col">
      <LiveRegion />
      <MarsGlobeSync />
      <EarthGlobeSync />
      <CompareGlobeSync />
      <TopBar />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {/* Globe stage: both viewers stay mounted; layout and opacity change per workflow stage. */}
        <div className={cx("absolute inset-0 transition-[filter,opacity] duration-700", fullPage && "opacity-25 blur-sm")}>
          <div className={cx("absolute inset-y-0 left-0 transition-all duration-[900ms] ease-[var(--ease-out-soft)]",
            split ? "w-full md:w-1/2" : "w-full",
            stage === "mars" || split || (fullPage && s.previousStage === "mars") ? "opacity-100 scale-100" : "pointer-events-none scale-[0.86] opacity-0",
            split && "hidden md:block")}>
            <GlobeFrame ref={mars} planet="mars" onMessage={onMars} />
            {stage === "mars" && !introOpen && <Reticle planet="mars" />}
            {stage === "mars" && selection && (
              <AnnotationLayer planet="mars" items={[{ id: "sel", lat: selection.lat, lon: selection.lon, tone: "mars", content: (
                <div className="whitespace-nowrap"><div className="text-[13px] text-ink">{selection.label}</div>
                  <div className="num font-mono text-[10.5px] text-muted">{formatLat(selection.lat, 2)} {formatLon(selection.lon, 2)}</div></div>) }]} />
            )}
            {split && <GlobeLabel planet="mars" text={selection?.label ?? "Mars target"} />}
          </div>
          <div className={cx("absolute inset-y-0 right-0 transition-all duration-[900ms] ease-[var(--ease-out-soft)]",
            split ? "w-full md:w-1/2 md:border-l md:border-line/60" : "w-full",
            stage === "earth" || split || (fullPage && s.previousStage !== "mars") ? "opacity-100 scale-100" : "pointer-events-none scale-[1.08] opacity-0")}>
            <GlobeFrame ref={earth} planet="earth" onMessage={onEarth} />
            {split && <GlobeLabel planet="earth" text={current?.label ?? "Earth candidate"} />}
          </div>
        </div>

        {introOpen && stage === "mars" && <Intro onStart={() => set({ introOpen: false })} />}

        {!introOpen && (stage === "mars" || stage === "earth") && (
          <>
            <SidePanel side="left" open={leftOpen} onToggle={() => set({ leftOpen: !leftOpen })}>
              {stage === "mars" ? <MarsControls /> : <SearchContext />}
            </SidePanel>
            <SidePanel side="right" open={rightOpen} onToggle={() => set({ rightOpen: !rightOpen })}>
              {stage === "mars" ? <MarsInspector /> : <AnalogResults />}
            </SidePanel>
            <div className="no-print absolute bottom-4 z-10 hidden items-end gap-6 md:flex" style={{ left: leftOpen ? 332 : 60 }}>
              <ScaleBar planet={stage === "mars" ? "mars" : "earth"} />
              <AltitudeReadout planet={stage === "mars" ? "mars" : "earth"} />
              <CenterReadout planet={stage === "mars" ? "mars" : "earth"} />
            </div>
            <NavControls planet={stage === "mars" ? "mars" : "earth"} className="no-print absolute bottom-4 z-10 hidden md:flex" style={{ right: rightOpen ? 376 : 60 }} />
          </>
        )}

        {split && <ComparisonPanel />}

        {fullPage && (
          <div className="absolute inset-0 z-20 overflow-y-auto scroll-thin bg-space/80">
            <Suspense fallback={<div className="p-10"><Spinner label="Loading" /></div>}>
              {stage === "evidence" ? <EvidenceView /> : <ReportView />}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}

function GlobeLabel({ planet, text }: { planet: "mars" | "earth"; text: string }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-[12px]">
      <span className={cx("h-1.5 w-1.5 rounded-full", planet === "mars" ? "bg-mars" : "bg-earth")} />
      <span className={planet === "mars" ? "text-mars" : "text-earth"}>{planet === "mars" ? "Mars" : "Earth"}</span>
      <span className="text-ink/80">{text}</span>
    </div>
  );
}

function SidePanel({ side, open, onToggle, children }: { side: "left" | "right"; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const left = side === "left";
  const Icon = left ? (open ? PanelLeftClose : PanelLeftOpen) : open ? PanelRightClose : PanelRightOpen;
  return (
    <>
      <aside aria-label={left ? "Controls" : "Details"}
        className={cx(
          "panel no-print absolute z-10 flex flex-col overflow-hidden shadow-2xl shadow-black/40 transition-all duration-500 ease-[var(--ease-out-soft)]",
          // mobile: right panel becomes a bottom sheet; left panel is hidden behind its toggle
          left ? "inset-x-2 top-12 max-h-[60%] rounded-2xl md:inset-x-auto md:bottom-3 md:left-3 md:top-3 md:max-h-none md:w-[300px]"
               : "inset-x-0 bottom-0 max-h-[58%] rounded-t-2xl md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[348px] md:rounded-2xl",
          open ? "translate-x-0 opacity-100" : cx("pointer-events-none opacity-0", left ? "-translate-y-4 md:-translate-x-6 md:translate-y-0" : "translate-y-6 md:translate-x-6 md:translate-y-0"),
          left && !open && "invisible",
        )}>
        {children}
      </aside>
      <button onClick={onToggle} aria-label={`${open ? "Collapse" : "Expand"} ${left ? "controls" : "details"} panel`}
        className={cx("no-print panel absolute z-20 grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-ink transition-all duration-500",
          left ? (open ? "left-3 top-3 md:left-[316px]" : "left-3 top-3") : open ? "right-3 top-3 md:right-[364px]" : "bottom-3 right-3 md:bottom-auto md:top-3")}>
        <Icon className="h-4 w-4" />
      </button>
    </>
  );
}
