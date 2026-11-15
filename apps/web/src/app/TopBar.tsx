import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../components/ui";
import { formatLat, formatLon } from "../lib/geodesy";
import { clock, marsTime } from "../lib/instruments";
import { useDatasets, useHealth } from "../services/api";
import { type Stage, useApp } from "../store/app";
import { useGlobes } from "../store/globes";
import { searchTarget } from "../store/searchTarget";
import { useGisStatus } from "../services/gis";
import { gisSentence, gisSummary } from "./gisStatus";
import { useGlobeSources } from "./globeSources";
import { imageryCredit } from "../lib/credits";

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <button type="button" onClick={() => useApp.getState().set({ stage: "mars", introOpen: true, whyOpen: false })}
      aria-label="TerraTwin — back to the start"
      className="hit flex shrink-0 items-center justify-center gap-3 rounded-control px-1 text-ink/90 transition-[color,opacity] duration-150 hover:text-ink active:opacity-60 active:duration-0 [&_svg]:transition-opacity hover:[&_svg]:opacity-100 [&_svg]:opacity-85">
      {/* Two bodies on one axis: the Mars–Earth twin, drawn as instrument linework. */}
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden>
        <circle cx="7" cy="9" r="5.5" fill="none" stroke="var(--color-mars)" strokeWidth="1.2" />
        <circle cx="19" cy="9" r="5.5" fill="none" stroke="var(--color-earth)" strokeWidth="1.2" />
        <path d="M0 9h26" stroke="var(--color-ink)" strokeOpacity=".55" strokeWidth="1" />
      </svg>
      {/* The name from 1024 px; tablets keep the mark alone so the investigation trail has the room. */}
      {!compact && <span className="hidden font-[family-name:var(--font-display)] text-[15px] font-semibold uppercase leading-none tracking-[0.28em] lg:inline">TerraTwin</span>}
    </button>
  );
}

const DECISION_SHORT: Record<string, string> = {
  named_leader: "stable leader", tied_set: "tie", no_convincing_analog: "no convincing analog", insufficient_evidence: "not enough evidence",
  // No research record for this point: a missing-data state, not the insufficient_evidence decision.
  unavailable: "no research data here",
};
/** Phone tokens: the full outcome stays in the accessible name; these never cut a G5-derived word mid-way. */
const DECISION_TINY: Record<string, string> = {
  named_leader: "stable leader", tied_set: "tie", no_convincing_analog: "none", insufficient_evidence: "n/a", unavailable: "no data",
};

/**
 * The investigation trail: Mars · target › Earth · outcome › Compare. Locked steps say what unlocks them.
 * A step's number and name never shrink or overlap their neighbours; only its detail gives way, with an
 * ellipsis. Phones show the current step only, its detail set under the step name; tablets (768–1023 px)
 * show every step but only the current one's detail (the others keep theirs for assistive tech); from
 * 1024 px every step shows its detail. The full detail always stays in the accessible name.
 */
function Trail({ compact }: { compact: boolean }) {
  const { stage, selection, search, candidateId, go } = useApp();
  const t = searchTarget(search);
  const outcome = search ? (search.status === "available" ? search.tier2.decision.type : "unavailable") : null;
  const steps: { id: Stage; planet: string; detail: string | null; tiny: string | null; locked: string | null }[] = [
    { id: "mars", planet: "Mars", detail: selection?.label ?? null, tiny: selection ? (selection.siteId ? selection.label : "point") : null, locked: null },
    { id: "earth", planet: "Earth", detail: outcome ? DECISION_SHORT[outcome] : null, tiny: outcome ? DECISION_TINY[outcome] : null, locked: search ? null : "Run Find Earth Analogs first" },
    { id: "compare", planet: "Compare", detail: t && candidateId ? t.label : null, tiny: t && candidateId ? (t.siteId ? t.label : "point") : null, locked: !search ? "Run Find Earth Analogs first" : !candidateId ? "Choose an Earth candidate first" : null },
  ];
  const visible = compact ? steps.filter((s) => s.id === (stage === "evidence" || stage === "report" ? "mars" : stage)) : steps;
  return (
    <nav aria-label="Investigation" className="flex min-w-0 self-stretch">
      <ol className="flex min-w-0 items-stretch gap-1">
        {visible.map((s, i) => {
          const current = stage === s.id;
          const shown = compact ? s.tiny : s.detail;
          const n = steps.findIndex((x) => x.id === s.id) + 1;
          const tone = s.id === "mars" ? "mars" : s.id === "earth" ? "earth" : "ink";
          return (
            <li key={s.id} className={cx("flex items-center gap-1", compact && "min-w-0")}>
              {i > 0 && <span aria-hidden className="mx-1 h-px w-5 shrink-0 bg-line-strong max-lg:w-3" />}
              <button type="button" onClick={() => !s.locked && go(s.id)} aria-current={current ? "step" : undefined} aria-disabled={!!s.locked}
                title={s.locked ?? undefined} aria-label={compact && s.detail ? `${s.planet}: ${s.detail}${s.locked ? ` (${s.locked})` : ""}` : undefined}
                className={cx("hit group relative flex h-full items-center px-2 transition-colors active:duration-0 focus-visible:outline-none",
                  compact && "min-w-0 max-xs:px-1.5",
                  s.locked ? "cursor-default text-faint/70" : current ? "text-ink active:text-ink/70" : "text-muted hover:text-ink active:bg-white/[0.06] active:text-ink")}>
                {/* The button spans the rail's height (its rule sits on the bottom hairline); the focus ring hugs
                    the label instead, square like every other edge of the rail. */}
                {compact ? (
                  <span className="flex min-w-0 items-baseline gap-1.5 group-focus-visible:outline group-focus-visible:outline-offset-[5px] group-focus-visible:outline-ink">
                    <StepNo n={n} current={current} tone={tone} />
                    {/* Step name over its detail, like a labelled readout: the detail gets the step's whole width.
                        The name truncates only below the narrowest supported phone (360 px). */}
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="label-caps truncate">{s.planet}</span>
                      {shown && <span className="mt-px truncate text-[11.5px] leading-[1.25] text-muted">{shown}</span>}
                    </span>
                  </span>
                ) : (
                  // Number and name in auto columns, the detail in a minmax(0, max-content) column: the step's
                  // minimum width is its number and name, so a crowded rail shortens details, never names.
                  <span className="grid grid-cols-[auto_auto_minmax(0,max-content)] items-baseline justify-start group-focus-visible:outline group-focus-visible:outline-offset-[5px] group-focus-visible:outline-ink">
                    <StepNo n={n} current={current} tone={tone} />
                    <span className="label-caps pl-2">{s.planet}</span>
                    {shown && <span className={cx("truncate pl-2 text-caption text-muted", !current && "max-lg:sr-only")}>{shown}</span>}
                  </span>
                )}
                {/* Selected step: a 1 px planet-colour rule sitting on the rail's bottom hairline. */}
                {current && <span aria-hidden className={cx("absolute inset-x-2 -bottom-px h-px", compact && "max-xs:inset-x-1.5", tone === "mars" ? "bg-mars" : tone === "earth" ? "bg-earth" : "bg-ink")} />}
                {s.locked && !compact && <span className="sr-only">({s.locked})</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Step number, in the planet's colour while that step is the current one. */
function StepNo({ n, current, tone }: { n: number; current: boolean; tone: "mars" | "earth" | "ink" }) {
  return (
    <span aria-hidden className={cx("num shrink-0 text-[10.5px]", current ? (tone === "mars" ? "text-mars" : tone === "earth" ? "text-earth" : "text-ink") : "text-faint")}>
      {String(n).padStart(2, "0")}
    </span>
  );
}

const BACK_LABEL: Record<Stage, [string, string]> = {
  mars: ["Mars", "Mars"], earth: ["Earth", "Earth"], compare: ["comparison", "Compare"], report: ["report", "Report"], evidence: ["Evidence", "Evidence"],
};

function BackButton({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  const prev = useApp((s) => s.previousStage);
  const stage = useApp((s) => s.stage);
  // Must name where back() actually goes (it falls back to Mars when there is no distinct previous stage).
  const dest = prev === stage ? "mars" : prev;
  const [full, short] = BACK_LABEL[dest];
  return (
    <button type="button" onClick={onClick} aria-label={`Back to ${full}`} className="hit label-caps shrink-0 whitespace-nowrap rounded-control px-2 py-1 text-muted transition-colors hover:text-ink active:bg-white/[0.08] active:text-ink active:duration-0">
      ← {compact ? short : `Back to ${full}`}
    </button>
  );
}

function HoverReadout() {
  const hover = useGlobes((s) => s.hover);
  return (
    <div className="num hidden w-[190px] justify-end text-num-sm text-muted 2xl:flex" aria-hidden>
      {hover && <><span className={cx("mr-2", hover.planet === "mars" ? "text-mars" : "text-earth")}>{hover.planet === "mars" ? "MARS" : "EARTH"}</span>{formatLat(hover.lat, 2)} {formatLon(hover.lon, 2)}</>}
    </div>
  );
}

/**
 * Mission clock: real UTC and Mars Coordinated Time (Mars24). Decorative for assistive tech (it ticks every
 * second). From 1280 px: below that the rail's width belongs to the investigation trail.
 */
function MissionClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = new Date(now);
  const utc = clock(d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + 1e-7);
  const m = marsTime(now);
  return (
    <div aria-hidden className="hidden items-center gap-4 border-r border-line pr-4 xl:flex"
      title="Coordinated Universal Time · Mars Coordinated Time (Mars24). The globes are lit for legibility, not by the Sun's position at this time.">

      <span className="flex items-baseline gap-1.5"><span className="kicker">UTC</span><span className="num text-num-sm text-ink">{utc}</span></span>
      <span className="flex items-baseline gap-1.5"><span className="kicker text-mars/90">MTC</span><span className="num text-num-sm text-ink">{clock(m.mtcHours)}</span></span>
      <span className="hidden items-baseline gap-1.5 xl:flex"><span className="kicker">MSD</span><span className="num text-num-sm text-muted">{Math.floor(m.msd).toLocaleString("en-US")}</span></span>
    </div>
  );
}

/**
 * GIS data link (from 1280 px): a square mark (filled = live, outlined = not connected), the grid cell size and
 * the discovery state, all from /api/gis/status. Opens Evidence, where the data and method are documented.
 */
function GisRailItem() {
  const q = useGisStatus();
  const g = gisSummary(q.data, q.isError);
  const go = useApp((s) => s.go);
  const stage = useApp((s) => s.stage);
  const disc = g.discovery === "available" ? "discovery" : g.discovery === "busy" ? "discovery busy" : g.discovery === "off" ? "no discovery" : "—";
  return (
    <button type="button" onClick={() => go("evidence")} aria-label={`${gisSentence(g)}. Open Evidence.`} title={gisSentence(g)}
      aria-current={stage === "evidence" ? "page" : undefined}
      className="hit hidden h-9 shrink-0 items-center gap-2 rounded-control border-r border-line px-2.5 pr-4 text-muted transition-colors hover:text-ink active:bg-white/[0.06] active:duration-0 xl:flex">
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0", g.state === "live" ? "bg-ink" : g.state === "off" ? "ring-1 ring-inset ring-warn" : "ring-1 ring-inset ring-faint")} />
      <span aria-hidden className="kicker text-muted">GIS</span>
      <span aria-hidden className="num whitespace-nowrap text-num-sm text-ink">
        {g.state === "off" ? <span className="text-warn">offline</span> : g.gridKm !== null ? <>{g.gridKm}<span className="ml-0.5 font-sans">km</span></> : "—"}
      </span>
      {g.state !== "off" && <span aria-hidden className="whitespace-nowrap text-caption text-faint">· {disc}</span>}
    </button>
  );
}

export function TopBar({ compact }: { compact: boolean }) {
  const { stage, go, back, search } = useApp();
  const fullPage = stage === "evidence" || stage === "report";
  // Phones: tighter cells so the current step keeps room for its name and detail (and tighter still below
  // 380 px, where "03 COMPARE" would otherwise run into "Evidence").
  const cell = compact ? "px-2 tracking-[0.1em] max-xs:px-1.5 max-xs:text-[11px] max-xs:tracking-[0.06em]" : "px-2.5";
  return (
    <header className={cx("chrome-scale no-print relative z-30 flex h-[52px] shrink-0 items-center border-b border-white/[0.07] px-3 sm:gap-5 sm:px-5",
      compact ? "gap-2 max-xs:gap-1.5" : "gap-3",
      // Full pages scroll text right under the rail: give it a solid backing there (the globe stages keep the scrim).
      fullPage ? "bg-space" : "bg-space/85 backdrop-blur-md")}>
      <Wordmark compact={compact} />
      {fullPage ? (
        <BackButton compact={compact} onClick={back} />
      ) : <Trail compact={compact} />}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <HoverReadout />
        {!compact && <GisRailItem />}
        {!compact && <MissionClock />}
        <button type="button" onClick={() => go("evidence")} aria-current={stage === "evidence" ? "page" : undefined}
          className={cx("hit label-caps rounded-control py-1 transition-colors hover:text-ink active:bg-white/[0.08] active:duration-0", cell, stage === "evidence" ? "text-ink" : "text-muted")}>Evidence</button>
        <button type="button" onClick={() => search && go("report")} aria-disabled={!search} title={search ? undefined : "Run Find Earth Analogs to build a report"}
          className={cx("hit label-caps rounded-control py-1 transition-colors", cell, !search ? "cursor-default text-faint/70" : stage === "report" ? "text-ink active:bg-white/[0.08] active:duration-0" : "text-muted hover:text-ink active:bg-white/[0.08] active:duration-0")}>Report</button>
        <MoreMenu />
      </div>
    </header>
  );
}

/**
 * Imagery layers. `dataset` is the /api/datasets record whose `native_resolution` the menu shows (the true
 * colour mosaic has no record, so it shows a dash rather than a typed-in figure).
 */
const MARS_LAYERS = [
  { id: "viking_color", label: "Viking colour mosaic", dataset: "mars_trek_viking", sub: null },
  { id: "mola_shade", label: "MOLA shaded relief", dataset: "mars_trek_mola_shade", sub: "Colour = elevation" },
];
const EARTH_LAYERS = [
  { id: "blue_marble_relief", label: "Blue Marble relief", dataset: "gibs_blue_marble", sub: null },
  { id: "blue_marble_ng", label: "Blue Marble true colour", dataset: null, sub: null },
];

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const { marsLayer, earthLayer, graticule, set } = useApp();
  const health = useHealth();
  const datasets = useDatasets();
  const sources = useGlobeSources((s) => s.source);
  const resolution = (dataset: string | null) =>
    (dataset ? datasets.data?.datasets.find((d) => d.id === dataset)?.native_resolution : null) || "—";
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitemradio],[role=menuitemcheckbox]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio],[role=menuitemcheckbox]") ?? []);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? (i + 1) % list.length : e.key === "ArrowUp" ? (i - 1 + list.length) % list.length
      : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (to >= 0 && list.length) { e.preventDefault(); list[to].focus(); }
    else if (e.key === "Tab") setOpen(false);
  };
  const onMenuBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && !menu.current?.contains(next) && !btn.current?.contains(next)) setOpen(false);
  };
  // Label (with an optional qualifier line under it) on the left, the mono figure on the right, never wrapped.
  const item = (on: boolean, label: string, note: string, act: () => void, role: "menuitemradio" | "menuitemcheckbox" = "menuitemradio", sub: string | null = null) => (
    <button key={label} role={role} aria-checked={on} onClick={act} tabIndex={-1}
      className="flex w-full items-start justify-between gap-4 rounded-control px-2.5 py-2 text-left hover:bg-white/[0.05] focus-visible:bg-white/[0.05]">
      <span className="flex min-w-0 items-start gap-2.5 text-label">
        <span aria-hidden className={cx("mt-1.5 h-1.5 w-1.5 shrink-0", on ? "bg-ink" : "ring-1 ring-inset ring-faint")} />
        <span className="min-w-0">{label}{sub && <span className="block text-caption text-faint">{sub}</span>}</span>
      </span>
      <span className="num shrink-0 whitespace-nowrap pt-px text-num-sm text-faint">{note}</span>
    </button>
  );
  const apiTone = health.isError ? "API unreachable" : health.data?.research_data ? "API connected · research data verified" : health.data ? "API connected · research data missing" : "Checking API…";
  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label="More: layers, data status, about" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="hit grid h-9 w-9 place-items-center rounded-control text-muted transition-colors hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12] active:duration-0">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label="Layers and status" onKeyDown={onMenuKey} onBlur={onMenuBlur} className="surface-solid frame absolute right-0 top-11 z-50 w-[320px] rounded-control p-2">
          <div className="kicker px-2.5 pb-1 pt-1.5">Mars imagery</div>
          {MARS_LAYERS.map((l) => item(marsLayer === l.id, l.label, resolution(l.dataset), () => set({ marsLayer: l.id }), "menuitemradio", l.sub))}
          <div className="kicker px-2.5 pb-1 pt-3">Earth imagery</div>
          {EARTH_LAYERS.map((l) => item(earthLayer === l.id, l.label, resolution(l.dataset), () => set({ earthLayer: l.id }), "menuitemradio", l.sub))}
          <div className="kicker px-2.5 pb-1 pt-3">Overlays</div>
          {item(graticule, "Latitude–longitude grid", "30°", () => set({ graticule: !graticule }), "menuitemcheckbox")}
          <p className="px-2.5 pb-1 pt-3 text-caption text-faint">Imagery is visual context only; measurements come from the analysis datasets.</p>
          {/* Credits for what each globe reports it draws (never typed in), so a layer switch or ion tiles credit correctly. */}
          <dl className="px-2.5 pt-1 text-caption">
            {(["mars", "earth"] as const).map((p) => (
              <div key={p} className="flex gap-2 py-0.5">
                <dt className="kicker w-11 shrink-0 pt-px">{p === "mars" ? "Mars" : "Earth"}</dt>
                <dd className="text-muted">{imageryCredit(p, sources[p], p === "mars" ? marsLayer : earthLayer) ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 border-t border-line px-2.5 pt-2.5 text-caption text-muted">{apiTone}</div>
          <div className="px-2.5 pb-1 pt-1 text-caption text-faint">AstroSUST · NASA Space Apps Challenge 2026</div>
        </div>
      )}
    </div>
  );
}
