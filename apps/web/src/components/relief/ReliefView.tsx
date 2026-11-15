/**
 * Terrain relief: a real-data 3D relief of one research window, drawn with raw WebGL2 (no dependency).
 * (Never called a "twin": in this project twins are the synthetic test terrains of the validation.)
 *
 * Everything on screen comes from the relief payload: the surface is the elevation grid itself
 * (gaps stay open over a hatched "no data" floor), contours and the elevation scale are in real
 * metres, the km scale is cols × cell_m, the probe reads a cell's own value, and the vertical
 * exaggeration is always written out. Interaction follows Apple's fluid-interface rules (./orbit.ts);
 * without WebGL2 the view falls back to a 2D hillshade with the same labels.
 *
 * The scene carries only the terrain, its scales and the probe mark. Readouts (heading, pitch, probe),
 * gesture hints and the keyboard map sit in a status bar under it, so no chrome ever covers a scale label.
 */
import { useReducedMotion } from "motion/react";
import { Compass, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ApiError, useMarsRelief, useRelief, useSites } from "../../services/api";
import type { Relief } from "../../types/contracts";
import { formatLat, formatLon } from "../../lib/geodesy";
import { Measure, radioGroupKeys } from "../primitives";
import { cx, Spinner } from "../ui";
import { drawFlat } from "./flat";
import { Orbit } from "./orbit";
import { ReliefRenderer, reliefContext } from "./reliefGl";
import {
  ariaSummary, axisPlacement, buildModel, camera, fmtHeading, fmtNum, fmtPitch, homePose, labelAnchors, layoutLabels, pickCell, project, rampColor,
  representationNote, SUN, TINT, toGrid,
  type Grid, type Model,
} from "./reliefMath";
import { unavailableWords } from "./unavailable";

export const EXAGGERATIONS = [1, 2, 4, 8] as const;
export type Exaggeration = (typeof EXAGGERATIONS)[number];

const DEG = Math.PI / 180;
const SCENE_BG = "bg-[#030405]";

export interface ReliefViewProps {
  planet: "earth" | "mars";
  /** Research-pool window id (Earth) or Exploration Zone id (Mars). */
  id: string | null | undefined;
  /** Display name; defaults to the Exploration Zone name (Mars) or the window id. */
  title?: string;
  defaultExaggeration?: Exaggeration;
  /** Controlled exaggeration: the host owns the value (one value for a Mars | Earth pair, say). */
  exaggeration?: Exaggeration;
  onExaggerationChange?: (v: Exaggeration) => void;
  /** The view's own exaggeration control; off when the host shows one shared control. */
  exaggerationControl?: boolean;
  /**
   * "full": a stand-alone viewer — title and readout header, controls over the scene, a legend with the source.
   * "compact": an instrument inside a panel — the scene at `sceneHeight`, a status bar and one control row
   * under it, a one-line legend; the host names the window and captions the source (`caption`).
   */
  density?: "full" | "compact";
  /** Scene height in CSS px (compact: 260 by default; full fills its container unless given). */
  sceneHeight?: number;
  /**
   * Where the exaggeration and view controls sit: "float" in the scene's lower corners from sm up (a wide scene
   * has room beside the block; phones keep a deck), "deck" in a row under the scene. Full floats, compact decks.
   */
  controls?: "deck" | "float";
  /**
   * Plain wheel or trackpad scrolling over the scene. "zoom" zooms the view. "modifier", for a view inside a
   * scrolling panel, leaves plain scrolling to the panel and zooms only with Ctrl or ⌘ held (a trackpad pinch
   * included); on touch, one finger moving up or down then scrolls the panel, a sideways swipe turns the block,
   * and two fingers zoom, turn and tilt.
   */
  wheel?: "zoom" | "modifier";
  /** Lines under the legend, from the loaded grid and the current exaggeration (source, basis). */
  caption?: (relief: Relief, ve: Exaggeration) => ReactNode;
  /** Title and readout strip ("full" only). Turn off when the host already names the window. */
  header?: boolean;
  /** "2d" forces the hillshade (print, tests). */
  renderer?: "auto" | "2d";
  occludes?: "mars" | "earth" | "both";
  className?: string;
}

/** Fetches the grid for a window (Earth) or Exploration Zone (Mars) and shows it, or says why it cannot. */
export function ReliefView({
  planet, id, title, defaultExaggeration = 4, exaggeration, onExaggerationChange, exaggerationControl = true, density = "full", sceneHeight: sceneHeightProp,
  controls: controlsProp, wheel = "zoom", caption, header = true, renderer = "auto", occludes, className,
}: ReliefViewProps) {
  const earth = useRelief(planet === "earth" ? id : null);
  const mars = useMarsRelief(planet === "mars" ? id : null);
  const q = planet === "earth" ? earth : mars;
  const relief = q.data ?? null;
  const compact = density === "compact";
  const sceneHeight = sceneHeightProp ?? (compact ? 260 : null);
  const controls = controlsProp ?? (compact ? "deck" : "float");
  // Mars: the Exploration Zone's own name and centre from the site list, even while no grid is connected.
  const sites = useSites();
  const site = planet === "mars" ? sites.data?.find((s) => s.id === id) ?? null : null;
  const name = title ?? site?.name ?? id ?? null;
  const siteKind = site ? (site.category === "nasa_exploration_zone" ? "NASA Exploration Zone" : site.category.replace(/_/g, " ")) : null;
  const where = relief ? { lat: relief.lat, lon: relief.lon, kind: relief.kind } : site && siteKind ? { lat: site.lat, lon: site.lon, kind: siteKind } : null;
  let body: ReactNode;
  if (!id) body = <Message title="No window selected" planet={planet}>Choose a research window to see its terrain in 3D.</Message>;
  else if (q.isPending) body = <div className="grid h-full place-items-center"><Spinner label="Loading relief grid" /></div>;
  else if (q.isError) body = <Unavailable planet={planet} error={q.error} />;
  return (
    <section aria-label={`Terrain relief${name ? `, ${name}` : ""}`} data-occludes={occludes}
      className={cx("relative flex min-h-0 flex-col", !compact && "surface overflow-hidden rounded-surface", className)}>
      {header && !compact && <Header planet={planet} name={name} relief={relief} where={where} />}
      {relief ? (
        <ReliefScene key={relief.id} relief={relief} planet={planet} name={name ?? relief.id} compact={compact} sceneHeight={sceneHeight}
          defaultExaggeration={defaultExaggeration} exaggeration={exaggeration} onExaggerationChange={onExaggerationChange}
          exaggerationControl={exaggerationControl} controls={controls} wheel={wheel} caption={caption} renderer={renderer} />
      ) : compact ? (
        // At least the scene's height, and taller when a message needs it (it is never cut).
        <div className={cx("relative grid border border-line-strong", SCENE_BG)} style={{ minHeight: sceneHeight ?? undefined }}>
          {body}
          <span aria-hidden className="frame pointer-events-none absolute inset-0" />
        </div>
      ) : (
        <div className={cx("relative grid border-t border-line", sceneHeight === null && "min-h-[240px] flex-1", SCENE_BG)} style={{ minHeight: sceneHeight ?? undefined }}>{body}</div>
      )}
      {/* Corner registration brackets above the content, so the scene's own background never covers them. */}
      {!compact && <span aria-hidden className="frame pointer-events-none absolute inset-0 z-20" />}
    </section>
  );
}

// ---------------------------------------------------------------- header and states

function Header({ planet, name, relief, where }: {
  planet: "earth" | "mars"; name: string | null; relief: Relief | null; where: { lat: number; lon: number; kind: string } | null;
}) {
  const range = relief && relief.z_min !== null && relief.z_max !== null ? relief.z_max - relief.z_min : null;
  return (
    <header className="relative px-4 pb-3 pt-3.5 sm:px-5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={cx("h-1.5 w-1.5", planet === "mars" ? "bg-mars" : "bg-earth")} />
        <span className="kicker !text-muted">Terrain relief</span>
        <span aria-hidden className="h-px w-4 bg-line-strong" />
        <span className="kicker">{planet === "mars" ? "Mars · Exploration Zone" : "Earth · research window"}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="toponym truncate text-toponym-sm text-ink">{name ?? "—"}</h3>
          <p className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-num-sm text-muted">
            {where ? <span>{formatLat(where.lat, 3)}  {formatLon(where.lon, 3)}</span> : <span className="text-faint">—</span>}
            {where && <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">{where.kind}</span>}
          </p>
        </div>
        {/* Phones: one full-width strip of three (the grid size is in the legend below). */}
        <dl className="grid w-full grid-cols-3 border-l border-t border-line sm:flex sm:w-auto sm:border-t-0">
          <Readout label="Min elev"><Measure value={relief?.z_min} unit="m" digits={1} /></Readout>
          <Readout label="Max elev"><Measure value={relief?.z_max} unit="m" digits={1} /></Readout>
          <Readout label="Relief"><Measure value={range} unit="m" digits={1} /></Readout>
          <Readout label="Grid" className="hidden sm:block">
            {relief ? <span className="num whitespace-nowrap">{relief.rows} × {relief.cols}<span className="ml-1.5 text-muted">@ {relief.cell_m.toFixed(2)}</span><span className="ml-[0.18em] font-sans text-[11px] text-muted">m</span></span> : <span className="num text-faint">—</span>}
          </Readout>
        </dl>
      </div>
    </header>
  );
}

function Readout({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 border-b border-r border-line px-3 py-1.5 sm:border-b-0 sm:last:border-r-0", className)}>
      <dt className="kicker !text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-num text-ink">{children}</dd>
    </div>
  );
}

function Message({ title, planet, children }: { title: string; planet: "earth" | "mars"; children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-4 sm:p-6">
      <div className="frame max-w-[440px] border border-line px-4 py-3.5 [--frame-l:8px] sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cx("h-1.5 w-1.5 ring-1 ring-inset", planet === "mars" ? "ring-mars" : "ring-earth")} />
          <span className="label-caps text-ink">{title}</span>
        </div>
        <div className="mt-2 text-caption text-muted">{children}</div>
      </div>
    </div>
  );
}

/**
 * A scene-sized box that says why there is no relief to draw (for hosts that know before asking the server, e.g.
 * a screening cell, which has no pool window). Same frame and message as the view's own states.
 */
export function ReliefNotice({ planet, title, height, children }: { planet: "earth" | "mars"; title: string; height: number; children: ReactNode }) {
  return (
    <div role="status" className={cx("relative grid border border-line-strong", SCENE_BG)} style={{ minHeight: height }}>
      <Message planet={planet} title={title}>{children}</Message>
      <span aria-hidden className="frame pointer-events-none absolute inset-0" />
    </div>
  );
}

/**
 * Why there is no grid, in plain words first; the server's own reason and what it needs (dataset, setting,
 * owner) follow as one technical line. Mars relief needs the MOLA mosaic, which this API does not read yet.
 */
function Unavailable({ planet, error }: { planet: "earth" | "mars"; error: Error }) {
  const w = unavailableWords(planet, error instanceof ApiError ? error : { message: error.message });
  return (
    <div role="status" className="h-full">
      <Message planet={planet} title={w.title}>
        <p className="text-body text-ink">{w.plain}</p>
        {planet === "mars" && <p className="mt-1.5">No other surface is shown in its place.</p>}
        {w.technical && <p className="num mt-2.5 text-[10.5px] leading-snug text-faint">{w.technical}</p>}
      </Message>
    </div>
  );
}

// ---------------------------------------------------------------- scene

const AZ_STEP = 15 * DEG, EL_STEP = 5 * DEG, ZOOM_STEP = Math.log(1.25);

interface ViewRefs {
  orbit: Orbit;
  /** Request a frame (no-op until the renderer is up). */
  kick: MutableRefObject<() => void>;
  needle: MutableRefObject<SVGSVGElement | null>;
  /** Status bar cells, written every frame without a React render. */
  heading: MutableRefObject<HTMLSpanElement | null>;
  pitch: MutableRefObject<HTMLSpanElement | null>;
  probe: MutableRefObject<HTMLSpanElement | null>;
  /** The status bar itself (marked `data-probe` while a reading shows). */
  bar: MutableRefObject<HTMLDivElement | null>;
}

/**
 * Home view. A panel instrument with its controls in a deck (a squarer frame) looks a little steeper, so the block
 * fills the frame's height as well as its width; the distance still frames the whole block from every side.
 */
const homeFor = (ve: number, steep: boolean) => (steep ? { ...homePose(ve), el: 38 * DEG } : homePose(ve));

/** Transient status-bar message (e.g. how to zoom inside a scrolling panel). */
type Nudge = () => void;

function ReliefScene({ relief, planet, name, compact, sceneHeight, defaultExaggeration, exaggeration, onExaggerationChange, exaggerationControl, controls, wheel, caption, renderer }: {
  relief: Relief; planet: "earth" | "mars"; name: string; compact: boolean; sceneHeight: number | null;
  defaultExaggeration: Exaggeration; exaggeration: Exaggeration | undefined; onExaggerationChange: ((v: Exaggeration) => void) | undefined;
  exaggerationControl: boolean; controls: "deck" | "float"; wheel: "zoom" | "modifier"; caption: ReliefViewProps["caption"]; renderer: "auto" | "2d";
}) {
  const grid = useMemo(() => toGrid(relief), [relief]);
  const model = useMemo(() => buildModel(grid), [grid]);
  const [veOwn, setVeOwn] = useState<Exaggeration>(exaggeration ?? defaultExaggeration);
  const ve = exaggeration ?? veOwn;
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [keys, setKeys] = useState(false);
  const [nudged, setNudged] = useState(false);
  const veLabel = useId();
  const reduced = !!useReducedMotion();
  const [orbit] = useState(() => new Orbit(homeFor(ve, compact && controls === "deck"), reduced));
  const refs: ViewRefs = {
    orbit, kick: useRef(() => {}), needle: useRef<SVGSVGElement | null>(null),
    heading: useRef<HTMLSpanElement | null>(null), pitch: useRef<HTMLSpanElement | null>(null), probe: useRef<HTMLSpanElement | null>(null),
    bar: useRef<HTMLDivElement | null>(null),
  };
  const mode: "3d" | "2d" = renderer === "2d" || failed ? "2d" : "3d";

  useEffect(() => { orbit.reduced = reduced; }, [orbit, reduced]);
  useEffect(() => { orbit.setVE(ve); refs.kick.current(); }, [orbit, ve]); // refs are stable

  // The zoom hint stays up while scrolling continues over the scene, and goes 1.6 s after the last tick.
  const nudgeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);
  const nudge: Nudge = () => {
    setNudged(true);
    window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => setNudged(false), 1600);
  };

  // A repeated message (R pressed twice) differs by a trailing no-break space, so it is announced again.
  const flip = useRef(false);
  const announce = (text: string) => { flip.current = !flip.current; setStatus(flip.current ? text : `${text} `); };
  const choose = (v: Exaggeration) => {
    if (exaggeration === undefined) setVeOwn(v);
    onExaggerationChange?.(v);
    announce(`Vertical exaggeration ×${v}`);
  };
  const act: Act = (f, say) => {
    f(orbit);
    refs.kick.current();
    const text = typeof say === "function" ? say(orbit) : say;
    if (text) announce(text);
  };
  const label = ariaSummary(relief, ve, planet, mode);
  // "float": the controls sit in the scene's lower corners from sm up (a deck row below on phones and for the 2D map).
  const float = controls === "float" && mode === "3d";
  // Floating, the control carries its label in words above it; in the deck row it is the compact "V.E." group. Both may
  // be in the DOM (one hidden per breakpoint), so each has its own label id.
  const veControl = (deck: boolean) => exaggerationControl && model && (
    <ExaggerationControl ve={ve} choose={choose} planet={planet} labelId={deck ? `${veLabel}d` : veLabel} compact={deck} mode={mode} />
  );

  return (
    <>
      <div className={cx("relative flex flex-col", compact ? "border border-line-strong" : "border-t border-line", sceneHeight === null && "min-h-[320px] flex-1", SCENE_BG)}
        style={sceneHeight !== null ? { height: sceneHeight } : undefined}>
        <div className={cx("relative flex-1 overflow-hidden", sceneHeight === null && "min-h-[260px]")}>
          {!model ? (
            <Message planet={planet} title="No elevation in this window">Every cell of this grid is empty; there is no surface to draw.</Message>
          ) : mode === "3d" ? (
            <Viewport3D model={model} grid={grid} planet={planet} label={label} name={name} refs={refs} act={act} onFail={setFailed}
              wheel={wheel} onNudge={nudge} onKeys={setKeys} />
          ) : (
            <ViewportFlat model={model} grid={grid} planet={planet} ve={ve} label={label} />
          )}
        </div>
        {float && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 hidden items-end justify-between gap-6 sm:flex">
            <div className="pointer-events-auto">{veControl(false)}</div>
            <div className="pointer-events-auto"><NavStack act={act} needle={refs.needle} vertical /></div>
          </div>
        )}
        {compact && <span aria-hidden className="frame pointer-events-none absolute inset-0 z-10" />}
      </div>
      {model && (
        <StatusBar refs={refs} mode={mode} compact={compact} wheel={wheel} keys={keys} nudged={nudged} />
      )}
      {model && (
        // The deck: always in compact, and on phones (or for the 2D map) in full, so nothing covers the map. With
        // touch-sized targets it becomes two full-width rows: exaggeration, then the view buttons.
        <div className={cx("relative flex items-center justify-between gap-3 pointer-coarse:flex-wrap pointer-coarse:gap-2",
          compact ? "border-x border-b border-line-strong px-1.5 py-1.5" : "border-t border-line px-3 py-2.5 sm:px-5", float && "sm:hidden")}>
          {veControl(true) || <span />}
          {mode === "3d" ? <NavStack act={act} needle={refs.needle} /> : failed && (
            <p className="max-w-[300px] text-caption text-muted sm:text-right">{failed}</p>
          )}
        </div>
      )}
      <p aria-live="polite" className="sr-only">{status}</p>
      {model && <Legend model={model} relief={relief} planet={planet} compact={compact} />}
      {caption && <div className={cx(compact ? "mt-2.5" : "border-t border-line px-4 py-3 sm:px-5")}>{caption(relief, ve)}</div>}
    </>
  );
}

/** Apply a camera step, redraw, and announce it (a message, or one composed from the new targets). */
type Act = (f: (o: Orbit) => void, say?: string | ((o: Orbit) => string)) => void;

/** Spoken view state after a keyboard or button step, from where the step is heading (not mid-animation). */
const said = {
  heading: (o: Orbit) => `Heading ${fmtHeading(o.az.target ?? o.az.x)}`,
  pitch: (o: Orbit) => `Pitch ${fmtPitch(o.el.target ?? o.el.x)}`,
  zoom: (o: Orbit) => `Zoom ×${(1 / Math.exp(o.zoom.target ?? o.zoom.x)).toFixed(2)}`,
};

/**
 * Vertical exaggeration: joined square cells, the selected one inverted with a planet-colour rule. A radio
 * group (one Tab stop; arrows, Home and End). Compact rows abbreviate the label to the geologists' "V.E.".
 */
function ExaggerationControl({ ve, choose, planet, labelId, compact, mode }: {
  ve: Exaggeration; choose: (v: Exaggeration) => void; planet: "earth" | "mars"; labelId: string; compact: boolean; mode: "3d" | "2d";
}) {
  return (
    <div className={cx("flex", compact ? "items-center gap-2 pointer-coarse:w-full" : "flex-col gap-1.5")}>
      <span id={labelId} className={cx(compact ? "kicker !text-[10px] !text-muted" : "label-caps on-imagery text-ink")} title="Vertical exaggeration">
        {compact ? <><span aria-hidden>V.E.</span><span className="sr-only">Vertical exaggeration</span></> : <>Vertical exaggeration <span className="num tracking-normal">×{ve}</span></>}
        {mode === "2d" && <span className="ml-1.5 text-faint">(shading)</span>}
      </span>
      <ExaggerationCells ve={ve} choose={choose} tone={planet} labelId={labelId} compact={compact} />
    </div>
  );
}

function ExaggerationCells({ ve, choose, tone, labelId, compact }: {
  ve: Exaggeration; choose: (v: Exaggeration) => void; tone: "earth" | "mars" | "ink"; labelId: string; compact: boolean;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} onKeyDown={radioGroupKeys(EXAGGERATIONS, ve, choose)}
      className={cx("inline-flex w-max divide-x divide-line-strong border border-line-strong bg-[rgb(3_4_5/0.86)]", compact && "pointer-coarse:w-auto pointer-coarse:flex-1")}>
      {EXAGGERATIONS.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === ve} tabIndex={v === ve ? 0 : -1} onClick={() => choose(v)}
          className={cx("hit num text-[12px] transition-colors duration-150 active:duration-0", compact ? "h-7 w-9 pointer-coarse:w-auto pointer-coarse:flex-1" : "h-8 w-11",
            v === ve ? cx("bg-ink text-space", tone === "mars" ? "shadow-[inset_0_-2px_0_var(--color-mars)]" : tone === "earth" ? "shadow-[inset_0_-2px_0_var(--color-earth)]" : "")
              : "text-muted hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12]")}>
          ×{v}
        </button>
      ))}
    </div>
  );
}

/**
 * One vertical-exaggeration control for several relief views (each then set `exaggerationControl={false}` and
 * take `exaggeration` from the host), so a Mars | Earth pair is always drawn at the same exaggeration.
 */
export function ExaggerationSwitch({ value, onChange, label = "Vertical exaggeration", className }: {
  value: Exaggeration; onChange: (v: Exaggeration) => void; label?: ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <span id={id} className="kicker !text-[10px] !text-muted">{label}</span>
      <ExaggerationCells ve={value} choose={onChange} tone="ink" labelId={id} compact />
    </div>
  );
}

/** Zoom, face north and reset: a joined row under the scene, or a vertical stack in the full view's corner. */
function NavStack({ act, needle, vertical = false }: { act: Act; needle: MutableRefObject<SVGSVGElement | null>; vertical?: boolean }) {
  const btn = cx("hit grid place-items-center bg-[#05070a] text-muted transition-colors duration-150 hover:bg-[#101317] hover:text-ink active:bg-[#1a1e23] active:duration-0",
    vertical ? "h-9 w-9" : "h-7 w-8 pointer-coarse:w-auto pointer-coarse:flex-1");
  const icon = vertical ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div role="group" aria-label="Relief view" className={cx("flex gap-px border border-line-strong bg-line-strong", vertical ? "flex-col" : "pointer-coarse:w-full")}>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in (+)" onClick={() => act((o) => o.nudge("zoom", -ZOOM_STEP), said.zoom)}><Plus className={icon} strokeWidth={1.6} /></button>
      <button type="button" className={btn} aria-label="Zoom out" title="Zoom out (−)" onClick={() => act((o) => o.nudge("zoom", ZOOM_STEP), said.zoom)}><Minus className={icon} strokeWidth={1.6} /></button>
      <button type="button" className={btn} aria-label="Face north" title="Face north (N)" onClick={() => act((o) => o.faceNorth(), "Facing north")}>
        <Compass ref={needle} className={cx(icon, "will-change-transform")} strokeWidth={1.6} aria-hidden />
      </button>
      <button type="button" className={btn} aria-label="Reset view" title="Reset view (R)" onClick={() => act((o) => o.reset(), "View reset")}><RotateCcw className={icon} strokeWidth={1.6} /></button>
    </div>
  );
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Instrument status bar under the scene (visual only; the canvas describes itself to assistive technology).
 * Left: heading and pitch. Right, by priority: the zoom hint after plain scrolling in a panel, the probe under a
 * resting mouse pointer, the keyboard map while the scene has keyboard focus, else how to move the view.
 */
function StatusBar({ refs, mode, compact, wheel, keys, nudged }: {
  refs: ViewRefs; mode: "3d" | "2d"; compact: boolean; wheel: "zoom" | "modifier"; keys: boolean; nudged: boolean;
}) {
  const mod = IS_MAC ? "⌘" : "Ctrl";
  // The frame loop marks the bar `data-probe` while a probe reading shows; a compact bar then (and for a hint or the
  // keyboard map, `data-busy`) gives the whole width to the message, so nothing is cut.
  return (
    <div ref={refs.bar} aria-hidden data-busy={compact && (keys || nudged) ? "" : undefined}
      className={cx("group flex h-7 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap text-[10.5px] leading-none",
        compact ? "border-x border-b border-line-strong bg-[#05070a] px-2.5" : "border-t border-line px-4 sm:px-5")}>
      {mode === "3d" ? (
        <span className={cx("flex shrink-0 items-baseline gap-3", compact && "group-data-[busy]:hidden group-data-[probe]:hidden")}>
          <Cell label="Hdg"><span ref={refs.heading}>—</span></Cell>
          <Cell label="Pitch"><span ref={refs.pitch}>—</span></Cell>
          {!compact && <Cell label="Light" className="max-sm:hidden">{SUN.azDeg}° / {SUN.altDeg}°</Cell>}
        </span>
      ) : (
        <span className="label-caps !text-[10px] text-muted">2D hillshade · north up</span>
      )}
      <span className="ml-auto min-w-0 truncate text-right">
        <span ref={refs.probe} className="num hidden text-ink group-data-[probe]:inline" />
        <span className={cx("group-data-[probe]:hidden", nudged ? "text-ink" : "text-faint")}>
          {mode === "2d" ? "Lit from the north-west"
            : nudged ? <><Key>{mod}</Key> + scroll to zoom the view</>
              : keys ? <><Key>←</Key><Key>→</Key> turn <Key>↑</Key><Key>↓</Key> tilt <Key>+</Key><Key>−</Key> zoom <Key>N</Key> north <Key>R</Key> reset</>
                : (
                  <>
                    <span className="pointer-coarse:hidden">{wheel === "modifier" ? <>Drag to orbit · <Key>{mod}</Key> + scroll to zoom</> : "Drag to orbit · scroll to zoom"}</span>
                    <span className="hidden pointer-coarse:inline">{wheel === "modifier" ? "Swipe to turn · pinch to zoom" : "Drag to orbit · pinch to zoom"}</span>
                  </>
                )}
        </span>
      </span>
    </div>
  );
}

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("flex items-baseline gap-1.5", className)}>
      <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>
      <span className="num text-ink">{children}</span>
    </span>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="num mx-px inline-grid h-[15px] min-w-[15px] place-items-center border border-line-strong px-0.5 text-[9.5px] text-ink">{children}</span>;
}

// ---------------------------------------------------------------- 3D viewport

function Viewport3D({ model, grid, planet, label, name, refs, act, onFail, wheel, onNudge, onKeys }: {
  model: Model; grid: Grid; planet: "earth" | "mars"; label: string; name: string; refs: ViewRefs; act: Act; onFail: (why: string) => void;
  wheel: "zoom" | "modifier"; onNudge: Nudge; onKeys: (on: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const probeMark = useRef<HTMLSpanElement>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const anchors = useMemo(() => labelAnchors(model), [model]);
  const hint = useId();
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const wheelRef = useRef(wheel);
  wheelRef.current = wheel;
  const nudgeRef = useRef(onNudge);
  nudgeRef.current = onNudge;

  useEffect(() => {
    const cv = canvas.current!, box = host.current!, o = refs.orbit;
    const gl = reliefContext(cv);
    if (!gl) { failRef.current("This browser has no WebGL2, which the 3D view needs."); return; }
    let r: ReliefRenderer;
    try {
      r = new ReliefRenderer(gl);
      r.setModel(model);
    } catch (err) {
      console.warn("[relief]", err);
      failRef.current("The 3D renderer could not start.");
      return;
    }
    o.establish();
    const size = { w: 1, h: 1, dpr: 1 };
    const draw = () => {
      const pose = o.pose;
      const cam = camera(model, pose, size.w, size.h);
      r.draw({ cam, ve: pose.ve, planet, place: axisPlacement(cam), dpr: size.dpr }, cv.width, cv.height);
      const shown = new Set<string>();
      for (const l of layoutLabels(model, anchors, cam, size.w, size.h)) {
        const el = labelEls.current.get(l.key);
        if (!el) continue;
        shown.add(l.key);
        el.style.visibility = "visible";
        el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0) translate(${l.align === "right" ? "-100%" : l.align === "left" ? "0" : "-50%"}, -50%)`;
      }
      for (const [key, el] of labelEls.current) if (!shown.has(key)) el.style.visibility = "hidden";
      if (refs.heading.current) refs.heading.current.textContent = fmtHeading(pose.az);
      if (refs.pitch.current) refs.pitch.current.textContent = fmtPitch(pose.el);
      // Same convention as the globe's compass (NavControls): the needle points to north on screen.
      if (refs.needle.current) refs.needle.current.style.transform = `rotate(${-cam.headingDeg - 45}deg)`;
      // Probe: the cell under a resting mouse pointer, read from the grid itself.
      const h = o.held ? null : hover.current;
      const hit = h ? pickCell(model, grid, cam, h.x, h.y, size.w, size.h) : null;
      if (refs.probe.current) {
        refs.probe.current.textContent = hit
          ? `${hit.elevation === null ? "no elevation" : `${fmtNum(hit.elevation, 1)} m`}  ·  ${hit.eastKm.toFixed(1)} km E  ${hit.northKm.toFixed(1)} km N`
          : "";
      }
      if (hit) refs.bar.current?.setAttribute("data-probe", "");
      else refs.bar.current?.removeAttribute("data-probe");
      if (probeMark.current) {
        const s = hit ? project(cam.viewProj, hit.p, size.w, size.h) : null;
        probeMark.current.style.visibility = s?.visible ? "visible" : "hidden";
        if (s?.visible) probeMark.current.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
      }
    };
    let raf = 0, last = 0;
    const frame = (now: number) => {
      raf = 0;
      // First frame after idle: one display frame, so a release hands its velocity over without a stall.
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const moving = o.step(dt, now);
      draw();
      if (moving) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const k = () => { if (!raf) raf = requestAnimationFrame(frame); };
    refs.kick.current = k;
    const ro = new ResizeObserver(() => {
      const rect = box.getBoundingClientRect();
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      size.w = Math.max(1, rect.width);
      size.h = Math.max(1, rect.height);
      cv.width = Math.round(size.w * size.dpr);
      cv.height = Math.round(size.h * size.dpr);
      draw(); // repaint in the same frame as the resize: no blank flash
      k();
    });
    ro.observe(box);
    const lost = (e: Event) => { e.preventDefault(); failRef.current("The 3D view lost its graphics context."); };
    const onWheel = (e: WheelEvent) => {
      // Inside a scrolling panel plain scrolling belongs to the panel; Ctrl or ⌘ (and a trackpad pinch, which
      // browsers send as a Ctrl wheel) zooms the view.
      if (wheelRef.current === "modifier" && !e.ctrlKey && !e.metaKey) { nudgeRef.current(); return; }
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      // A trackpad pinch arrives as small Ctrl-wheel steps on the browser's pinch scale (zoom = e^(−Δ/100)):
      // follow the fingers 1:1 rather than at the mouse-wheel rate.
      const pinch = e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaY) < 40;
      o.wheel(pinch ? dy * 6.25 : dy, performance.now());
      k();
    };
    cv.addEventListener("webglcontextlost", lost);
    cv.addEventListener("wheel", onWheel, { passive: false });
    k();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("webglcontextlost", lost);
      cv.removeEventListener("wheel", onWheel);
      refs.kick.current = () => {};
      r.dispose();
      // Browsers cap live WebGL contexts: give this one back once the canvas has really left the page
      // (a re-render with new data, or StrictMode's rehearsal, keeps the same canvas and context).
      if (!cv.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [model, grid, planet, anchors]); // refs are stable

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return { span: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), cy: (a.y + b.y) / 2 };
  };
  // A cancelled pointer (the browser took the gesture over, e.g. to scroll the panel) stops without a glide.
  const release = (e: React.PointerEvent<HTMLCanvasElement>, momentum: boolean) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const o = refs.orbit, now = performance.now();
    o.endPinch();
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      o.beginDrag(p.x, p.y, now); // the remaining finger keeps tracking from where it is
    } else if (pointers.current.size === 0) {
      o.endDrag(now, momentum);
      e.currentTarget.style.cursor = "";
    }
    refs.kick.current();
  };

  return (
    <div ref={host} className="absolute inset-0">
      {/* "application": a screen reader passes the arrow keys through to the view instead of reading on. */}
      <canvas ref={canvas} tabIndex={0} role="application" aria-roledescription="3D relief" aria-label={label} aria-describedby={hint}
        className={cx("absolute inset-0 h-full w-full cursor-grab select-none focus-visible:outline-offset-[-3px]!",
          // In a scrolling panel one finger moving up or down scrolls the panel; the view takes sideways swipes and two fingers.
          wheel === "modifier" ? "touch-pan-y" : "touch-none")}
        onFocus={(e) => onKeys(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => onKeys(false)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          const o = refs.orbit;
          if (pointers.current.size === 1) o.beginDrag(p.x, p.y, performance.now());
          else if (pointers.current.size === 2) { const t = twoFingers(); o.beginPinch(t.span, t.angle, t.cy); }
          e.currentTarget.style.cursor = "grabbing";
          refs.kick.current();
        }}
        onPointerMove={(e) => {
          const p = local(e);
          if (e.pointerType === "mouse") hover.current = p;
          if (pointers.current.has(e.pointerId)) {
            pointers.current.set(e.pointerId, p);
            const o = refs.orbit;
            if (pointers.current.size === 1) o.moveDrag(p.x, p.y, performance.now(), e.currentTarget.clientWidth);
            else if (pointers.current.size === 2) { const t = twoFingers(); o.movePinch(t.span, t.angle, t.cy, e.currentTarget.clientWidth); }
          }
          refs.kick.current();
        }}
        onPointerLeave={() => { hover.current = null; refs.kick.current(); }}
        onPointerUp={(e) => release(e, true)}
        onPointerCancel={(e) => release(e, false)}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowLeft": act((o) => o.nudge("az", -AZ_STEP), said.heading); break;
            case "ArrowRight": act((o) => o.nudge("az", AZ_STEP), said.heading); break;
            case "ArrowUp": act((o) => o.nudge("el", EL_STEP), said.pitch); break;
            case "ArrowDown": act((o) => o.nudge("el", -EL_STEP), said.pitch); break;
            case "+": case "=": act((o) => o.nudge("zoom", -ZOOM_STEP), said.zoom); break;
            case "-": case "_": act((o) => o.nudge("zoom", ZOOM_STEP), said.zoom); break;
            case "r": case "R": act((o) => o.reset(), "View reset"); break;
            case "n": case "N": act((o) => o.faceNorth(), "Facing north"); break;
            default: return;
          }
          e.preventDefault();
        }}
      />
      {/* Description only (read through aria-describedby), so it is not read a second time as page text. */}
      <span id={hint} hidden>
        {`${name}. Drag to orbit, two fingers to zoom, turn and tilt. ${wheel === "modifier" ? `Hold ${IS_MAC ? "Command" : "Control"} and scroll to zoom. ` : ""}Arrow keys rotate and tilt, plus and minus zoom, N faces north, R resets the view.`}
      </span>

      {/* Scale labels, positioned every frame from the 3D anchors. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {anchors.map((a) => (
          <span key={a.key} ref={(el) => { if (el) labelEls.current.set(a.key, el); else labelEls.current.delete(a.key); }}
            style={{ visibility: "hidden" }}
            className={cx("on-imagery absolute left-0 top-0 whitespace-nowrap will-change-transform",
              a.kind === "north" ? "font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[0.12em] text-ink"
                : a.kind === "elev" ? "num px-1.5 text-[11px] text-ink" : "num text-[10.5px] text-ink/75")}>
            {a.text}
          </span>
        ))}
        {/* Probe mark: gapped crosshair on the surface point under the pointer. */}
        <span ref={probeMark} style={{ visibility: "hidden" }} className="absolute left-0 top-0 will-change-transform">
          <span className="absolute -left-[7px] top-0 h-px w-[4px] bg-ink" />
          <span className="absolute left-[3px] top-0 h-px w-[4px] bg-ink" />
          <span className="absolute -top-[7px] left-0 h-[4px] w-px bg-ink" />
          <span className="absolute left-0 top-[3px] h-[4px] w-px bg-ink" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2D fallback

function ViewportFlat({ model, grid, planet, ve, label }: { model: Model; grid: Grid; planet: "earth" | "mars"; ve: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const box = host.current!, c = cv.current!;
    const paint = () => {
      const r = box.getBoundingClientRect(), s = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * s));
      c.height = Math.max(1, Math.round(r.height * s));
      const ctx = c.getContext("2d");
      if (ctx) drawFlat(ctx, model, grid, { width: r.width, height: r.height, scale: s, ve, planet });
    };
    const ro = new ResizeObserver(paint);
    ro.observe(box);
    paint();
    document.fonts?.ready.then(paint).catch(() => {});
    return () => ro.disconnect();
  }, [model, grid, planet, ve]);
  return (
    <div ref={host} className="absolute inset-0">
      {/* A still image with nothing to operate, so it is not a tab stop. */}
      <canvas ref={cv} role="img" aria-label={label} className="h-full w-full" />
    </div>
  );
}

// ---------------------------------------------------------------- legend

function Legend({ model, relief, planet, compact }: { model: Model; relief: Relief; planet: "earth" | "mars"; compact: boolean }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const c = rampColor(t, TINT[planet]).map((v) => Math.round(Math.min(1, v * 0.89) * 255));
    return `rgb(${c.join(" ")}) ${t * 100}%`;
  }).join(", ");
  const noData = 1 - relief.valid_fraction;
  const as = representationNote(planet, relief.source.representation);
  const unit = <span className="ml-[0.18em] font-sans text-[11px]">m</span>;
  return (
    <footer className={cx(compact ? "mt-2.5" : "border-t border-line px-4 py-3 sm:px-5")}>
      <div className={cx("flex flex-wrap items-center", compact ? "gap-x-4 gap-y-1.5" : "gap-x-6 gap-y-2.5")}>
        <div className="flex items-center gap-2">
          <span className="kicker !text-[10px]">Elevation</span>
          <span className="num text-num-sm text-muted">{fmtNum(model.zMin)}</span>
          <span aria-hidden className={cx("h-2 border border-line-strong", compact ? "w-16" : "w-24")} style={{ backgroundImage: `linear-gradient(to right, ${stops})` }} />
          <span className="num text-num-sm text-muted">{fmtNum(model.zMax)}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="kicker !text-[10px]">Contours</span>
          {model.contour ? (
            <span className="num text-num-sm text-muted">{fmtNum(model.contour.interval)}{unit}
              <span className="mx-1.5 text-faint">·</span>index {fmtNum(model.contour.index)}{unit}</span>
          ) : <span className="text-caption text-faint">none (flat)</span>}
        </div>
        {/* Compact: the hatch key only where the floor can show (a full view always states the share). */}
        {(!compact || noData > 0) && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 border border-line-strong bg-[repeating-linear-gradient(45deg,rgb(242_244_245/0.35)_0_1px,transparent_1px_3.5px)]" />
            <span className="kicker !text-[10px]">No elevation</span>
            <span className="num text-num-sm text-muted">{(100 * noData).toFixed(1)}<span className="ml-[0.1em]">%</span></span>
          </div>
        )}
      </div>
      {!compact && (
        <p className="mt-2 text-caption text-faint">
          {relief.source.title} · {relief.rows} × {relief.cols} cells @ {relief.cell_m.toFixed(2)} m, north up
          {relief.source.vertical_reference ? <> · heights: {relief.source.vertical_reference}</> : null} · {as}.
        </p>
      )}
    </footer>
  );
}
