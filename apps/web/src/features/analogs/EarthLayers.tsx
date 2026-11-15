import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { useLayout } from "../../app/useLayout";
import { useEarthPool, useLegend } from "../../services/api";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import { useEarthLocal } from "./earthLocal";

/** One chip style for every layer toggle: on/off is shown by fill and glyph only, never by a different shape. */
function Toggle({ on, onClick, children, swatch, compact, label, unavailable }: {
  on: boolean; onClick: () => void; children: ReactNode; swatch: ReactNode; compact?: boolean; label: string; unavailable?: string;
}) {
  const shown = on && !unavailable;
  return (
    <button type="button" aria-pressed={shown} aria-disabled={!!unavailable} aria-label={unavailable ? `${label} (${unavailable})` : label}
      title={unavailable} onClick={unavailable ? undefined : onClick}
      className={cx("hit inline-flex shrink-0 items-center whitespace-nowrap rounded-full py-1.5 text-caption shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] transition-[color,background,transform] duration-150",
        compact ? "gap-1 pl-1.5 pr-2" : "gap-1.5 pl-2 pr-3",
        unavailable ? "cursor-default text-faint" : shown ? "bg-elevated text-ink active:scale-[0.97]" : "text-muted hover:bg-elevated/50 hover:text-ink active:scale-[0.97]")}>
      <span aria-hidden className={cx("grid h-4 w-4 place-items-center", unavailable && "opacity-50")}>{shown ? <Check className="h-3.5 w-3.5" /> : swatch}</span>
      <span aria-hidden={compact}>{children}</span>
    </button>
  );
}

/** Earth layer capsule: toggles for the similarity field, research pool, screened land and reference sites, plus legends. */
export function EarthLayers() {
  const overlays = useApp((s) => s.earthOverlays);
  const search = useApp((s) => s.search);
  const hasSearch = !!search;
  const hasT1 = !!search?.tier1;
  const set = useApp((s) => s.set);
  const reference = useEarthLocal((s) => s.referenceSites);
  const legendOpen = useEarthLocal((s) => s.legendOpen);
  const phone = useLayout() === "phone";
  const legend = useLegend();
  const pool = useEarthPool();
  const toggle = (key: keyof typeof overlays) => set({ earthOverlays: { ...overlays, [key]: !overlays[key] } });
  const lg = legend.data?.tier1_similarity;
  const cov = legend.data?.tier1_coverage;
  const nPool = pool.data?.length;
  const nRandom = pool.data?.filter((w) => w.kind === "random").length;
  const t2pool = search?.tier2.candidate_pool as ({ n_windows: number; n_ranked?: number } | null | undefined);
  const gate = search?.tier2.landcover_gate;
  const target = searchTarget(search);
  const showLegend = !phone || legendOpen;
  const anyLegend = (overlays.similarity && hasT1) || overlays.pool || overlays.coverage || reference;

  return (
    <div className={cx("surface rounded-surface", phone ? "p-1" : "p-2")} data-occludes="earth" role="group" aria-label="Earth layers">
      <div className="flex items-center">
      <div className={cx(phone ? "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]" : "grid flex-1 grid-cols-2 gap-1")}>
        <Toggle compact={phone} label="Similarity field" on={overlays.similarity} onClick={() => toggle("similarity")}
          unavailable={hasSearch && !hasT1 ? "not available: the global screen did not run for this target" : undefined}
          swatch={<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: lg ? `linear-gradient(135deg, ${lg.stops[0][1]}, ${lg.stops[lg.stops.length - 1][1]})` : undefined }} />}>
          {phone ? "Similarity" : "Similarity field"}
        </Toggle>
        <Toggle compact={phone} label="Research pool" on={overlays.pool} onClick={() => toggle("pool")} swatch={<span className="h-1.5 w-1.5 rounded-full bg-muted" />}>{phone ? "Pool" : "Research pool"}</Toggle>
        <Toggle compact={phone} label="Screened land" on={overlays.coverage} onClick={() => toggle("coverage")} swatch={<span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-muted" />}>{phone ? "Land" : "Screened land"}</Toggle>
        <Toggle compact={phone} label="Reference sites" on={reference} onClick={() => useEarthLocal.setState({ referenceSites: !reference })} swatch={<span className="h-2 w-2 rotate-45 ring-1 ring-inset ring-muted" />}>{phone ? "Sites" : "Reference sites"}</Toggle>
      </div>
        {phone && anyLegend && (
          <button type="button" aria-expanded={legendOpen} aria-label={legendOpen ? "Hide legend" : "Show legend"} onClick={() => useEarthLocal.setState({ legendOpen: !legendOpen })}
            className="hit ml-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:text-ink">
            <ChevronDown className={cx("h-4 w-4 transition-transform", legendOpen && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      {showLegend && anyLegend && (
        <div className="space-y-2.5 px-2 pb-1.5 pt-2.5">
          {overlays.similarity && hasT1 && lg && (
            <div>
              <div className="flex items-baseline justify-between text-caption">
                <span className="text-ink"><Term k="similarity">Similarity S</Term></span>
                <span className="text-muted">global screen · 25 km · as measured</span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full" role="img" aria-label={`Viridis colour scale from ${lg.domain[0]} to ${lg.domain[1]}`}
                style={{ background: `linear-gradient(to right, ${lg.stops.map(([v, c]) => `${c} ${v * 100}%`).join(", ")})` }} />
              <div className="num mt-1 flex justify-between text-num-sm text-muted">
                <span>{lg.domain[0].toFixed(1)}</span><span>{((lg.domain[0] + lg.domain[1]) / 2).toFixed(1)}</span><span>{lg.domain[1].toFixed(1)}</span>
              </div>
              <p className="mt-0.5 text-caption text-faint">Not a probability. Faint below {lg.opacity.transparent_below.toFixed(2)}.</p>
            </div>
          )}
          {overlays.similarity && hasSearch && !hasT1 && <p className="text-caption text-faint">No similarity field: the global screen did not run for this target.</p>}
          {overlays.pool && (
            <div className="flex items-start gap-2 text-caption text-muted"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
              <p>
                <span className="num text-num-sm text-ink">{nPool ?? "—"}</span> research-pool windows, 50 km each
                {nRandom !== undefined && nPool !== undefined && <> (<span className="num text-num-sm">{nRandom}</span> sampled at random, <span className="num text-num-sm">{nPool - nRandom}</span> named)</>}.
                {t2pool && target && <> Ranked for {target.label}: <span className="num text-num-sm text-ink">{t2pool.n_ranked ?? t2pool.n_windows}</span>
                  {gate?.mode === "exclude" ? " that pass the land-cover filter" : ""}.</>}
              </p>
            </div>
          )}
          {overlays.coverage && cov && (
            <p className="flex items-center gap-2 text-caption text-muted"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgba(${cov.rgba.slice(0, 3).join(",")},${Math.max(0.5, (cov.rgba[3] ?? 255) / 255)})` }} />{cov.label}</p>
          )}
          {reference && <p className="flex items-center gap-2 text-caption text-muted"><span aria-hidden className="h-2 w-2 rotate-45 ring-1 ring-inset ring-muted" />Named reference and control windows</p>}
        </div>
      )}
    </div>
  );
}
