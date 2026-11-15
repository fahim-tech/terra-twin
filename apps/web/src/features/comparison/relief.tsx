import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from "react";
import { radioGroupKeys, Term } from "../../components/primitives";
import { ExaggerationSwitch, GridFacts, ReliefNotice, ReliefView, reliefWindowId, scoreBasisLine, unavailableWords, type Exaggeration } from "../../components/relief";
import { cx, Spinner } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { ApiError, useEarthPool, useMarsRelief, useRelief } from "../../services/api";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Relief } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import type { CompareTargets } from "./model";

/**
 * "3D relief" mode of the comparison: the compared pair as real elevation, Mars | Earth side by side on desktop
 * (a Mars / Earth switch on phones), under the section rule the panel draws.
 *
 * Earth is the compared research window's relief grid, fetched by its exact research-pool id; a screening cell
 * or a window the pool does not list has none, and no other terrain is shown in its place. That grid is Earth as
 * measured (the MOLA observation model is not applied); a research window's score uses Earth as MOLA would observe
 * it and a screening cell's uses Earth as measured, and the caption says which (`scoreBasisLine`). Mars is the
 * Exploration Zone's grid, which needs a MOLA mosaic the server does not have yet: that half says so in plain words.
 * When both grids exist they share one vertical exaggeration, set by one control, and the line beside it says so.
 */
export interface ReliefViewerProps {
  search: AnalogSearch;
  c: CandidateView;
  targets: CompareTargets;
  phone: boolean;
}

/** Scene height bounds (px): fill the panel's visible height between these. */
const SCENE = { min: 180, max: 420 } as const;
/** Phones: one planet at a time in a short scrolling panel; a fixed scene that the panel scrolls past. */
const PHONE_SCENE = 250;
/** The status bar under each scene (ReliefView), so a half without a grid ends level with one that has. */
const STATUS_BAR = 28;
/** Under each scene: the planet strip above it and the status bar; a deck row when the controls sit below; the shared control. */
const RESERVE = { strip: 28, status: STATUS_BAR, deck: 40, shared: 38 } as const;
/** A half at least this wide has room beside the block for its controls inside the scene. */
const FLOAT_MIN_HALF = 540;

function CompareRelief({ search, c, targets, phone }: ReliefViewerProps) {
  const pool = useEarthPool();
  const earthId = reliefWindowId(c, pool.data);
  const zone = searchTarget(search)?.siteId ?? null;
  // The same queries the two views run (shared cache): what each half has decides the shared control and caption.
  const earth = useRelief(earthId);
  const mars = useMarsRelief(zone);
  const [ve, setVe] = useState<Exaggeration>(4);
  const both = !!earth.data && !!mars.data;
  const [side, setSide] = useState<"mars" | "earth">("earth");
  const root = useRef<HTMLDivElement>(null);
  const room = usePanelRoom(root);
  // Wide halves float their controls beside the block; narrower ones (tablets, phones) keep a deck row under the scene.
  const controls = !phone && room.width >= 2 * FLOAT_MIN_HALF + 16 ? "float" : "deck";
  // Desktop: the scenes fill what the panel shows, less what sits around them.
  const reserve = RESERVE.strip + RESERVE.status + (controls === "deck" ? RESERVE.deck : 0) + (both ? RESERVE.shared : 0);
  const sceneH = phone ? PHONE_SCENE : Math.max(SCENE.min, Math.min(SCENE.max, room.height - reserve));
  // A half with no grid draws its notice over the scene and status bar's height, so both halves end level.
  const noticeH = sceneH + STATUS_BAR;
  // Why the Earth half has no grid, in the same words in its notice and in the caption (null while it may still get one).
  const earthMissing = earthId ? null
    : c.tier === 1 ? "A global-screen cell has no relief grid."
      : pool.isPending ? null
        : pool.isError ? "The research pool could not be loaded." : "This window is not in the research pool, so it has no relief grid.";
  const earthLine = earth.isError ? unavailableWords("earth", earth.error instanceof ApiError ? earth.error : { message: earth.error.message }).plain
    : earthMissing ?? (earthId ? "Loading the elevation grid." : "Loading the research pool.");

  const half = (planet: "mars" | "earth") => planet === "mars" ? (
    <Half planet="mars" name={targets.mars.name} kind={zone ? "Exploration Zone" : "Search target"} relief={mars.data ?? null}>
      {zone ? (
        <ReliefView planet="mars" id={zone} title={targets.mars.name} density="compact" controls={controls} sceneHeight={mars.data ? sceneH : noticeH}
          wheel="modifier" exaggeration={ve} onExaggerationChange={setVe} exaggerationControl={!both} />
      ) : (
        <ReliefNotice planet="mars" title="No Mars elevation grid" height={noticeH}>
          <p className="text-body text-ink">Mars relief is served per Exploration Zone, and this target is a free point.</p>
          <p className="mt-1.5">No other surface is shown in its place.</p>
        </ReliefNotice>
      )}
    </Half>
  ) : (
    <Half planet="earth" name={targets.earth.name} kind={c.tier === 2 ? "Research window" : "Screening cell"} relief={earth.data ?? null}>
      {earthId ? (
        <ReliefView key={earthId} planet="earth" id={earthId} title={targets.earth.name} density="compact" controls={controls} sceneHeight={earth.isError ? noticeH : sceneH}
          wheel="modifier" exaggeration={ve} onExaggerationChange={setVe} exaggerationControl={!both} />
      ) : !earthMissing ? (
        <div className="grid place-items-center border border-line-strong bg-[#030405]" style={{ height: noticeH }}><Spinner label="Loading the research pool" /></div>
      ) : (
        <ReliefNotice planet="earth" title="No relief grid" height={noticeH}>
          <p className="text-body text-ink">{earthMissing}</p>
          <p className="mt-1.5">{c.tier === 1 ? "Relief grids exist only for the research pool's windows. " : ""}No other terrain is shown in its place.</p>
        </ReliefNotice>
      )}
    </Half>
  );

  return (
    <div ref={root} className="min-w-0">
      {/* The views choose their home view once, from the controls layout: wait for the first measure (before paint). */}
      {!phone && room.width === 0 ? null : phone ? (
        <>
          <PlanetSwitch value={side} onChange={setSide} />
          <div className="mt-2.5">{half(side)}</div>
        </>
      ) : (
        <>
          {both && (
            <div className="mb-2.5 flex items-center justify-end gap-3">
              <span aria-hidden className="text-caption text-muted">Same vertical exaggeration on both halves</span>
              <ExaggerationSwitch value={ve} onChange={setVe}
                label={<><span aria-hidden>V.E.</span><span className="sr-only">Vertical exaggeration, the same on both halves</span></>} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {half("mars")}
            {half("earth")}
          </div>
        </>
      )}
      <Caption earth={earth.data ?? null} earthLine={earthLine} mars={mars.data ?? null} zone={zone} ve={ve} both={both} tier={c.tier}
        marsWhy={mars.isError ? unavailableWords("mars", mars.error instanceof ApiError ? mars.error : { message: mars.error.message }).plain : null} />
    </div>
  );
}

/** `null` until a viewer is wired; the mode switch offers "3D relief" only when this is set (modes.ts). */
export const ReliefViewer: ComponentType<ReliefViewerProps> | null = CompareRelief;

/** One planet's column: a strip naming it (with its real elevation range once loaded), then the view. */
function Half({ planet, name, kind, relief, children }: { planet: "mars" | "earth"; name: string; kind: string; relief: Relief | null; children: ReactNode }) {
  const range = relief && relief.z_min !== null && relief.z_max !== null ? relief.z_max - relief.z_min : null;
  const m = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }).replace("-", "−");
  return (
    <section aria-label={`${planet === "mars" ? "Mars" : "Earth"} relief, ${name}`} className="min-w-0">
      <div className="mb-2 flex min-h-5 items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 translate-y-[-1px]", planet === "mars" ? "bg-mars" : "bg-earth")} />
          <span className={cx("kicker shrink-0", planet === "mars" ? "!text-mars" : "!text-earth")}>{planet === "mars" ? "Mars" : "Earth"}</span>
          <span className="toponym truncate text-[15px] leading-none tracking-[0.05em] text-ink">{name}</span>
          {kind.toLowerCase() !== name.toLowerCase() && <span className="kicker hidden truncate lg:inline">{kind}</span>}
        </span>
        {relief && relief.z_min !== null && relief.z_max !== null && (
          <span className="num shrink-0 text-num-sm text-muted">
            {m(relief.z_min)}–{m(relief.z_max)}<span className="font-sans text-[11px]"> m</span>
            {range !== null && <span className="max-sm:hidden"> · relief {m(range)}<span className="font-sans text-[11px]"> m</span></span>}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Phones: one planet at a time, as the shell's Mars / Earth switch does for the globes. */
function PlanetSwitch({ value, onChange }: { value: "mars" | "earth"; onChange: (v: "mars" | "earth") => void }) {
  const planets = ["mars", "earth"] as const;
  return (
    <div role="radiogroup" aria-label="Relief shown" onKeyDown={radioGroupKeys(planets, value, onChange)} className="flex border border-line-strong">
      {planets.map((p, i) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} tabIndex={value === p ? 0 : -1} onClick={() => onChange(p)}
          className={cx("hit label-caps flex flex-1 items-center justify-center gap-2 px-4 py-2", i > 0 && "border-l border-line-strong",
            value === p ? "bg-ink text-space" : "text-muted hover:bg-white/[0.05] hover:text-ink")}>
          <span aria-hidden className={cx("h-1.5 w-1.5", p === "mars" ? "bg-mars" : "bg-earth")} />
          {p === "mars" ? "Mars" : "Earth"}
        </button>
      ))}
    </div>
  );
}

/**
 * What each half is, from its own payload, and the basis the comparison's score uses instead: a research window's S is
 * computed on Earth as MOLA would observe it, a screening cell's on Earth as measured.
 */
function Caption({ earth, earthLine, mars, zone, ve, both, tier, marsWhy }: {
  earth: Relief | null; earthLine: string; mars: Relief | null; zone: string | null; ve: Exaggeration; both: boolean; tier: 1 | 2;
  marsWhy: string | null;
}) {
  const row = "grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-1.5";
  return (
    <dl className="mt-3 divide-y divide-line border-y border-line text-caption [&_button]:text-left">
      <div className={row}>
        <dt className="kicker !text-earth">Earth</dt>
        <dd className="text-muted">
          {earth ? (
            <>
              {earth.source.representation === "as_measured"
                ? <>Earth terrain: {G5.toggleMeasured} — the <Term k="operator">MOLA observation model</Term> is not applied · </>
                : <>{G5.toggleOom} · </>}
              {earth.source.title} · <GridFacts relief={earth} />
            </>
          ) : earthLine}
        </dd>
      </div>
      <div className={row}>
        <dt className="kicker !text-mars">Mars</dt>
        <dd className="text-muted">
          {mars ? <>Mars as measured · {mars.source.title} · <GridFacts relief={mars} /></>
            : !zone ? "No Exploration Zone, so no Mars grid." : marsWhy ?? "Checking for a Mars elevation grid."}
        </dd>
      </div>
      <div className={row}>
        <dt className="kicker">Scale</dt>
        <dd className="text-muted">
          {both ? <>Same vertical exaggeration on both halves: <span className="num text-ink">×{ve}</span>.</> : <>Vertical exaggeration <span className="num text-ink">×{ve}</span>.</>}
          {" "}{scoreBasisLine(tier, "comparison")}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Room for the viewer inside the scrolling panel around `ref`: the visible height left under its top edge, and its
 * width; re-measured whenever the panel or the viewer resizes.
 */
function usePanelRoom(ref: RefObject<HTMLElement | null>): { height: number; width: number } {
  const [room, setRoom] = useState({ height: 300, width: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    let box = el?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!el || !box) return;
    const panel = box;
    const measure = () => {
      const top = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
      const pad = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
      const next = { height: Math.round(panel.clientHeight - top - pad), width: Math.round(el.clientWidth) };
      setRoom((r) => (r.height === next.height && r.width === next.width ? r : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return room;
}
