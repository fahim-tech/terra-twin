import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { niceScale } from "../../lib/instruments";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { fmtLat, fmtLon } from "./model";
import { DISPLAY } from "./parts";
import { withCleanGlobe } from "./plateCapture";
import { type EdgeTick, formatTick, nadirKmPerPx, plateBody, plateCamera, type PlateTicks, plateTicks, visibleRect } from "./plateGeometry";
import { splitDesignation } from "./typeset";

/** Plates are rendered top-down from this altitude (spec §12/§17). */
export const PLATE_HEIGHT_KM = 420;
const PLATE_MAX_WIDTH = 800;
const PLATE_ASPECT = 4 / 3;
/** Same rule as GlobeFrame/globe init: with an ion token the Mars globe renders on the IAU 2000 ellipsoid. */
const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim() || null;

type Shot = { dataUrl: string; width: number; height: number };
export type SnapshotState = { status: "loading" } | { status: "ok"; shot: Shot } | { status: "failed" };
type State = SnapshotState;

// Snapshots are expensive (the globe re-renders off-view); keep them for the session.
const cache = new Map<string, Promise<Shot | null>>();

/**
 * Real imagery from the planet's own globe, or a failure that the plate shows honestly.
 * Waits for the globe to be ready; gives up after a bounded time.
 */
export function useSnapshot(planet: Planet, lat: number, lon: number, enabled = true): State {
  const bus = useGlobeBus();
  const qc = useQueryClient();
  const ready = useGlobes((s) => s.ready[planet]);
  const [state, setState] = useState<State>({ status: "loading" });
  const key = `${planet}:${lat.toFixed(5)}:${lon.toFixed(5)}:${PLATE_HEIGHT_KM}`;

  useEffect(() => {
    let live = true;
    if (!enabled) { setState({ status: "failed" }); return; }
    setState({ status: "loading" });
    if (!ready) {
      const t = setTimeout(() => { if (live) setState({ status: "failed" }); }, 25000);
      return () => { live = false; clearTimeout(t); };
    }
    let p = cache.get(key);
    if (!p) {
      const h = bus.handles[planet].current;
      p = h
        ? waitForStillCamera(planet)
          // A camera that never settles means the capture could show another place: no imagery rather than wrong imagery.
          .then((ok) => (ok ? withCleanGlobe(bus, qc, planet, () => h.snapshot(lat, lon, PLATE_HEIGHT_KM, PLATE_MAX_WIDTH)) : null))
          .catch(() => null)
        : Promise.resolve(null);
      cache.set(key, p);
      void p.then((r) => { if (!r) cache.delete(key); });
    }
    void p.then((r) => {
      if (!live) return;
      setState(r ? { status: "ok", shot: r } : { status: "failed" });
      const name = planet === "mars" ? "Mars" : "Earth";
      useApp.getState().announce(r ? `${name} location plate ready` : `${name} imagery unavailable; the plate shows coordinates only`);
    });
    return () => { live = false; };
  }, [bus, qc, planet, lat, lon, ready, key, enabled]);

  return state;
}

/**
 * A camera flight still running on the (hidden) globe would keep moving the camera while the snapshot
 * waits for tiles, and the plate would show somewhere else under this plate's coordinates. Wait until the
 * globe reports a still camera before capturing.
 */
function waitForStillCamera(planet: Planet, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let still = 0;
    const tick = () => {
      const cam = useGlobes.getState().camera[planet];
      still = cam && !cam.moving ? still + 1 : 0;
      if (still >= 3) resolve(true);
      else if (performance.now() - t0 > timeoutMs) resolve(false);
      else setTimeout(tick, 150);
    };
    tick();
  });
}

export interface PlateFrame {
  /** Ground size of the drawn frame, km (north–south × east–west). */
  nsKm: number;
  ewKm: number;
  label: string;
}

/** Margin around the neatline that holds the coordinate ticks and labels, px. */
const MARGIN = 22;

/**
 * A location plate: the snapshot inside a neatline whose ticks mark where real parallels and meridians cross
 * the plate edge (from the snapshot camera, plateGeometry.ts), the analysis frame at the plate-centre scale,
 * a scale bar and a north arrow. `snapshot` comes from the caller so a pair of plates can be revealed
 * together: while `held`, the plate keeps its rendering state even if its own image is ready.
 */
export function LocationPlate({ planet, plate, lat, lon, frame, kicker, name, imagery, snapshot, held = false }: {
  planet: Planet; plate: string; lat: number; lon: number; frame: PlateFrame; kicker: string; name: string; imagery: string;
  snapshot: SnapshotState; held?: boolean;
}) {
  const title = splitDesignation(name);
  const snap: State = held && snapshot.status === "ok" ? { status: "loading" } : snapshot;
  const w = snap.status === "ok" ? snap.shot.width : PLATE_MAX_WIDTH;
  const h = snap.status === "ok" ? snap.shot.height : PLATE_MAX_WIDTH / PLATE_ASPECT;
  const geo = useMemo(() => {
    const cam = plateCamera(plateBody(planet, ION_TOKEN), lat, lon, PLATE_HEIGHT_KM, w, h);
    const rect = visibleRect(w, h, PLATE_ASPECT);
    const kmPerPx = nadirKmPerPx(cam);
    return { rect, kmPerPx, ticks: plateTicks(cam, rect), bar: niceScale(kmPerPx * 1000, rect.w * 0.3) };
  }, [planet, lat, lon, w, h]);
  const tone = planet === "mars" ? "!text-mars" : "!text-earth";
  const planetName = planet === "mars" ? "Mars" : "Earth";
  const coord = `${fmtLat(lat, 3)} ${fmtLon(lon, 3)}`;
  const onImagery = snap.status === "ok";

  return (
    <figure className="m-0 min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="num shrink-0 text-num-sm text-ink">PLATE {plate}</span>
          <span className={cx("kicker truncate", tone)}>{kicker}</span>
        </span>
        {/* Viewing geometry; dropped where two plates share a narrow row (the note under the plates states it). */}
        <span className="num hidden shrink-0 text-num-sm text-faint sm:inline md:hidden xl:inline print:hidden">NADIR {PLATE_HEIGHT_KM} KM · N UP</span>
      </div>

      <div className="frame relative mt-3 [--frame-l:12px]" style={{ padding: MARGIN }}>
        <div className="@container relative aspect-[4/3] w-full overflow-hidden bg-elevated ring-1 ring-ink/45 [print-color-adjust:exact]">
          {onImagery ? (
            <img src={snap.shot.dataUrl} alt={`${planetName} imagery centred on ${coord}, seen from ${PLATE_HEIGHT_KM} km, north up, with the ${frame.label} outlined.`}
              className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-x-0 top-[66%] px-6 text-center" role={snap.status === "loading" ? "status" : undefined}>
              <div className="num text-num-sm text-ink">{coord}</div>
              <div className={cx("mt-1 text-caption", snap.status === "loading" ? "text-muted motion-safe:animate-pulse" : "text-faint")}>
                {snap.status === "loading" ? `Rendering ${planetName} imagery…` : "No imagery snapshot · coordinates only, nothing substituted"}
              </div>
            </div>
          )}
          <WindowFrame w={w} h={h} frame={frame} kmPerPx={geo.kmPerPx} onImagery={onImagery} />
          {geo.bar && <ScaleMark label={geo.bar.label} widthCqw={(geo.bar.px / geo.rect.w) * 100} onImagery={onImagery} />}
          <NorthArrow onImagery={onImagery} />
        </div>
        {geo.ticks && <Neatline ticks={geo.ticks} />}
      </div>

      <figcaption className="mt-1">
        <div className={cx(DISPLAY, "text-[20px] leading-tight tracking-[0.04em] text-ink")}>
          {title.name}
          {title.detail && <span className="ml-2 text-[14px] font-medium tracking-[0.08em] text-muted"><span className="sr-only">, </span>{title.detail}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="num text-num text-muted">{coord}</span>
          <span className="text-caption text-faint">{frame.label}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-caption text-faint">
          <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0", onImagery ? "bg-faint" : "ring-1 ring-inset ring-faint")} />
          {onImagery ? `${imagery} — visualization only` : snap.status === "loading" ? "Rendering imagery…" : "No imagery snapshot — coordinate plate"}
        </div>
      </figcaption>
    </figure>
  );
}

/** The analysis frame at the plate-centre scale, with outer registration ticks so a small frame is found at a glance. */
function WindowFrame({ w, h, frame, kmPerPx, onImagery }: { w: number; h: number; frame: PlateFrame; kmPerPx: number; onImagery: boolean }) {
  const fw = frame.ewKm / kmPerPx;
  const fh = frame.nsKm / kmPerPx;
  const x0 = w / 2 - fw / 2;
  const y0 = h / 2 - fh / 2;
  const tick = Math.max(fw, fh) * 0.22;
  const ink = onImagery ? "#fff" : "currentColor";
  const ticks = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).map(([dx, dy]) => ({
    k: `${dx}${dy}`,
    x1: w / 2 + dx * (fw / 2 + tick * 0.45), y1: h / 2 + dy * (fh / 2 + tick * 0.45),
    x2: w / 2 + dx * (fw / 2 + tick * 1.5), y2: h / 2 + dy * (fh / 2 + tick * 1.5),
  }));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full text-ink" aria-hidden>
      <g fill="none" strokeLinecap="square">
        {onImagery && (
          <g stroke="rgb(0 0 0 / .55)" strokeWidth={3.5} vectorEffect="non-scaling-stroke">
            <rect x={x0} y={y0} width={fw} height={fh} vectorEffect="non-scaling-stroke" />
            {ticks.map((t) => <line key={t.k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} vectorEffect="non-scaling-stroke" />)}
          </g>
        )}
        <g stroke={ink} strokeWidth={1.25}>
          <rect x={x0} y={y0} width={fw} height={fh} vectorEffect="non-scaling-stroke" />
          {ticks.map((t) => <line key={t.k} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} vectorEffect="non-scaling-stroke" />)}
        </g>
      </g>
    </svg>
  );
}

/** Scale bar in the plate's lower left: label above, end ticks and a half-way tick, like the globe HUD. */
function ScaleMark({ label, widthCqw, onImagery }: { label: string; widthCqw: number; onImagery: boolean }) {
  return (
    <div aria-hidden className={cx("absolute bottom-[4%] left-[4%] px-2 pb-1.5 pt-1 [print-color-adjust:exact]", onImagery ? "bg-black/55 text-white" : "text-ink")}>
      <div className="num text-[10.5px] leading-none">{label}</div>
      <div className="relative mt-1 h-[5px] border-x border-b border-current" style={{ width: `${widthCqw}cqw` }}>
        <span className="absolute bottom-0 left-1/2 h-[3px] w-px bg-current opacity-80" />
      </div>
    </div>
  );
}

/** North arrow (snapshots are rendered heading 0): half-filled needle and an N in Barlow. */
function NorthArrow({ onImagery }: { onImagery: boolean }) {
  return (
    <div aria-hidden className={cx("absolute right-[4%] top-[4%] flex flex-col items-center gap-1 px-1.5 pb-1 pt-1.5 [print-color-adjust:exact]", onImagery ? "bg-black/55 text-white" : "text-ink")}>
      <svg width="10" height="14" viewBox="0 0 10 14">
        <path d="M5 .75 9.25 13.25 5 10.5Z" fill="currentColor" />
        <path d="M5 .75 .75 13.25 5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
      </svg>
      <span className="font-sans text-[10px] font-semibold leading-none tracking-[0.04em]">N</span>
    </div>
  );
}

/**
 * Coordinate ticks outside the neatline: meridians on the top and bottom edges, parallels on the left and
 * right, major ticks longer. Labels on the top (longitude) and left (latitude, reading upward); labels
 * near a corner are dropped so they never collide.
 */
function Neatline({ ticks }: { ticks: PlateTicks }) {
  const label = (k: EdgeTick, axis: "lat" | "lon") => (k.major && k.at > 0.06 && k.at < 0.94 ? formatTick(k.value, axis, ticks.step) : null);
  const len = (k: EdgeTick) => (k.major ? 6 : 3);
  return (
    <div aria-hidden className="pointer-events-none absolute" style={{ inset: MARGIN }}>
      {ticks.top.map((k) => <span key={`t${k.value}`} className="absolute bottom-full w-px bg-ink/60" style={{ left: `${k.at * 100}%`, height: len(k) }} />)}
      {ticks.bottom.map((k) => <span key={`b${k.value}`} className="absolute top-full w-px bg-ink/60" style={{ left: `${k.at * 100}%`, height: len(k) }} />)}
      {ticks.left.map((k) => <span key={`l${k.value}`} className="absolute right-full h-px bg-ink/60" style={{ top: `${k.at * 100}%`, width: len(k) }} />)}
      {ticks.right.map((k) => <span key={`r${k.value}`} className="absolute left-full h-px bg-ink/60" style={{ top: `${k.at * 100}%`, width: len(k) }} />)}
      {ticks.top.map((k) => {
        const t = label(k, "lon");
        return t && <span key={`tl${k.value}`} className="num absolute bottom-full mb-[8px] -translate-x-1/2 whitespace-nowrap text-[9.5px] leading-none text-muted" style={{ left: `${k.at * 100}%` }}>{t}</span>;
      })}
      {ticks.left.map((k) => {
        const t = label(k, "lat");
        return t && (
          <span key={`ll${k.value}`} className="num absolute right-full mr-[8px] whitespace-nowrap text-[9.5px] leading-none text-muted"
            style={{ top: `${k.at * 100}%`, writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}>{t}</span>
        );
      })}
    </div>
  );
}
