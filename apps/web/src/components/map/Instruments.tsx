import { Compass, Home, Minus, Plus } from "lucide-react";
import { useGlobeBus } from "../../app/globeBus";
import type { Planet } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { formatAltitude, niceScale } from "../../lib/instruments";
import { useGlobes } from "../../store/globes";
import { cx } from "../ui";

/** Scale bar from live camera telemetry (ground distance at the frame centre). */
export function ScaleBar({ planet, maxPx = 120, className }: { planet: Planet; maxPx?: number; className?: string }) {
  const mpp = useGlobes((s) => s.camera[planet]?.metersPerPixel ?? null);
  const s = niceScale(mpp, maxPx);
  return (
    <div className={cx("flex flex-col gap-1", className)} aria-label={s ? `Scale bar ${s.label}` : "Scale unavailable"}>
      <span className="num text-num-sm text-ink">{s ? s.label : "—"}</span>
      <span className="relative block h-[5px] border-x border-b border-ink transition-[width] duration-200" style={{ width: s ? `${s.px}px` : 40 }} aria-hidden />
    </div>
  );
}

export function AltitudeReadout({ planet, className }: { planet: Planet; className?: string }) {
  const h = useGlobes((s) => s.camera[planet]?.heightKm ?? null);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="kicker !text-ink/70">Altitude</span>
      <span className="num text-num-sm text-ink">{formatAltitude(h)}</span>
    </div>
  );
}

export function CenterReadout({ planet, className }: { planet: Planet; className?: string }) {
  const c = useGlobes((s) => s.camera[planet]?.center ?? null);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="kicker !text-ink/70">Centre</span>
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
    <div aria-hidden style={{ left, top }} className={cx("pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 transition-[opacity,left,top] duration-300", moving ? "opacity-80" : "opacity-35", className)}>
      <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-ink" />
      <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-ink" />
      <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-ink" />
      <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-ink" />
    </div>
  );
}

const ctl = "hit grid h-9 w-9 place-items-center text-muted transition-colors duration-150 hover:bg-elevated hover:text-ink active:scale-95 active:duration-75";

/** Zoom, north-up compass and reset. All have keyboard equivalents inside the globe (±, N). */
export function NavControls({ planet, className, style }: { planet: Planet; className?: string; style?: React.CSSProperties }) {
  const bus = useGlobeBus();
  const heading = useGlobes((s) => s.camera[planet]?.headingDeg ?? 0);
  return (
    <div style={style} className={cx("surface flex flex-col overflow-hidden rounded-[12px]", className)} role="group" aria-label="Map navigation">
      <button className={ctl} aria-label="Zoom in" title="Zoom in (+)" onClick={() => bus.send(planet, { t: "zoom", direction: "in" })}><Plus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button className={cx(ctl, "border-t border-line/50")} aria-label="Zoom out" title="Zoom out (−)" onClick={() => bus.send(planet, { t: "zoom", direction: "out" })}><Minus className="h-4 w-4" strokeWidth={1.6} /></button>
      <button className={cx(ctl, "border-t border-line/50")} aria-label={`Face north (heading ${Math.round(heading)}°)`} title="Face north (N)" onClick={() => bus.send(planet, { t: "resetHeading" })}>
        <Compass className="h-4 w-4 transition-transform duration-300" strokeWidth={1.6} style={{ transform: `rotate(${-heading - 45}deg)` }} />
      </button>
      <button className={cx(ctl, "border-t border-line/50")} aria-label="Reset view" title="Reset view" onClick={() => bus.send(planet, { t: "reset" })}><Home className="h-4 w-4" strokeWidth={1.6} /></button>
    </div>
  );
}
