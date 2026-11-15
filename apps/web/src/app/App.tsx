import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react";
import { GlobeFrame, type GlobeHandle } from "../globes/GlobeFrame";
import type { GlobeMarker, GlobeToParent } from "../globes/protocol";
import { cx, Spinner } from "../components/ui";
import { formatLat, formatLon } from "../lib/geodesy";
import { useEarthSites, useSites } from "../services/api";
import { useApp } from "../store/app";
import { TopBar } from "./TopBar";
import { Intro } from "./Intro";
import { MarsControls, siteContaining } from "../features/explorer/MarsControls";
import { MarsInspector } from "../features/explorer/MarsInspector";
import { AnalogResults } from "../features/analogs/AnalogResults";
import { SearchContext } from "../features/analogs/SearchContext";
import { ComparisonPanel } from "../features/comparison/ComparisonPanel";
import { candidateList, selectedCandidate } from "../features/analogs/candidates";

const EvidenceView = lazy(() => import("../features/evidence/EvidenceView"));
const ReportView = lazy(() => import("../features/report/ReportView"));

export function App() {
  const mars = useRef<GlobeHandle>(null);
  const earth = useRef<GlobeHandle>(null);
  const s = useApp();
  const { stage, selection, footprintKm, search, candidateId, introOpen, leftOpen, rightOpen, set, select } = s;
  const sites = useSites();
  const earthSites = useEarthSites();

  // ---------------- Mars globe state
  useEffect(() => {
    if (!sites.data) return;
    mars.current?.send({ t: "setMarkers", group: "sites", markers: sites.data.map((x) => ({ id: `site:${x.id}`, lat: x.lat, lon: x.lon, kind: "research_site", label: x.name })) });
  }, [sites.data]);

  useEffect(() => {
    const g = mars.current;
    if (!g) return;
    if (!selection) {
      g.send({ t: "setMarkers", group: "selection", markers: [] });
      g.send({ t: "setFootprints", group: "aoi", footprints: [] });
      g.send({ t: "select", id: null });
      return;
    }
    g.send({ t: "setMarkers", group: "selection", markers: [{ id: "selection", lat: selection.lat, lon: selection.lon, kind: "selection", label: selection.label }] });
    const site = sites.data?.find((x) => x.id === selection.siteId);
    g.send({
      t: "setFootprints", group: "aoi", footprints: [
        { id: "aoi", kind: "aoi", lat: selection.lat, lon: selection.lon, km: footprintKm },
        ...(site ? [{ id: "ez", kind: "research_bbox" as const, lat: site.lat, lon: site.lon, bbox: [site.bbox.lon_min, site.bbox.lat_min, site.bbox.lon_max, site.bbox.lat_max] as [number, number, number, number] }] : []),
      ],
    });
    g.send({ t: "select", id: selection.siteId ? `site:${selection.siteId}` : "selection" });
  }, [selection, footprintKm, sites.data]);

  useEffect(() => {
    if (selection) mars.current?.send({ t: "flyTo", lat: selection.lat, lon: selection.lon, heightKm: Math.max(1100, footprintKm * 30) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  useEffect(() => { mars.current?.send({ t: "setLayer", layer: s.marsLayer }); }, [s.marsLayer]);
  useEffect(() => { earth.current?.send({ t: "setLayer", layer: s.earthLayer }); }, [s.earthLayer]);
  useEffect(() => { mars.current?.send({ t: "setSpin", on: introOpen }); }, [introOpen]);

  // ---------------- Earth globe state
  const cands = useMemo(() => candidateList(search), [search]);
  const current = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  useEffect(() => {
    if (!earthSites.data) return;
    earth.current?.send({
      t: "setMarkers", group: "reference", markers: earthSites.data.map((x) => ({
        id: `ref:${x.id}`, lat: x.lat, lon: x.lon, kind: x.category === "negative_control" ? "control" : "reference", label: x.name,
      })),
    });
  }, [earthSites.data]);

  useEffect(() => {
    const g = earth.current;
    if (!g) return;
    const markers: GlobeMarker[] = cands.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, kind: c.tier === 2 ? "leader" : "candidate", label: c.label, rank: c.tier === 1 ? c.rank : undefined }));
    g.send({ t: "setMarkers", group: "candidates", markers });
  }, [cands]);

  useEffect(() => {
    const g = earth.current;
    if (!g) return;
    if (!current) {
      g.send({ t: "setFootprints", group: "cand", footprints: [] });
      g.send({ t: "select", id: null });
      return;
    }
    g.send({ t: "select", id: current.id });
    g.send({
      t: "setFootprints", group: "cand", footprints: [current.tier === 1 && current.bbox
        ? { id: current.id, kind: "cell", lat: current.lat, lon: current.lon, bbox: current.bbox }
        : { id: current.id, kind: "window", lat: current.lat, lon: current.lon, km: 50 }],
    });
    if (stage === "earth" || stage === "compare") g.send({ t: "flyTo", lat: current.lat, lon: current.lon, heightKm: stage === "compare" ? 420 : 1600 });
  }, [current, stage]);

  useEffect(() => {
    if (stage === "compare" && selection) mars.current?.send({ t: "flyTo", lat: selection.lat, lon: selection.lon, heightKm: 420 });
    if (stage === "earth" && !current) earth.current?.send({ t: "reset" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ---------------- messages from globes
  const onMars = useCallback((m: GlobeToParent) => {
    if (m.t === "pick") {
      const site = siteContaining(sites.data, m.lat, m.lon);
      select({ lat: m.lat, lon: m.lon, siteId: site?.id ?? null, label: site ? `${site.name} · picked point` : `${formatLat(m.lat, 2)}, ${formatLon(m.lon, 2)}` });
      if (useApp.getState().introOpen) set({ introOpen: false });
    } else if (m.t === "markerClick" && m.id.startsWith("site:")) {
      const site = sites.data?.find((x) => `site:${x.id}` === m.id);
      if (site) select({ lat: site.lat, lon: site.lon, siteId: site.id, label: site.name });
      if (useApp.getState().introOpen) set({ introOpen: false });
    } else if (m.t === "hover") {
      set({ hover: m.lat === null || m.lon === null ? null : { planet: "mars", lat: m.lat, lon: m.lon } });
    } else if (m.t === "error") console.warn("[mars globe]", m.message);
  }, [sites.data, select, set]);

  const onEarth = useCallback((m: GlobeToParent) => {
    if (m.t === "markerClick" && !m.id.startsWith("ref:")) set({ candidateId: m.id });
    else if (m.t === "hover") set({ hover: m.lat === null || m.lon === null ? null : { planet: "earth", lat: m.lat, lon: m.lon } });
    else if (m.t === "error") console.warn("[earth globe]", m.message);
  }, [set]);

  const fullPage = stage === "evidence" || stage === "report";
  const split = stage === "compare";

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {/* Globe stage: both viewers stay mounted; layout and opacity change per workflow stage. */}
        <div className={cx("absolute inset-0 transition-[filter,opacity] duration-700", fullPage && "opacity-25 blur-sm")}>
          <div className={cx("absolute inset-y-0 left-0 transition-all duration-[900ms] ease-[var(--ease-out-soft)]",
            split ? "w-full md:w-1/2" : "w-full",
            stage === "mars" || split || (fullPage && s.previousStage === "mars") ? "opacity-100 scale-100" : "pointer-events-none scale-[0.86] opacity-0",
            split && "hidden md:block")}>
            <GlobeFrame ref={mars} planet="mars" onMessage={onMars} />
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
            <button onClick={() => (stage === "mars" ? mars : earth).current?.send({ t: "reset" })}
              className="no-print panel absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] text-muted hover:text-ink md:inline-flex">
              <RotateCcw className="h-3 w-3" /> Reset view
            </button>
          </>
        )}

        {split && <ComparisonPanel />}

        {fullPage && (
          <div className="absolute inset-0 z-20 overflow-y-auto scroll-thin">
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
          left ? "inset-x-2 top-2 max-h-[60%] rounded-2xl md:inset-x-auto md:bottom-3 md:left-3 md:top-3 md:max-h-none md:w-[300px]"
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
