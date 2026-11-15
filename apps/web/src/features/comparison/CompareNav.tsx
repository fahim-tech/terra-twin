import { Compass, Minus, Plus, Scan } from "lucide-react";
import { useGlobeBus } from "../../app/globeBus";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { useGlobes } from "../../store/globes";
import { requestReframe } from "./layout";
import { PLANET_NAME } from "./marks";

// Raised while focused so the focus ring draws over the neighbouring divider (the row does not clip it).
const cell = "hit relative grid h-9 w-9 place-items-center text-muted transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink focus-visible:z-10 active:bg-white/[0.14] active:duration-0";

/**
 * One half's navigation: a row of square cells with hairline dividers (zoom in, zoom out, face north,
 * frame). Frame flies this globe back to its compared window at the matched altitude, so the two ground
 * scales agree again after it has been zoomed or panned away. Bottom-right of the half's free area, on
 * the instruments' baseline. Zoom and north also have keys inside the focused globe (±, N).
 */
export function CompareNav({ planet, className }: { planet: Planet; className?: string }) {
  const bus = useGlobeBus();
  const ins = useGlobes((s) => s.insets[planet]);
  const heading = useGlobes((s) => s.camera[planet]?.headingDeg ?? 0);
  const name = PLANET_NAME[planet];
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
        <Compass className="h-4 w-4 transition-transform duration-300 motion-reduce:transition-none" strokeWidth={1.6} style={{ transform: `rotate(${-heading - 45}deg)` }} aria-hidden />
      </button>
      <button type="button" className={cell} aria-label={`Frame the ${name} window at the matched altitude`} title="Frame the compared window (matched scale)" onClick={() => requestReframe(planet)}>
        <Scan className="h-4 w-4" strokeWidth={1.6} aria-hidden />
      </button>
    </div>
  );
}
