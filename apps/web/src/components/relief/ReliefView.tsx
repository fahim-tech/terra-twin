/**
 * Terrain twin: a real-data 3D relief of one research window, drawn with raw WebGL2 (no dependency).
 *
 * Everything on screen comes from the relief payload: the surface is the elevation grid itself
 * (gaps stay open over a hatched "no data" floor), contours and the elevation scale are in real
 * metres, the km scale is cols × cell_m, the probe reads a cell's own value, and the vertical
 * exaggeration is always written out. Interaction follows Apple's fluid-interface rules (./orbit.ts);
 * without WebGL2 the view falls back to a 2D hillshade with the same labels.
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
  ariaSummary, axisPlacement, buildModel, camera, fmtNum, fmtPitch, homePose, labelAnchors, layoutLabels, pickCell, project, rampColor, SUN, TINT, toGrid,
  type Grid, type Model,
} from "./reliefMath";

export const EXAGGERATIONS = [1, 2, 4, 8] as const;
export type Exaggeration = (typeof EXAGGERATIONS)[number];

const DEG = Math.PI / 180;

export interface ReliefViewProps {
  planet: "earth" | "mars";
  /** Research-pool window id (Earth) or Exploration Zone id (Mars). */
  id: string | null | undefined;
  /** Display name; defaults to the Exploration Zone name (Mars) or the window id. */
  title?: string;
  defaultExaggeration?: Exaggeration;
  /** Title and readout strip. Turn off when the host already names the window. */
  header?: boolean;
  /** "2d" forces the hillshade (print, tests). */
  renderer?: "auto" | "2d";
  occludes?: "mars" | "earth" | "both";
  className?: string;
}

/** Fetches the grid for a window (Earth) or Exploration Zone (Mars) and shows it, or says why it cannot. */
export function ReliefView({ planet, id, title, defaultExaggeration = 4, header = true, renderer = "auto", occludes, className }: ReliefViewProps) {
  const earth = useRelief(planet === "earth" ? id : null);
  const mars = useMarsRelief(planet === "mars" ? id : null);
  const q = planet === "earth" ? earth : mars;
  const relief = q.data ?? null;
  // Mars: the Exploration Zone's own name and centre from the site list, even while no grid is connected.
  const sites = useSites();
  const site = planet === "mars" ? sites.data?.find((s) => s.id === id) ?? null : null;
  const name = title ?? site?.name ?? id ?? null;
  const where = relief ? { lat: relief.lat, lon: relief.lon, kind: relief.kind } : site ? { lat: site.lat, lon: site.lon, kind: "NASA Exploration Zone" } : null;
  let body: ReactNode;
  if (!id) body = <Message title="No window selected" planet={planet}>Choose a research window to see its terrain in 3D.</Message>;
  else if (q.isPending) body = <div className="grid h-full place-items-center"><Spinner label="Loading relief grid" /></div>;
  else if (q.isError) body = <Unavailable planet={planet} error={q.error} />;
  return (
    <section aria-label={`Terrain relief${name ? `, ${name}` : ""}`} data-occludes={occludes}
      className={cx("surface frame relative flex min-h-0 flex-col overflow-hidden rounded-surface", className)}>
      {header && <Header planet={planet} name={name} relief={relief} where={where} />}
      {relief
        ? <ReliefScene key={relief.id} relief={relief} planet={planet} defaultExaggeration={defaultExaggeration} renderer={renderer} name={name ?? relief.id} />
        : <div className="relative min-h-[240px] flex-1 border-t border-line bg-[#030405]">{body}</div>}
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
        <span className="kicker !text-muted">Terrain twin</span>
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
        <dl className="grid grid-cols-2 border-l border-t border-line sm:flex sm:border-t-0">
          <Readout label="Min elev"><Measure value={relief?.z_min} unit="m" digits={1} /></Readout>
          <Readout label="Max elev"><Measure value={relief?.z_max} unit="m" digits={1} /></Readout>
          <Readout label="Relief"><Measure value={range} unit="m" digits={1} /></Readout>
          <Readout label="Grid">
            {relief ? <span className="num whitespace-nowrap">{relief.rows} × {relief.cols}<span className="ml-1.5 text-muted">@ {relief.cell_m.toFixed(2)}</span><span className="ml-[0.18em] font-sans text-[11px] text-muted">m</span></span> : <span className="num text-faint">—</span>}
          </Readout>
        </dl>
      </div>
    </header>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-r border-line px-3 py-1.5 sm:border-b-0 sm:last:border-r-0">
      <dt className="kicker !text-[10px]">{label}</dt>
      <dd className="mt-0.5 text-num text-ink">{children}</dd>
    </div>
  );
}

function Message({ title, planet, children }: { title: string; planet: "earth" | "mars"; children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="frame max-w-[420px] border border-dashed border-line-strong px-5 py-4 [--frame-l:8px]">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cx("h-1.5 w-1.5 ring-1 ring-inset", planet === "mars" ? "ring-mars" : "ring-earth")} />
          <span className="label-caps text-ink">{title}</span>
        </div>
        <div className="mt-2 text-caption text-muted">{children}</div>
      </div>
    </div>
  );
}

function Unavailable({ planet, error }: { planet: "earth" | "mars"; error: Error }) {
  const detail = error instanceof ApiError ? (error.detail as { missing_inputs?: string[]; owner?: string } | undefined) : undefined;
  return (
    <div role="status" className="h-full">
      <Message planet={planet} title={planet === "mars" ? "No Mars elevation grid" : "Relief unavailable"}>
        <p className="text-body text-ink">{error.message}</p>
        {detail?.missing_inputs?.length ? (
          <p className="mt-2">Needs {detail.missing_inputs.join(", ")}{detail.owner ? ` · ${detail.owner}` : ""}.</p>
        ) : null}
        {planet === "mars" && <p className="mt-2">No other surface is shown in its place.</p>}
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
}

function ReliefScene({ relief, planet, defaultExaggeration, renderer, name }: {
  relief: Relief; planet: "earth" | "mars"; defaultExaggeration: Exaggeration; renderer: "auto" | "2d"; name: string;
}) {
  const grid = useMemo(() => toGrid(relief), [relief]);
  const model = useMemo(() => buildModel(grid), [grid]);
  const [ve, setVe] = useState<Exaggeration>(defaultExaggeration);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const veLabel = useId();
  const reduced = !!useReducedMotion();
  const [orbit] = useState(() => new Orbit(homePose(defaultExaggeration), reduced));
  const refs: ViewRefs = { orbit, kick: useRef(() => {}), needle: useRef<SVGSVGElement | null>(null) };
  const mode: "3d" | "2d" = renderer === "2d" || failed ? "2d" : "3d";

  useEffect(() => { orbit.reduced = reduced; }, [orbit, reduced]);
  useEffect(() => { orbit.setVE(ve); refs.kick.current(); }, [orbit, ve]); // refs are stable

  const choose = (v: Exaggeration) => { setVe(v); setStatus(`Vertical exaggeration ×${v}`); };
  const act = (f: (o: Orbit) => void, say?: string) => { f(orbit); refs.kick.current(); if (say) setStatus(say); };
  const label = ariaSummary(relief, ve, planet, mode);

  return (
    <>
      <div className="relative flex min-h-[320px] flex-1 flex-col border-t border-line bg-[#030405]">
        <div className="relative min-h-[260px] flex-1 overflow-hidden">
          {!model ? (
            <Message planet={planet} title="No elevation in this window">Every cell of this grid is empty; there is no surface to draw.</Message>
          ) : mode === "3d" ? (
            <Viewport3D model={model} grid={grid} planet={planet} label={label} name={name} refs={refs} act={act} onFail={setFailed} />
          ) : (
            <ViewportFlat model={model} grid={grid} planet={planet} ve={ve} label={label} />
          )}
          {mode === "2d" && model && (
            <p className="on-imagery absolute right-3 top-3 z-10 max-w-[240px] text-right text-caption text-muted">
              <span className="label-caps block text-ink">2D hillshade</span>
              North up, lit from the north-west.{failed ? ` ${failed}` : ""}
            </p>
          )}
        </div>
        {model && (
          // Phones: a deck under the scene. Larger screens: the same controls float in the scene's lower corners.
          <div className="relative z-10 flex items-end justify-between gap-3 border-t border-line px-3 py-2.5 sm:pointer-events-none sm:absolute sm:inset-x-4 sm:bottom-4 sm:border-0 sm:p-0">
            <div className="flex flex-col gap-1.5 sm:pointer-events-auto">
              <span id={veLabel} className="label-caps on-imagery text-ink">
                Vertical exaggeration <span className="num tracking-normal">×{ve}</span>
                {mode === "2d" && <span className="ml-1.5 text-faint">(shading)</span>}
              </span>
              <div role="radiogroup" aria-labelledby={veLabel} onKeyDown={radioGroupKeys(EXAGGERATIONS, ve, choose)}
                className="inline-flex w-max divide-x divide-line-strong border border-line-strong bg-[rgb(3_4_5/0.86)]">
                {EXAGGERATIONS.map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={v === ve} tabIndex={v === ve ? 0 : -1} onClick={() => choose(v)}
                    className={cx("hit num h-8 w-11 text-[12px] transition-colors duration-150 active:duration-0",
                      v === ve ? cx("bg-ink text-space", planet === "mars" ? "shadow-[inset_0_-2px_0_var(--color-mars)]" : "shadow-[inset_0_-2px_0_var(--color-earth)]")
                        : "text-muted hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12]")}>
                    ×{v}
                  </button>
                ))}
              </div>
            </div>
            {mode === "3d" && <NavStack act={act} needle={refs.needle} />}
          </div>
        )}
        <p aria-live="polite" className="sr-only">{status}</p>
      </div>
      {model && <Legend model={model} relief={relief} planet={planet} />}
    </>
  );
}

const navBtn = "hit grid h-9 w-9 place-items-center bg-[#05070a] text-muted transition-colors duration-150 hover:bg-[#101317] hover:text-ink active:bg-[#1a1e23] active:duration-0";

/** Zoom, face north and reset: 2 × 2 in the phone deck, a vertical stack in the scene's corner elsewhere. */
function NavStack({ act, needle }: { act: (f: (o: Orbit) => void, say?: string) => void; needle: MutableRefObject<SVGSVGElement | null> }) {
  return (
    <div role="group" aria-label="Relief view" className="grid grid-cols-2 gap-px border border-line-strong bg-line sm:pointer-events-auto sm:flex sm:flex-col">
      <button type="button" className={navBtn} aria-label="Zoom in" title="Zoom in (+)" onClick={() => act((o) => o.nudge("zoom", -ZOOM_STEP))}><Plus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button type="button" className={navBtn} aria-label="Zoom out" title="Zoom out (−)" onClick={() => act((o) => o.nudge("zoom", ZOOM_STEP))}><Minus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button type="button" className={navBtn} aria-label="Face north" title="Face north (N)" onClick={() => act((o) => o.faceNorth(), "Facing north")}>
        <Compass ref={needle} className="h-4 w-4 will-change-transform" strokeWidth={1.6} aria-hidden />
      </button>
      <button type="button" className={navBtn} aria-label="Reset view" title="Reset view (R)" onClick={() => act((o) => o.reset(), "View reset")}><RotateCcw className="h-4 w-4" strokeWidth={1.6} /></button>
    </div>
  );
}

// ---------------------------------------------------------------- 3D viewport

function Viewport3D({ model, grid, planet, label, name, refs, act, onFail }: {
  model: Model; grid: Grid; planet: "earth" | "mars"; label: string; name: string; refs: ViewRefs;
  act: (f: (o: Orbit) => void, say?: string) => void; onFail: (why: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const heading = useRef<HTMLSpanElement>(null);
  const pitch = useRef<HTMLSpanElement>(null);
  const probeEl = useRef<HTMLSpanElement>(null);
  const probeMark = useRef<HTMLSpanElement>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const anchors = useMemo(() => labelAnchors(model), [model]);
  const hint = useId();
  const failRef = useRef(onFail);
  failRef.current = onFail;

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
      if (heading.current) heading.current.textContent = `${String(Math.round(cam.headingDeg) % 360).padStart(3, "0")}°`;
      if (pitch.current) pitch.current.textContent = fmtPitch(pose.el);
      // Same convention as the globe's compass (NavControls): the needle points to north on screen.
      if (refs.needle.current) refs.needle.current.style.transform = `rotate(${-cam.headingDeg - 45}deg)`;
      // Probe: the cell under a resting mouse pointer, read from the grid itself.
      const h = o.held ? null : hover.current;
      const hit = h ? pickCell(model, grid, cam, h.x, h.y, size.w, size.h) : null;
      if (probeEl.current) {
        probeEl.current.textContent = hit
          ? `${hit.elevation === null ? "no elevation" : `${fmtNum(hit.elevation, 1)} m`}  ·  ${hit.eastKm.toFixed(1)} km E  ${hit.northKm.toFixed(1)} km N`
          : "—";
      }
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
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      o.wheel(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY, performance.now());
      k();
    };
    cv.addEventListener("webglcontextlost", lost);
    cv.addEventListener("wheel", wheel, { passive: false });
    k();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("webglcontextlost", lost);
      cv.removeEventListener("wheel", wheel);
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
    return { span: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const o = refs.orbit, now = performance.now();
    o.endPinch();
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      o.beginDrag(p.x, p.y, now); // the remaining finger keeps tracking from where it is
    } else if (pointers.current.size === 0) {
      o.endDrag(now);
      e.currentTarget.style.cursor = "";
    }
    refs.kick.current();
  };

  return (
    <div ref={host} className="absolute inset-0">
      <canvas ref={canvas} tabIndex={0} role="img" aria-label={label} aria-describedby={hint}
        className="peer absolute inset-0 h-full w-full cursor-grab touch-none select-none focus-visible:outline-offset-[-3px]!"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          const o = refs.orbit;
          if (pointers.current.size === 1) o.beginDrag(p.x, p.y, performance.now());
          else if (pointers.current.size === 2) { const t = twoFingers(); o.beginPinch(t.span, t.angle); }
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
            else if (pointers.current.size === 2) { const t = twoFingers(); o.movePinch(t.span, t.angle); }
          }
          refs.kick.current();
        }}
        onPointerLeave={() => { hover.current = null; refs.kick.current(); }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowLeft": act((o) => o.nudge("az", -AZ_STEP)); break;
            case "ArrowRight": act((o) => o.nudge("az", AZ_STEP)); break;
            case "ArrowUp": act((o) => o.nudge("el", EL_STEP)); break;
            case "ArrowDown": act((o) => o.nudge("el", -EL_STEP)); break;
            case "+": case "=": act((o) => o.nudge("zoom", -ZOOM_STEP)); break;
            case "-": case "_": act((o) => o.nudge("zoom", ZOOM_STEP)); break;
            case "r": case "R": act((o) => o.reset(), "View reset"); break;
            case "n": case "N": act((o) => o.faceNorth(), "Facing north"); break;
            default: return;
          }
          e.preventDefault();
        }}
      />
      <span id={hint} className="sr-only">
        {`${name}. Drag to orbit, two fingers to zoom and turn. Arrow keys rotate and tilt, plus and minus zoom, N faces north, R resets the view.`}
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

      {/* View readout (top-left) and keyboard map on focus (top-centre). */}
      <div aria-hidden className="on-imagery pointer-events-none absolute left-3 top-3 flex gap-4 sm:left-4">
        <Readline label="Hdg"><span ref={heading}>—</span></Readline>
        <Readline label="Pitch"><span ref={pitch}>—</span></Readline>
        <Readline label="Sun" className="hidden sm:flex">{SUN.azDeg}° / {SUN.altDeg}°</Readline>
        <Readline label="Probe" className="hidden min-w-[220px] sm:pointer-fine:flex"><span ref={probeEl}>—</span></Readline>
      </div>
      <div aria-hidden className="pointer-events-none absolute right-4 top-3 hidden opacity-0 transition-opacity duration-150 peer-focus-visible:opacity-100 lg:flex">
        <span className="label-caps border border-line-strong bg-[rgb(3_4_5/0.9)] px-2.5 py-1.5 !text-[10.5px] text-muted">
          <Key>←</Key><Key>→</Key> Rotate <Sep /> <Key>↑</Key><Key>↓</Key> Tilt <Sep /> <Key>+</Key><Key>−</Key> Zoom <Sep /> <Key>N</Key> North <Sep /> <Key>R</Key> Reset
        </span>
      </div>
    </div>
  );
}

function Readline({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("flex flex-col", className)}>
      <span className="kicker !text-[10px] !text-ink/60">{label}</span>
      <span className="num whitespace-nowrap text-num-sm text-ink">{children}</span>
    </span>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="num mr-0.5 inline-grid h-4 min-w-4 place-items-center border border-line-strong px-0.5 text-[10px] text-ink">{children}</span>;
}
function Sep() {
  return <span className="mx-1.5 text-faint">·</span>;
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
      <canvas ref={cv} tabIndex={0} role="img" aria-label={label} className="h-full w-full focus-visible:outline-offset-[-3px]!" />
    </div>
  );
}

// ---------------------------------------------------------------- legend

function Legend({ model, relief, planet }: { model: Model; relief: Relief; planet: "earth" | "mars" }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const c = rampColor(t, TINT[planet]).map((v) => Math.round(Math.min(1, v * 0.89) * 255));
    return `rgb(${c.join(" ")}) ${t * 100}%`;
  }).join(", ");
  const noData = 1 - relief.valid_fraction;
  const as = relief.source.representation === "as_measured"
    ? `${planet === "mars" ? "Mars" : "Earth"} as measured: the MOLA observation operator is not applied`
    : "Mars observation space";
  return (
    <footer className="border-t border-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className="kicker !text-[10px]">Elevation</span>
          <span className="num text-num-sm text-muted">{fmtNum(model.zMin)}</span>
          <span aria-hidden className="h-2 w-24 border border-line-strong" style={{ backgroundImage: `linear-gradient(to right, ${stops})` }} />
          <span className="num text-num-sm text-muted">{fmtNum(model.zMax)}<span className="ml-[0.18em] font-sans text-[11px]">m</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="kicker !text-[10px]">Contours</span>
          {model.contour ? (
            <span className="num text-num-sm text-muted">{fmtNum(model.contour.interval)}<span className="ml-[0.18em] font-sans text-[11px]">m</span>
              <span className="mx-1.5 text-faint">·</span>index {fmtNum(model.contour.index)}<span className="ml-[0.18em] font-sans text-[11px]">m</span></span>
          ) : <span className="text-caption text-faint">none (flat)</span>}
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 border border-line-strong bg-[repeating-linear-gradient(45deg,rgb(242_244_245/0.35)_0_1px,transparent_1px_3.5px)]" />
          <span className="kicker !text-[10px]">No elevation</span>
          <span className="num text-num-sm text-muted">{(100 * noData).toFixed(1)}<span className="ml-[0.1em]">%</span></span>
        </div>
      </div>
      <p className="mt-2 text-caption text-faint">
        {relief.source.title} · {relief.rows} × {relief.cols} cells @ {relief.cell_m.toFixed(2)} m, north up
        {relief.source.vertical_reference ? <> · heights: {relief.source.vertical_reference}</> : null} · {as}.
      </p>
    </footer>
  );
}
