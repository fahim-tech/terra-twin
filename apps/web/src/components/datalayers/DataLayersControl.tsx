import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Planet } from "../../globes/protocol";
import { type GridInfo, useGridInfo } from "../../services/gis";
import { useApp } from "../../store/app";
import { useDataLayers } from "../../store/dataLayers";
import { useGlobes } from "../../store/globes";
import { StatusMark } from "../marks";
import { cx } from "../ui";
import { GROUP_COPY, type Legend, cellSpacing, flagList, groupLayers, legendFor, unitSuffix } from "./model";

const CAPS = "kicker";

/** One option row: a square status mark (filled when chosen), the payload's label, its units in mono. */
function Option({ name, value, checked, onChange, label, units }: {
  name: string; value: string; checked: boolean; onChange: () => void; label: string; units?: string | null;
}) {
  return (
    <label className={cx("group relative flex cursor-pointer items-baseline gap-2.5 px-3 py-[7px] transition-colors duration-150",
      checked ? "bg-white/[0.07] text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink")}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
      {/* Focus ring drawn inside the row (the list clips). */}
      <span aria-hidden className="pointer-events-none absolute inset-0 peer-focus-visible:shadow-[inset_0_0_0_2px_rgb(242_244_245/0.9)]" />
      <StatusMark state={checked ? "on" : "off"} className="translate-y-[1px] shrink-0" />
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.3]">{label}</span>
      {units && <span aria-hidden className="num shrink-0 text-[10.5px] leading-none text-faint">{units}</span>}
    </label>
  );
}

/** Ramp or class swatches for the chosen layer, from the payload only. */
function LegendView({ legend, label }: { legend: Legend; label: string }) {
  if (legend.kind === "none") return <p className="text-caption text-faint">The grid states no colour scale for this layer.</p>;
  if (legend.kind === "classes") {
    return (
      <ul aria-label={`${label}: classes`} className={cx("grid gap-x-3 gap-y-1.5", legend.classes.some((c) => c.label.length > 16) ? "grid-cols-1" : "grid-cols-2")}>
        {legend.classes.map((c) => (
          <li key={c.value} className="flex min-w-0 items-center gap-2 text-caption text-muted">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 ring-1 ring-inset ring-white/25" style={{ background: c.color }} />
            <span className="min-w-0 truncate" title={c.label}>{c.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div>
      <div role="img" aria-label={`${label}: viridis colour scale from ${legend.min} to ${legend.max}${legend.units ? ` ${legend.units}` : ""}`}
        className="h-2.5 ring-1 ring-inset ring-white/15" style={{ background: legend.gradient }} />
      <div aria-hidden className="relative h-[5px]">
        <span className="absolute left-0 top-0 h-full w-px bg-ink/60" />
        <span className="absolute right-0 top-0 h-full w-px bg-ink/60" />
      </div>
      <div aria-hidden className="mt-1 flex items-baseline justify-between gap-3">
        <span className="num text-num-sm leading-none text-ink/85">{legend.min}</span>
        <span className="num text-num-sm leading-none text-ink/85">{legend.max}</span>
      </div>
      {legend.units && <p className="mt-1.5 text-caption text-muted">Units: <span className="text-ink/85">{legend.units}</span></p>}
      <p className="mt-1 text-caption text-faint">Stretch: {legend.basis}.</p>
    </div>
  );
}

/** The grid's own use rules and flag bits, on demand. */
function Rules({ info }: { info: GridInfo }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const flags = flagList(info.flags);
  const rules = info.use_rules ?? [];
  if (!rules.length && !flags.length) return null;
  return (
    <div className="border-t border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="hit flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted transition-colors hover:bg-white/[0.04] hover:text-ink">
        <ChevronDown aria-hidden className={cx("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        Use rules · cell flags
      </button>
      {open && (
        <div id={id} className="space-y-2.5 px-3 pb-3">
          {rules.length > 0 && (
            <ul className="space-y-1.5">
              {rules.map((r) => (
                <li key={r} className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-2 text-caption text-muted">
                  <span aria-hidden className="mt-[6px] h-px w-2 bg-ink/50" />{r}
                </li>
              ))}
            </ul>
          )}
          {flags.length > 0 && (
            <div>
              <div className={CAPS}>Flag bits the grid sets per cell</div>
              <dl className="mt-1.5 grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-1 text-caption">
                {flags.map((f) => (
                  <div key={f.bit} className="contents">
                    <dt className="num text-num-sm text-faint">{f.bit}</dt>
                    <dd className="text-muted">{f.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DATA LAYERS: the ~1 km grid's layers for one planet, from its info payload (/api/gis/grid/{planet}/info) —
 * grouped Terrain / Observation support (Mars; metadata, never a weight) / Surface (Earth), a None option, the
 * opacity, the chosen layer's legend (viridis ramp with its stretch and units, or class swatches) and the grid's
 * use rules and flag bits on demand. `bare` drops the header and frame (when hosted inside another panel).
 */
export function DataLayersControl({ planet, header, className }: { planet: Planet; header?: ReactNode; className?: string }) {
  const info = useGridInfo(planet);
  const chosen = useDataLayers((s) => s.layer[planet]);
  const opacity = useDataLayers((s) => s.opacity[planet]);
  const { setLayer, setOpacity } = useDataLayers.getState();
  const fault = useGlobes((s) => s.dataLayerFault[planet]);
  const name = useId();
  const ids = { opacity: useId() };
  const data = info.data;
  const layer = data?.layers.find((l) => l.name === chosen) ?? null;
  const pick = (n: string | null) => {
    setLayer(planet, n);
    // Phones: the list covers the planet; once a layer is chosen it folds to its header and legend strip.
    if (n && window.innerWidth < 768) useDataLayers.getState().setOpen(planet, false);
    const l = n ? data?.layers.find((x) => x.name === n) : null;
    useApp.getState().announce(l ? `${l.label} drawn on the ${planet === "mars" ? "Mars" : "Earth"} globe.` : "Data layer cleared.");
  };
  const recentFault = fault && layer && fault.id.endsWith(`:${layer.name}`) && Date.now() - fault.at < 30_000;
  const spacing = data ? cellSpacing(data) : null;

  return (
    <div className={className}>
      {header}
      {info.isPending && <p className="px-3 py-2.5 text-caption text-muted">Reading the grid's layers…</p>}
      {info.isError && (
        <p className="flex items-baseline gap-2 px-3 py-2.5 text-caption text-ink">
          <StatusMark state="struck" className="translate-y-[1px]" />
          <span>Data layers are not available: {(info.error as Error).message}</span>
        </p>
      )}
      {data && (
        <>
          <p className="px-3 pb-2 pt-2.5 text-caption text-faint">
            <span className="num text-num-sm text-muted">{data.product}</span>
            {spacing && <> · cell <span className="num text-num-sm text-muted">{spacing}</span></>}
          </p>
          <div role="radiogroup" aria-label={`${planet === "mars" ? "Mars" : "Earth"} data layer`} className="max-h-[min(44vh,360px)] overflow-y-auto scroll-thin border-t border-line">
            <Option name={name} value="" checked={!layer} onChange={() => pick(null)} label="None" />
            {groupLayers(data.layers).map((g) => (
              <div key={g.group} role="group" aria-label={GROUP_COPY[g.group].title}>
                <div className="border-t border-line px-3 pb-1 pt-2">
                  <div className={cx(CAPS, "!text-ink/70")}>{GROUP_COPY[g.group].title}</div>
                  {GROUP_COPY[g.group].note && <div className="mt-0.5 text-caption text-faint">{GROUP_COPY[g.group].note}</div>}
                </div>
                {g.layers.map((l) => (
                  <Option key={l.name} name={name} value={l.name} checked={chosen === l.name} onChange={() => pick(l.name)} label={l.label}
                    units={l.kind === "categorical" ? null : unitSuffix(l.units)} />
                ))}
              </div>
            ))}
          </div>
          {layer && (
            <div className="space-y-2.5 border-t border-line px-3 pb-3 pt-2.5">
              <div className="flex items-center gap-3">
                <label htmlFor={ids.opacity} className={cx(CAPS, "shrink-0")}>Opacity</label>
                <input id={ids.opacity} type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(planet, Number(e.target.value) / 100)}
                  className="tt-range h-5 min-w-0 flex-1 cursor-pointer accent-[var(--color-ink)]" />
                <span className="num w-9 shrink-0 text-right text-num-sm text-ink">{Math.round(opacity * 100)}%</span>
              </div>
              {layer.group === "support" && (
                <p className="flex items-baseline gap-2 text-caption text-ink/85"><StatusMark state="caution" className="translate-y-[1px]" />
                  Observation support is metadata about the MOLA data behind each cell: never a weight or a confidence.</p>
              )}
              <LegendView legend={legendFor(layer)} label={layer.label} />
              {planet === "earth" && layer.group === "terrain" && (
                <p className="text-caption text-faint">Drawn over land cells only: ocean and other non-land cells have no terrain value here.</p>
              )}
              {recentFault && (
                <p className="flex items-baseline gap-2 text-caption text-ink"><StatusMark state="fault" className="translate-y-[1px]" />
                  Some tiles of this layer failed to load.</p>
              )}
            </div>
          )}
          <Rules info={data} />
        </>
      )}
    </div>
  );
}

/**
 * The chosen layer's legend in one line, shown while the control is folded, so a drawn layer is never without
 * its scale: the ramp between its stretch ends with the unit, or the class swatches.
 */
export function LegendStrip({ planet }: { planet: Planet }) {
  const chosen = useDataLayers((s) => s.layer[planet]);
  const info = useGridInfo(planet);
  const layer = chosen ? info.data?.layers.find((l) => l.name === chosen) : undefined;
  if (!layer) return null;
  const lg = legendFor(layer);
  if (lg.kind === "none") return null;
  return (
    <div className="border-t border-line px-3 py-2">
      {lg.kind === "ramp" ? (
        <div className="flex items-center gap-2.5">
          <span className="num shrink-0 text-num-sm leading-none text-ink/85">{lg.min}</span>
          <span role="img" aria-label={`${layer.label}: viridis colour scale from ${lg.min} to ${lg.max}${lg.units ? ` ${lg.units}` : ""}`}
            className="h-2 min-w-0 flex-1 ring-1 ring-inset ring-white/15" style={{ background: lg.gradient }} />
          <span className="num shrink-0 text-num-sm leading-none text-ink/85">{lg.max}{unitSuffix(lg.units) && <span className="text-muted"> {unitSuffix(lg.units)}</span>}</span>
        </div>
      ) : (
        <ul aria-label={`${layer.label}: classes`} className="flex flex-wrap gap-x-3 gap-y-1">
          {lg.classes.map((c) => (
            <li key={c.value} className="flex items-center gap-1.5 text-caption text-muted">
              <span aria-hidden className="h-2 w-2 shrink-0 ring-1 ring-inset ring-white/25" style={{ background: c.color }} />{c.label}
            </li>
          ))}
        </ul>
      )}
      {layer.group === "support" && <p className="mt-1.5 text-caption text-faint">Metadata: never a weight or a confidence.</p>}
    </div>
  );
}

/**
 * The Mars DATA LAYERS instrument: a folding panel under the navigator. Unfolded it is an occluder for the globe's
 * framing (the planet frames in the area beside it).
 */
export function MarsDataLayersPanel({ phone }: { phone: boolean }) {
  const open = useDataLayers((s) => s.open.mars);
  const chosen = useDataLayers((s) => s.layer.mars);
  const info = useGridInfo("mars");
  const label = chosen ? info.data?.layers.find((l) => l.name === chosen)?.label ?? null : null;
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Report where the panel sits, so the Mars callouts keep their plates off it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => useDataLayers.getState().setPanelBox("mars", { x0: el.offsetLeft, y0: el.offsetTop, x1: el.offsetLeft + el.offsetWidth, y1: el.offsetTop + el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { ro.disconnect(); useDataLayers.getState().setPanelBox("mars", null); };
  }, []);
  return (
    <div ref={ref} data-occludes={open && !phone ? "mars" : undefined} role="group" aria-label="Mars data layers"
      className={cx("surface frame no-print pointer-events-auto absolute left-3 z-20 rounded-surface", phone ? "right-[72px] top-[64px]" : "top-[68px] w-[300px]")}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => useDataLayers.getState().setOpen("mars", !open)}
        className="hit flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-mars" />
        <span className="kicker shrink-0 !text-ink/85">Data layers</span>
        <span className="min-w-0 flex-1 truncate text-right text-caption text-muted">{label ?? "None"}</span>
        <ChevronDown aria-hidden className={cx("h-4 w-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? <div id={id} className="border-t border-line"><DataLayersControl planet="mars" /></div> : <LegendStrip planet="mars" />}
    </div>
  );
}
