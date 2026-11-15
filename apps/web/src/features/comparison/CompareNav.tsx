import { Minus, Plus, Scan } from "lucide-react";
import { useGlobeBus, useGlobeEvents } from "../../app/globeBus";
import { NorthNeedle } from "../../components/map/Instruments";
import { cx } from "../../components/ui";
import { type Planet, tiltAnnouncement, viewName } from "../../globes/protocol";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { requestReframe } from "./layout";
import { PLANET_NAME } from "./marks";

// Raised while focused so the focus ring draws over the neighbouring divider (the row does not clip it).
const cell = "hit relative grid h-9 w-9 place-items-center text-muted transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink focus-visible:z-10 active:bg-white/[0.14] active:duration-0";

/**
 * One half's navigation: a row of square cells with hairline dividers (zoom in, zoom out, face north, 3D,
 * frame). The 3D cell switches the one 3D preference both halves share: both globes fly back to their windows
 * at the matched distance, both oblique or both straight down, so the two views always compare like with like.
 * Frame flies this globe back to its compared window at the matched distance, so the two ground scales agree
 * again after it has been zoomed or panned away. Bottom-right of the half's free area, on the instruments'
 * baseline. Zoom, north and 3D also have keys inside the focused globe (±, N, T).
 */
export function CompareNav({ planet, className }: { planet: Planet; className?: string }) {
  const bus = useGlobeBus();
  const ins = useGlobes((s) => s.insets[planet]);
  const heading = useGlobes((s) => s.camera[planet]?.headingDeg ?? 0);
  const tilt = useGlobes((s) => s.tilt);
  const name = PLANET_NAME[planet];
  // T inside this half's globe switches the shared preference too; say which view both halves now use.
  useGlobeEvents(planet, (m) => {
    if (m.t === "tilt") useApp.getState().announce(m.turned === false ? tiltAnnouncement(m.on, false) : `${viewName(m.on)} on both halves`);
  });
  const toggle = () => {
    const on = !tilt;
    useGlobes.getState().setTilt(on);
    useApp.getState().announce(`${viewName(on)} on both halves`);
  };
  return (
    <div role="group" aria-label={`${name} view`} style={{ right: ins.right + 12, bottom: ins.bottom + 30 }}
      className={cx("surface no-print pointer-events-auto absolute flex divide-x divide-line rounded-control transition-[bottom] duration-300 motion-reduce:transition-none", className)}>
      <button type="button" className={cell} aria-label={`Zoom in on ${name}`} title="Zoom in (+)" onClick={() => bus.send(planet, { t: "zoom", direction: "in" })}>
        <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden />
      </button>
      <button type="button" className={cell} aria-label={`Zoom out on ${name}`} title="Zoom out (−)" onClick={() => bus.send(planet, { t: "zoom", direction: "out" })}>
        <Minus className="h-4 w-4" strokeWidth={1.6} aria-hidden />
      </button>
      <button type="button" className={cell} aria-label={`Face north on ${name} (heading ${Math.round(heading)}°)`} title="Face north (N)" onClick={() => bus.send(planet, { t: "resetHeading" })}>
        {/* The same north needle as the explorer's navigation stack. */}
        <NorthNeedle heading={heading} />
      </button>
      <button type="button" className={cx(cell, tilt && "!text-ink")} aria-label={`${viewName(true)}, both halves`} aria-pressed={tilt}
        title={tilt ? `${viewName(false)} on both halves (T)` : `${viewName(true)} on both halves (T)`} onClick={toggle}>
        <span aria-hidden className="num text-[11px] font-medium tracking-[0.06em]">3D</span>
        {/* Status mark (6 px square): filled while the halves are tilted, outlined while top-down. */}
        <span aria-hidden className={cx("absolute right-[5px] top-[5px] h-1.5 w-1.5", tilt ? "bg-ink" : "border border-faint")} />
      </button>
      <button type="button" className={cell} aria-label={`Frame the ${name} window at the matched altitude`} title="Frame the compared window (matched scale)" onClick={() => requestReframe(planet)}>
        <Scan className="h-4 w-4" strokeWidth={1.6} aria-hidden />
      </button>
    </div>
  );
}
