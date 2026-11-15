import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { fmtLat, fmtLon } from "./model";
import { withCleanGlobe } from "./plateCapture";

/** Plates are rendered top-down from this altitude (spec §12/§17). */
export const PLATE_HEIGHT_KM = 420;
const PLATE_MAX_WIDTH = 800;
/** Cesium's default perspective frustum: 60° across the larger canvas dimension. */
const FOV_RAD = Math.PI / 3;
const PLATE_ASPECT = 4 / 3;

type Shot = { dataUrl: string; width: number; height: number };
type State = { status: "loading" } | { status: "ok"; shot: Shot } | { status: "failed" };

// Snapshots are expensive (the globe re-renders off-view); keep them for the session.
const cache = new Map<string, Promise<Shot | null>>();

/**
 * Real imagery from the planet's own globe, or a failure that the plate shows honestly.
 * Waits for the globe to be ready; gives up after a bounded time.
 */
export function useSnapshot(planet: Planet, lat: number, lon: number): State {
  const bus = useGlobeBus();
  const qc = useQueryClient();
  const ready = useGlobes((s) => s.ready[planet]);
  const [state, setState] = useState<State>({ status: "loading" });
  const key = `${planet}:${lat.toFixed(5)}:${lon.toFixed(5)}:${PLATE_HEIGHT_KM}`;

  useEffect(() => {
    let live = true;
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
  }, [bus, qc, planet, lat, lon, ready, key]);

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

/**
 * The part of the snapshot visible in the plate (object-fit: cover, centred), in snapshot pixels.
 */
function visibleRect(w: number, h: number) {
  const ai = w / h;
  if (ai > PLATE_ASPECT) { const vw = h * PLATE_ASPECT; return { x: (w - vw) / 2, y: 0, w: vw, h }; }
  const vh = w / PLATE_ASPECT;
  return { x: 0, y: (h - vh) / 2, w, h: vh };
}

function niceScale(maxKm: number) {
  for (const k of [200, 100, 50, 25, 10]) if (k <= maxKm) return k;
  return 10;
}

export function LocationPlate({ planet, lat, lon, frame, kicker, name, imagery }: {
  planet: Planet; lat: number; lon: number; frame: PlateFrame; kicker: string; name: ReactNode; imagery: string;
}) {
  const snap = useSnapshot(planet, lat, lon);
  const tone = planet === "mars" ? "!text-mars" : "!text-earth";
  const coord = `${fmtLat(lat, 3)} ${fmtLon(lon, 3)}`;

  return (
    <figure className="m-0 min-w-0 break-inside-avoid">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-surface bg-elevated [print-color-adjust:exact]">
        {snap.status === "ok" ? (
          <PlateImage shot={snap.shot} frame={frame} alt={`${planet === "mars" ? "Mars" : "Earth"} imagery centred on ${coord}, seen from ${PLATE_HEIGHT_KM} km, north up, with the ${frame.label} outlined.`} />
        ) : (
          <CoordinatePlate status={snap.status} coord={coord} frame={frame} planet={planet} />
        )}
        <div className="pointer-events-none absolute left-3 top-3 rounded-control bg-space/75 px-2 py-1 print:bg-white/85">
          <div className={cx("kicker", tone)}>{kicker}</div>
        </div>
      </div>
      <figcaption className="mt-3">
        <div className="toponym text-toponym-sm text-ink">{name}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="num text-num text-muted">{coord}</span>
          <span className="text-caption text-faint">{frame.label}</span>
        </div>
        <div className="mt-1 text-caption text-faint">
          {snap.status === "ok" ? `${imagery} — visualization only` : snap.status === "loading" ? "Rendering imagery…" : "No imagery snapshot — coordinate plate"}
        </div>
      </figcaption>
    </figure>
  );
}

function PlateImage({ shot, frame, alt }: { shot: Shot; frame: PlateFrame; alt: string }) {
  const { width: w, height: h } = shot;
  // Ground distance per snapshot pixel at the nadir point: the frustum spans 2·h·tan(fov/2) across the larger side.
  const kmPerPx = (2 * PLATE_HEIGHT_KM * Math.tan(FOV_RAD / 2)) / Math.max(w, h);
  const fw = frame.ewKm / kmPerPx;
  const fh = frame.nsKm / kmPerPx;
  const cx0 = w / 2, cy0 = h / 2;
  const v = visibleRect(w, h);
  const pad = v.w * 0.045;
  const barKm = niceScale((v.w * 0.32) * kmPerPx);
  const barPx = barKm / kmPerPx;
  const bx = v.x + pad, by = v.y + v.h - pad;
  const stroke = Math.max(1.2, v.w / 420);
  const fs = v.w / 34;
  const tick = fw * 0.22;

  return (
    <>
      <img src={shot.dataUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <g fill="none" strokeLinecap="square">
          {/* Halo, then the frame: identical styling on both planets. */}
          <rect x={cx0 - fw / 2} y={cy0 - fh / 2} width={fw} height={fh} stroke="rgb(0 0 0 / .55)" strokeWidth={stroke * 3} />
          <rect x={cx0 - fw / 2} y={cy0 - fh / 2} width={fw} height={fh} stroke="#fff" strokeWidth={stroke} />
          {/* Outer registration ticks so a small frame is still found at a glance. */}
          {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
            const x1 = cx0 + dx * (fw / 2 + tick * 0.5), y1 = cy0 + dy * (fh / 2 + tick * 0.5);
            const x2 = cx0 + dx * (fw / 2 + tick * 1.6), y2 = cy0 + dy * (fh / 2 + tick * 1.6);
            return (
              <g key={`${dx}${dy}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(0 0 0 / .55)" strokeWidth={stroke * 3} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={stroke} />
              </g>
            );
          })}
        </g>
        {/* Scale bar (bottom-left of the visible plate). */}
        <g>
          <rect x={bx - fs * 0.5} y={by - fs * 1.9} width={barPx + fs} height={fs * 2.5} rx={fs * 0.3} fill="rgb(0 0 0 / .45)" />
          <path d={`M${bx} ${by - fs * 0.5} V${by} H${bx + barPx} V${by - fs * 0.5}`} fill="none" stroke="#fff" strokeWidth={stroke} />
          <text x={bx} y={by - fs * 0.8} fill="#fff" fontSize={fs} fontFamily="IBM Plex Mono, ui-monospace, monospace">{barKm} km</text>
        </g>
        {/* North arrow (snapshots are rendered heading 0, north up). */}
        <g transform={`translate(${v.x + v.w - pad} ${v.y + pad})`}>
          <path d={`M0 ${-fs * 0.2} L${fs * 0.42} ${fs * 1.1} L0 ${fs * 0.8} L${-fs * 0.42} ${fs * 1.1} Z`} fill="#fff" stroke="rgb(0 0 0 / .5)" strokeWidth={stroke * 0.8} />
          <text x={0} y={fs * 2.3} fill="#fff" fontSize={fs * 0.9} textAnchor="middle" fontFamily="Instrument Sans, ui-sans-serif, sans-serif" fontWeight={600}>N</text>
        </g>
      </svg>
    </>
  );
}

/** Honest fallback: coordinates and the frame size, no imagery of any kind. */
function CoordinatePlate({ status, coord, frame, planet }: { status: "loading" | "failed"; coord: string; frame: PlateFrame; planet: Planet }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center" role={status === "loading" ? "status" : undefined}>
      <div>
        <div className="num text-num text-ink">{coord}</div>
        <div className="mt-1.5 text-caption text-faint">{frame.label}</div>
        <div className="mt-4 text-caption text-muted">
          {status === "loading"
            ? `Rendering ${planet === "mars" ? "Mars" : "Earth"} imagery from the globe…`
            : "Imagery snapshot unavailable. Coordinates only — no imagery is substituted."}
        </div>
      </div>
    </div>
  );
}
