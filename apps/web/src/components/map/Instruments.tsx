import { Home, Minus, Plus } from "lucide-react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import { isTilted } from "../../globes/camera";
import { type Planet, viewName } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { formatAltitude, niceScale } from "../../lib/instruments";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { cx } from "../ui";

/**
 * Scale bar from live camera telemetry (ground distance at the centre of the view, along the screen
 * horizontal). In the 3D view the ground scale changes down the screen — nearer ground below, farther
 * above — so the bar says it holds at the centre.
 */
export function ScaleBar({ planet, maxPx = 120, className }: { planet: Planet; maxPx?: number; className?: string }) {
  const mpp = useGlobes((s) => s.camera[planet]?.metersPerPixel ?? null);
  const tilted = useGlobes((s) => isTilted(s.camera[planet]?.pitchDeg));
  const s = niceScale(mpp, maxPx);
  return (
    <div role="img" className={cx("flex flex-col gap-1", className)}
      aria-label={s ? `Scale bar ${s.label}${tilted ? ", true at the centre of the 3D view" : ""}` : "Scale unavailable"}>
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="num text-num-sm text-ink">{s ? s.label : "—"}</span>
        {s && tilted && <span className="kicker !text-ink/65">At centre</span>}
      </span>
      {/* End ticks plus a half-way tick, like a survey scale. */}
      <span className="relative block h-[6px] border-x border-b border-ink transition-[width] duration-200" style={{ width: s ? `${s.px}px` : 40 }} aria-hidden>
        <span className="absolute bottom-0 left-1/2 h-[3px] w-px bg-ink/70" />
      </span>
    </div>
  );
}

export function AltitudeReadout({ planet, className }: { planet: Planet; className?: string }) {
  const h = useGlobes((s) => s.camera[planet]?.heightKm ?? null);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="kicker !text-ink/65">Altitude</span>
      <span className="num text-num-sm text-ink">{formatAltitude(h)}</span>
    </div>
  );
}

export function CenterReadout({ planet, className }: { planet: Planet; className?: string }) {
  const c = useGlobes((s) => s.camera[planet]?.center ?? null);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="kicker !text-ink/65">Centre</span>
      <span className="num text-num-sm text-ink">{c ? `${formatLat(c.lat, 2)}  ${formatLon(c.lon, 2)}` : "off planet"}</span>
    </div>
  );
}

/** Thin crosshair at the frame centre; Enter on the focused globe selects the point beneath it. */
export function Reticle({ planet, className }: { planet: Planet; className?: string }) {
  const moving = useGlobes((s) => s.camera[planet]?.moving ?? false);
  const ins = useGlobes((s) => s.insets[planet]);
  // Sits at the centre of the unobstructed area — the same point the globe frames and picks with Enter.
  const left = `calc(${ins.left}px + (100% - ${ins.left + ins.right}px) / 2)`;
  const top = `calc(${ins.top}px + (100% - ${ins.top + ins.bottom}px) / 2)`;
  return (
    <div aria-hidden style={{ left, top }} className={cx("pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 transition-[opacity,left,top] duration-300", moving ? "opacity-85" : "opacity-40", className)}>
      {/* Gapped crosshair inside corner brackets. */}
      <span className="frame absolute inset-0 [--frame-c:rgb(242_244_245/0.9)] [--frame-l:7px]" />
      <span className="absolute left-1/2 top-[9px] h-2.5 w-px -translate-x-1/2 bg-ink" />
      <span className="absolute bottom-[9px] left-1/2 h-2.5 w-px -translate-x-1/2 bg-ink" />
      <span className="absolute left-[9px] top-1/2 h-px w-2.5 -translate-y-1/2 bg-ink" />
      <span className="absolute right-[9px] top-1/2 h-px w-2.5 -translate-y-1/2 bg-ink" />
    </div>
  );
}

const ctl = "hit grid h-9 w-9 place-items-center text-muted transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink active:bg-white/[0.14] active:duration-0";

/** North needle: filled half points north, outlined half south; turns with the camera heading. */
function NorthNeedle({ heading }: { heading: number }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="transition-transform duration-300" style={{ transform: `rotate(${-heading}deg)` }}>
      <path d="M8 1.5 L10.6 8 L5.4 8 Z" fill="currentColor" />
      <path d="M5.4 8 L10.6 8 L8 14.5 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="miter" />
    </svg>
  );
}

/**
 * Zoom, north-up needle, top-down ⇄ 3D tilt and reset. All have keyboard equivalents inside the globe
 * (±, N, T). The tilt button is a toggle: pressed while the view is tilted.
 */
export function NavControls({ planet, className, style }: { planet: Planet; className?: string; style?: React.CSSProperties }) {
  const bus = useGlobeBus();
  const heading = useGlobes((s) => s.camera[planet]?.headingDeg ?? 0);
  const tilted = useGlobes((s) => isTilted(s.camera[planet]?.pitchDeg));
  // The globe reports every switch (this button or T inside the globe); say which view it is now.
  useGlobeEvents(planet, (m) => { if (m.t === "tilt") useApp.getState().announce(viewName(m.on)); });
  return (
    <div style={style} className={cx("surface flex flex-col overflow-hidden rounded-control", className)} role="group" aria-label="Map navigation">
      <button className={ctl} aria-label="Zoom in" title="Zoom in (+)" onClick={() => bus.send(planet, { t: "zoom", direction: "in" })}><Plus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button className={cx(ctl, "border-t border-line")} aria-label="Zoom out" title="Zoom out (−)" onClick={() => bus.send(planet, { t: "zoom", direction: "out" })}><Minus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button className={cx(ctl, "border-t border-line")} aria-label={`Face north (heading ${Math.round(heading)}°)`} title="Face north (N)" onClick={() => bus.send(planet, { t: "resetHeading" })}>
        <NorthNeedle heading={heading} />
      </button>
      <button className={cx(ctl, "relative border-t border-line", tilted && "text-ink")} aria-label={viewName(true)} aria-pressed={tilted}
        title={tilted ? `${viewName(false)} (T)` : `${viewName(true)} (T)`} onClick={() => bus.send(planet, { t: "setTilt", on: !tilted })}>
        <span aria-hidden className="num text-[11px] font-medium tracking-[0.06em]">3D</span>
        {/* Status mark: filled while tilted, outlined while top-down. */}
        <span aria-hidden className={cx("absolute right-[5px] top-[5px] h-[5px] w-[5px]", tilted ? "bg-ink" : "border border-faint")} />
      </button>
      <button className={cx(ctl, "border-t border-line")} aria-label="Reset view" title="Reset view" onClick={() => bus.send(planet, { t: "reset" })}><Home className="h-4 w-4" strokeWidth={1.6} /></button>
    </div>
  );
}
