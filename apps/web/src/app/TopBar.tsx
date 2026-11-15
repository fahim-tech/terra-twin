import { ArrowLeft, FileText, FlaskConical, Layers } from "lucide-react";
import { useState } from "react";
import { cx, Dot } from "../components/ui";
import { formatLat, formatLon } from "../lib/geodesy";
import { useHealth, useMissions } from "../services/api";
import { type Stage, useApp } from "../store/app";
import { useGlobes } from "../store/globes";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <circle cx="12.5" cy="16" r="7.5" fill="none" stroke="#EB896A" strokeWidth="1.8" />
        <circle cx="19.5" cy="16" r="7.5" fill="none" stroke="#57BDB4" strokeWidth="1.8" />
      </svg>
      <span className="hidden text-[14px] font-semibold tracking-[-0.01em] sm:inline">TerraTwin</span>
    </div>
  );
}

const STAGES: { id: Stage; label: string }[] = [
  { id: "mars", label: "Mars" },
  { id: "earth", label: "Earth analogs" },
  { id: "compare", label: "Compare" },
];

function HoverReadout() {
  const hover = useGlobes((s) => s.hover);
  if (!hover) return null;
  return (
    <div className="num hidden items-center gap-2 font-mono text-[11px] text-muted lg:flex">
      <span className={hover.planet === "mars" ? "text-mars" : "text-earth"}>{hover.planet === "mars" ? "Mars" : "Earth"}</span>
      {formatLat(hover.lat, 2)} · {formatLon(hover.lon, 2)}
    </div>
  );
}

export function TopBar() {
  const { stage, go, back, mission, set, search, selection, marsLayer, earthLayer } = useApp();
  const missions = useMissions();
  const health = useHealth();
  const [layersOpen, setLayersOpen] = useState(false);
  const fullPage = stage === "evidence" || stage === "report";
  const apiTone = health.isError ? "bad" : health.data?.research_data ? "ok" : health.data ? "warn" : "muted";

  return (
    <header className="no-print relative z-30 flex h-14 shrink-0 items-center gap-2.5 sm:gap-4 border-b border-line/60 bg-space/80 px-4 backdrop-blur-xl md:px-5">
      <Logo />
      <div className="hidden h-5 w-px bg-line md:block" />
      <div className="hidden min-w-0 items-center gap-2 text-[12.5px] text-muted md:flex">
        <span className="truncate">{selection ? selection.label : "Mars–Earth analog workspace"}</span>
      </div>

      {fullPage ? (
        <button onClick={back} className="ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to globe
        </button>
      ) : (
        <nav aria-label="Workflow" className="ml-0 flex items-center gap-0.5 rounded-lg bg-surface/80 p-0.5 ring-1 ring-line/60 sm:ml-1">
          {STAGES.map((s) => {
            const disabled = s.id !== "mars" && !search;
            return (
              <button key={s.id} disabled={disabled} onClick={() => go(s.id)}
                title={disabled ? "Select a Mars location and run Find Earth Analogs first" : undefined}
                className={cx("rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-35",
                  stage === s.id ? cx("bg-elevated", s.id === "mars" ? "text-mars" : "text-earth") : "text-muted hover:text-ink")}>
                {s.id === "earth" ? <><span className="sm:hidden">Earth</span><span className="hidden sm:inline">{s.label}</span></> : s.label}
              </button>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1.5 md:gap-2.5">
        <HoverReadout />
        <label className="hidden items-center gap-2 lg:flex">
          <span className="eyebrow">Mission</span>
          <select value={mission} onChange={(e) => set({ mission: e.target.value })}
            className="rounded-md bg-surface px-2 py-1 text-[12px] text-ink ring-1 ring-line/70 outline-none">
            {(missions.data ?? []).map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.available ? "" : " — not configured"}</option>
            ))}
          </select>
        </label>

        {!fullPage && (
          <div className="relative">
            <button onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted hover:bg-elevated hover:text-ink">
              <Layers className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Layers</span>
            </button>
            {layersOpen && (
              <LayerMenu onClose={() => setLayersOpen(false)} marsLayer={marsLayer} earthLayer={earthLayer}
                onMars={(l) => set({ marsLayer: l })} onEarth={(l) => set({ earthLayer: l })} />
            )}
          </div>
        )}
        <button onClick={() => go("evidence")} className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] hover:bg-elevated hover:text-ink", stage === "evidence" ? "text-ink" : "text-muted")}>
          <FlaskConical className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Evidence</span>
        </button>
        <button onClick={() => go("report")} disabled={!search} title={search ? undefined : "Run an analog search to generate a report"}
          className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] hover:bg-elevated hover:text-ink disabled:opacity-35", stage === "report" ? "text-ink" : "text-muted")}>
          <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Report</span>
        </button>
        <div className="hidden h-5 w-px bg-line xl:block" />
        <div className="hidden items-center gap-2 text-[11px] text-faint xl:flex" title={health.isError ? "API unreachable" : "Scientific API status"}>
          <Dot tone={apiTone} /> AstroSUST · NASA Space Apps 2026
        </div>
      </div>
    </header>
  );
}

const MARS_LAYERS = [
  { id: "viking_color", label: "Viking colour mosaic", note: "232 m · visualization" },
  { id: "mola_shade", label: "MOLA shaded relief", note: "463 m · colour = elevation" },
];
const EARTH_LAYERS = [
  { id: "blue_marble_relief", label: "Blue Marble relief", note: "500 m · visualization" },
  { id: "blue_marble_ng", label: "Blue Marble NG", note: "500 m · true colour" },
];

function LayerMenu({ onClose, marsLayer, earthLayer, onMars, onEarth }: {
  onClose: () => void; marsLayer: string; earthLayer: string; onMars: (l: string) => void; onEarth: (l: string) => void;
}) {
  const row = (l: { id: string; label: string; note: string }, on: boolean, pick: () => void, tone: string) => (
    <button key={l.id} onClick={pick} className={cx("flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-elevated", on && "bg-elevated")}>
      <span className={cx("text-[12.5px]", on ? tone : "text-ink")}>{l.label}</span>
      <span className="text-[10.5px] text-faint">{l.note}</span>
    </button>
  );
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="panel absolute right-0 top-10 z-50 w-[300px] rounded-xl p-2 shadow-2xl">
        <div className="eyebrow px-2.5 pb-1 pt-1.5">Mars base imagery</div>
        {MARS_LAYERS.map((l) => row(l, marsLayer === l.id, () => onMars(l.id), "text-mars"))}
        <div className="eyebrow px-2.5 pb-1 pt-3">Earth base imagery</div>
        {EARTH_LAYERS.map((l) => row(l, earthLayer === l.id, () => onEarth(l.id), "text-earth"))}
        <p className="px-2.5 pb-1.5 pt-3 text-[11px] leading-relaxed text-faint">
          Imagery is for visual context only. Scientific values come from the analysis datasets, never from globe textures.
          Thermal inertia, geology and ice layers are not connected yet.
        </p>
      </div>
    </>
  );
}
