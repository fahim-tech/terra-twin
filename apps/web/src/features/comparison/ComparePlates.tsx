import { useLayoutEffect, useRef, useState } from "react";
import { AltitudeReadout, ScaleBar } from "../../components/map/Instruments";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useGlobes } from "../../store/globes";
import { CompareNav } from "./CompareNav";
import { CORNERS, FootprintGauge } from "./FootprintGauge";
import { PlanetLabel } from "./marks";
import type { CompareTargets } from "./model";

/**
 * Over each half of the split view: a designation plate (planet, role, toponym, coordinates and what
 * the white square is), the footprint's dimension line, the half's own instruments (live scale and
 * altitude, which read the same on both halves at the matched comparison altitude) and its navigation
 * row. While the Why drawer is open its header names the Earth candidate, so the Earth plate gives the
 * narrowed half back to the footprint.
 */
export function ComparePlates({ targets, planets, whyOpen = false, compact = false }: {
  targets: CompareTargets; planets: Planet[]; whyOpen?: boolean;
  /** A mode is expanded: plates keep only planet, toponym and coordinates, so they stay clear of the footprint. */
  compact?: boolean;
}) {
  const half = planets.length === 2;
  return (
    <>
      {planets.map((p) => {
        const t = p === "mars" ? targets.mars : targets.earth;
        return (
          <div key={p} className={cx("@container pointer-events-none absolute inset-y-0 z-10", half ? "w-1/2" : "w-full", p === "mars" || !half ? "left-0" : "right-0")}>
            <FootprintGauge planet={p} lat={t.lat} lon={t.lon} km={t.km} label={t.size} />
            {!(whyOpen && p === "earth") && <Plate planet={p} targets={targets} compact={compact} />}
            <HalfInstruments planet={p} />
            {/* Under the open brief the Earth half's controls would be hidden anyway; leave them out of the page. */}
            {!(whyOpen && p === "earth") && <CompareNav planet={p} />}
          </div>
        );
      })}
    </>
  );
}

/** Gap kept between a plate and the compared square, px. */
const CLEARANCE = 8;

function Plate({ planet, targets, compact }: { planet: Planet; targets: CompareTargets; compact: boolean }) {
  const t = planet === "mars" ? targets.mars : targets.earth;
  const sub = planet === "earth" ? targets.earth.sub : null;
  const noteClear = useNoteClearance(planet, !!sub && !compact);
  return (
    // A dark glass plate (not a scrim), so the labels stay legible over bright terrain and cloud. A labelled
    // group, not a landmark region: the strip below is the comparison's one region.
    <div ref={noteClear.plate} role="group" aria-label={`${planet === "mars" ? "Mars" : "Earth"} location`} title={sub && !noteClear.show ? sub : undefined}
      className="surface frame absolute left-3 top-3 w-max max-w-[min(280px,calc(100%-24px))] rounded-surface px-3.5 pb-3 pt-2.5 [--frame-l:8px]">
      <PlanetLabel planet={planet} role={planet === "mars" ? "Target" : "Candidate"} />
      <div className="toponym mt-2 text-[20px] leading-[1.02] tracking-[0.04em] text-ink">{t.name}</div>
      <div className="num mt-1.5 text-num-sm text-ink/90">{formatLat(t.lat, 3)}&ensp;{formatLon(t.lon, 3)}</div>
      {!compact && (
        <div className="mt-1.5 flex items-baseline gap-2 text-caption text-muted">
          {/* The same square the globe draws, as a legend key. */}
          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] border border-ink" />
          <span>{t.footprint}</span>
        </div>
      )}
      {/* The pool note makes the plate taller; narrow halves keep its first line, and it gives way entirely
          when it would reach the compared square (in full on hover and in the Why brief). */}
      {sub && !compact && noteClear.show && (
        <div ref={noteClear.note} className="mt-1.5 line-clamp-1 border-t border-line pt-1.5 text-caption text-faint @min-[680px]:line-clamp-3" title={sub}>{sub}</div>
      )}
    </div>
  );
}

/**
 * Whether the plate's note fits above the compared square as projected (the footprint gauge's anchors),
 * so a plate never covers the footprint. The decision uses the plate's size *with* the note (its height
 * remembered from the last time it showed), so hiding the note cannot flip the answer back.
 */
function useNoteClearance(planet: Planet, wanted: boolean) {
  const plate = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const noteH = useRef(34);
  const [show, setShow] = useState(true);
  const anchors = useGlobes((s) => s.anchors[planet]);
  useLayoutEffect(() => {
    const el = plate.current;
    if (!wanted || !el) return;
    if (note.current) noteH.current = note.current.offsetHeight + 6;
    const pts = CORNERS.map((id) => anchors[id]);
    if (pts.some((p) => !p || !p.visible)) { setShow(true); return; }
    const top = Math.min(...pts.map((p) => p!.y));
    const left = Math.min(...pts.map((p) => p!.x));
    const bottom = el.offsetTop + el.offsetHeight + (note.current ? 0 : noteH.current);
    const right = el.offsetLeft + (note.current ? el.offsetWidth : Math.min(280, (el.parentElement?.clientWidth ?? 0) - 24));
    setShow(!(left < right + CLEARANCE && top < bottom + CLEARANCE));
  });
  return { plate, note, show };
}

/** Live scale and altitude for one half, bottom-left of its free area and clear of the imagery credit. */
function HalfInstruments({ planet }: { planet: Planet }) {
  const ins = useGlobes((s) => s.insets[planet]);
  return (
    <div className="on-imagery frame absolute flex items-end gap-5 bg-[rgb(2_3_4/0.55)] px-3 py-2 [--frame-l:6px] transition-[bottom] duration-300 motion-reduce:transition-none"
      style={{ left: ins.left + 12, bottom: ins.bottom + 30 }}>
      <ScaleBar planet={planet} maxPx={100} />
      <AltitudeReadout planet={planet} />
    </div>
  );
}
