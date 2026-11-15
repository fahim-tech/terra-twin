import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { DataLayersControl, LegendStrip } from "../../components/datalayers/DataLayersControl";
import { useDataLayers } from "../../store/dataLayers";
import { useGridInfo } from "../../services/gis";
import { PlanetMark } from "../../components/marks";
import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { useLayout } from "../../app/useLayout";
import { useEarthPool, useLegend } from "../../services/api";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { VisualizationLegend } from "../../types/contracts";
import { screenCellKm } from "./candidates";
import { useEarthLocal } from "./earthLocal";
import { CAPS, StatusMark } from "./instruments";
import { rampGradient, rampPosition, rampTicks, tickDigits } from "./legend";

/**
 * Map-point keys drawn as true circles (data graphics), mirroring the Earth globe's marker styles
 * (globes/globe-entry.ts STYLE: pool #C9D3DC, reference #D9B07A, control #8E99A6).
 */
function PointKey({ color, r, opacity = 1 }: { color: string; r: number; opacity?: number }) {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <circle cx="5" cy="5" r={r} fill={color} fillOpacity={opacity} stroke="#07090C" strokeOpacity={0.7} strokeWidth={0.75} />
    </svg>
  );
}

/** One cell of the layer segmented control: on/off by status mark, ink and fill — never by a different shape. */
function LayerCell({ on, onClick, label, short, compact, unavailable, className }: {
  on: boolean; onClick: () => void; label: string; short: string; compact: boolean; unavailable?: string; className?: string;
}) {
  const shown = on && !unavailable;
  return (
    <button type="button" aria-pressed={shown} aria-disabled={!!unavailable} aria-label={unavailable ? `${label} (${unavailable})` : label}
      title={unavailable} onClick={unavailable ? undefined : onClick}
      className={cx("hit flex min-w-0 items-center gap-2 whitespace-nowrap text-[11px] font-semibold uppercase leading-none tracking-[0.1em] transition-colors duration-150 active:duration-0",
        compact ? "flex-auto justify-center px-2 py-2.5" : "px-3 py-2.5",
        unavailable ? "cursor-default text-faint" : shown ? "bg-white/[0.07] text-ink hover:bg-white/[0.1] active:bg-white/[0.14]" : "text-muted hover:bg-white/[0.04] hover:text-ink active:bg-white/[0.1]",
        className)}>
      {/* Unavailable reads as off at a glance: a struck-out mark, never a dimmed colour. */}
      <StatusMark state={unavailable ? "struck" : shown ? "on" : "off"} />
      <span className="truncate">{compact ? short : label}</span>
    </button>
  );
}

/** Viridis ramp with ticks from the legend record; the hatched span is not drawn on the globe at all. */
function SimilarityLegend({ lg, km }: { lg: VisualizationLegend["tier1_similarity"]; km: number | null }) {
  const ticks = rampTicks(lg.domain, 5);
  const digits = tickDigits(ticks, 2);
  const gradient = rampGradient(lg.stops);
  const lo = lg.opacity.transparent_below;
  const hi = lg.opacity.opaque_above;
  const hidden = rampPosition(lg.domain, lo);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx(CAPS, "!text-ink/85")}><Term k="similarity">Similarity S</Term></span>
        <span className="text-caption text-faint">{km !== null && <><span className="num text-num-sm">{km}</span> km · </>}as measured</span>
      </div>
      <div className="relative mt-2 h-2.5" role="img"
        aria-label={`${lg.name} colour scale from ${lg.domain[0]} to ${lg.domain[1]}; values below ${lo.toFixed(2)} are not drawn and values up to ${hi.toFixed(2)} fade in`}>
        <div className="absolute inset-0" style={gradient ? { background: gradient } : undefined} />
        {hidden !== null && hidden > 0 && (
          <div className="absolute inset-y-0 left-0 border-r border-ink/80"
            style={{ width: `${hidden * 100}%`, backgroundImage: "repeating-linear-gradient(135deg, rgb(2 3 4 / 0.62) 0 1.5px, transparent 1.5px 4px)" }} />
        )}
      </div>
      <div aria-hidden className="relative h-[5px]">
        {ticks.map((t) => (
          <span key={t.at} className="absolute top-0 h-full w-px bg-ink/60" style={{ left: t.at === 1 ? "calc(100% - 1px)" : `${t.at * 100}%` }} />
        ))}
      </div>
      <div aria-hidden className="relative mt-1 h-3">
        {ticks.map((t) => (
          <span key={t.at} className="num absolute top-0 text-num-sm leading-none text-muted"
            style={{ left: `${t.at * 100}%`, transform: t.at === 0 ? undefined : t.at === 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
            {t.value.toFixed(digits)}
          </span>
        ))}
      </div>
      {/* How the globe draws the field (from the record's opacity), then the record's own caveat, verbatim. */}
      <p className="mt-2 text-caption text-faint">
        Hatched: not drawn below <span className="num">{lo.toFixed(2)}</span>; fades in up to <span className="num">{hi.toFixed(2)}</span>. {lg.caveat}
      </p>
    </div>
  );
}

/** Earth layer panel: a segmented set of layer switches (similarity field, research pool, screened land, reference sites) and their legend. */
/** The 1 km grid's data layers inside the Earth layers panel: a folding row naming the layer drawn. */
function EarthDataLayers() {
  const open = useDataLayers((s) => s.open.earth);
  const chosen = useDataLayers((s) => s.layer.earth);
  const info = useGridInfo("earth");
  const label = chosen ? info.data?.layers.find((l) => l.name === chosen)?.label ?? null : null;
  const id = useId();
  return (
    <div className="border-t border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => useDataLayers.getState().setOpen("earth", !open)}
        className="hit flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]">
        <span className={cx(CAPS, "shrink-0 !text-ink/85")}>1 km data layers</span>
        <span className="min-w-0 flex-1 truncate text-right text-caption text-muted">{label ?? "None"}</span>
        <ChevronDown aria-hidden className={cx("h-4 w-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? <div id={id} className="border-t border-line"><DataLayersControl planet="earth" /></div> : <LegendStrip planet="earth" />}
    </div>
  );
}

/** Below this window width a chosen candidate's glyph can stand under the unfolded panel: it folds to its header then. */
const FOLD_BELOW_PX = 1200;

export function EarthLayers() {
  const overlays = useApp((s) => s.earthOverlays);
  const search = useApp((s) => s.search);
  const hasSearch = !!search;
  const hasT1 = !!search?.tier1;
  const set = useApp((s) => s.set);
  const reference = useEarthLocal((s) => s.referenceSites);
  const legendOpen = useEarthLocal((s) => s.legendOpen);
  const liveOpen = useApp((s) => s.liveOpen);
  const phone = useLayout() === "phone";
  const legend = useLegend();
  const pool = useEarthPool();
  const candidateId = useApp((s) => s.candidateId);
  const [folded, setFolded] = useState(false);
  // A candidate chosen on a narrower screen: fold to the header row so the panel does not cover its glyph.
  useEffect(() => { if (candidateId && window.innerWidth < FOLD_BELOW_PX) setFolded(true); }, [candidateId]);
  const bodyId = useId();
  const toggle = (key: keyof typeof overlays) => set({ earthOverlays: { ...overlays, [key]: !overlays[key] } });
  const lg = legend.data?.tier1_similarity;
  const cov = legend.data?.tier1_coverage;
  const nPool = pool.data?.length;
  const poolKm = search?.tier2.candidate_pool?.window_km ?? null;
  const nRandom = pool.data?.filter((w) => w.kind === "random").length;
  const t2pool = search?.tier2.candidate_pool as ({ n_windows: number; n_ranked?: number } | null | undefined);
  const gate = search?.tier2.landcover_gate;
  const target = searchTarget(search);
  const showLegend = !phone || legendOpen;
  const anyLegend = (overlays.similarity && hasSearch) || overlays.pool || overlays.coverage || reference;
  const noScreen = hasSearch && !hasT1 ? "not available: the global screen did not run for this target" : undefined;

  const cells = [
    { key: "similarity", label: "Similarity field", short: "Similarity", on: overlays.similarity, onClick: () => toggle("similarity"), unavailable: noScreen },
    { key: "pool", label: "Research pool", short: "Pool", on: overlays.pool, onClick: () => toggle("pool") },
    { key: "coverage", label: "Screened land", short: "Land", on: overlays.coverage, onClick: () => toggle("coverage") },
    { key: "reference", label: "Reference sites", short: "Sites", on: reference, onClick: () => useEarthLocal.setState({ referenceSites: !reference }) },
  ];

  return (
    <div className="surface frame rounded-surface" data-occludes="earth" role="group" aria-label="Earth layers">
      {!phone && (
        <button type="button" aria-expanded={!folded} aria-controls={bodyId} onClick={() => setFolded((f) => !f)}
          className="hit flex w-full items-center justify-between gap-3 px-3 pb-2 pt-2.5 text-left transition-colors hover:bg-white/[0.03]">
          <span className="kicker flex items-center gap-2 !text-ink/85"><PlanetMark planet="earth" />Earth layers</span>
          <ChevronDown aria-hidden className={cx("h-4 w-4 text-muted transition-transform duration-200", !folded && "rotate-180")} />
        </button>
      )}
      {/* Folded, a drawn data layer keeps its one-line legend. */}
      {folded && !phone && <LegendStrip planet="earth" />}
      {!(folded && !phone) && <div id={bodyId}>
      <div className={cx("flex", !phone && "border-t border-line")}>
        <div className={cx(phone ? "flex min-w-0 flex-1" : "grid flex-1 grid-cols-2")}>
          {cells.map((c, i) => (
            <LayerCell key={c.key} compact={phone} label={c.label} short={c.short} on={c.on} onClick={c.onClick} unavailable={c.unavailable}
              className={cx(phone ? i > 0 && "border-l border-line" : cx(i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line"))} />
          ))}
        </div>
        {phone && (
          <button type="button" aria-expanded={legendOpen} aria-label={legendOpen ? "Hide legend and data layers" : "Show legend and data layers"} onClick={() => useEarthLocal.setState({ legendOpen: !legendOpen })}
            className="hit grid w-10 shrink-0 place-items-center border-l border-line text-muted transition-colors hover:bg-white/[0.05] hover:text-ink active:bg-white/[0.1] active:duration-0">
            <ChevronDown className={cx("h-4 w-4 transition-transform duration-200", legendOpen && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      {!phone && <EarthDataLayers />}
      {phone && legendOpen && <EarthDataLayers />}
      {phone && !legendOpen && <LegendStrip planet="earth" />}
      {showLegend && anyLegend && (
        <div className="space-y-3 border-t border-line px-3 pb-3 pt-2.5">
          {overlays.similarity && hasT1 && lg && !liveOpen && <SimilarityLegend lg={lg} km={screenCellKm(search)} />}
          {overlays.similarity && liveOpen && <p className="text-caption text-faint">Similarity field not shown during live discovery: the globe shows the refined windows.</p>}
          {overlays.similarity && noScreen && (
            <p className="flex items-baseline gap-2 text-caption text-faint"><StatusMark state="struck" className="translate-y-[1px]" />No similarity field: the global screen did not run for this target.</p>
          )}
          {overlays.pool && (
            <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-2.5">
              <span className="pt-[3px]"><PointKey color="#C9D3DC" r={2.5} opacity={0.6} /></span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cx(CAPS, "!text-ink/85")}>Research pool</span>
                  <span className="whitespace-nowrap text-caption text-muted">
                    <span className="num text-num-sm text-ink">{nPool ?? "—"}</span> windows{poolKm ? <> · <span className="num text-num-sm">{poolKm}</span> km</> : ""}
                  </span>
                </div>
                <p className="mt-1 text-caption text-muted">
                  {nRandom !== undefined && nPool !== undefined && <><span className="num text-num-sm">{nRandom}</span> stratified random, <span className="num text-num-sm">{nPool - nRandom}</span> named.</>}
                  {t2pool && target && <> Ranked for <span className="whitespace-nowrap">{target.label}:&nbsp;<span className="num text-num-sm text-ink">{t2pool.n_ranked ?? t2pool.n_windows}</span></span>
                    {gate?.mode === "exclude" ? " that pass the land-cover filter" : ""}.</>}
                </p>
              </div>
            </div>
          )}
          {overlays.coverage && cov && (
            <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-2.5">
              <span aria-hidden className="mt-[3px] h-2.5 w-2.5 ring-1 ring-inset ring-white/25" style={{ background: `rgba(${cov.rgba.slice(0, 3).join(",")},${Math.max(0.5, (cov.rgba[3] ?? 255) / 255)})` }} />
              <div className="min-w-0">
                <span className={cx(CAPS, "!text-ink/85")}>Screened land</span>
                <p className="mt-1 text-caption text-muted">{cov.label}</p>
              </div>
            </div>
          )}
          {reference && (
            <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-2.5">
              <span className="pt-[3px]"><PointKey color="#D9B07A" r={3} /></span>
              <div className="min-w-0">
                <span className={cx(CAPS, "!text-ink/85")}>Reference sites</span>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-muted">
                  Named reference windows <span aria-hidden>·</span> <PointKey color="#8E99A6" r={2.5} opacity={0.6} /> controls
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      </div>}
    </div>
  );
}
