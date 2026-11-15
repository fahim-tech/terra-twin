import { useLayoutEffect, useRef, useState } from "react";
import { AltitudeReadout, ScaleBar } from "../../components/map/Instruments";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useGlobes } from "../../store/globes";
import { CompareNav } from "./CompareNav";
import { CORNERS, FootprintGauge } from "./FootprintGauge";
import { plateLevel } from "./gauge";
import { PlanetLabel } from "./marks";
import { type CompareTargets, recordDigits } from "./model";

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
/** Extra room needed before a plate shows detail it dropped, px. */
const HYSTERESIS = 6;

function Plate({ planet, targets, compact }: { planet: Planet; targets: CompareTargets; compact: boolean }) {
  const t = planet === "mars" ? targets.mars : targets.earth;
  const sub = planet === "earth" ? targets.earth.sub : null;
  const clear = usePlateClearance(planet, { footprint: !compact, note: !!sub && !compact });
  const showFootprint = !compact && clear.level < 2;
  const showNote = !!sub && !compact && clear.level < 1;
  // What gave way stays one hover away (and is in the strip and the Why brief).
  const hidden = [!compact && !showFootprint ? t.footprint : null, sub && !compact && !showNote ? sub : null].filter(Boolean).join(" · ");
  return (
    // A dark glass plate (not a scrim), so the labels stay legible over bright terrain and cloud. A labelled
    // group, not a landmark region: the strip below is the comparison's one region.
    <div ref={clear.plate} role="group" aria-label={`${planet === "mars" ? "Mars" : "Earth"} location`} title={hidden || undefined}
      className="surface frame absolute left-3 top-3 w-max max-w-[min(280px,calc(100%-24px))] rounded-surface px-3.5 pb-3 pt-2.5 [--frame-l:8px]">
      <div ref={clear.core} className="w-max max-w-full">
        <PlanetLabel planet={planet} role={planet === "mars" ? "Target" : "Candidate"} />
        <div className="toponym mt-2 text-[20px] leading-[1.02] tracking-[0.04em] text-ink">{t.name}</div>
        <div className="num mt-1.5 text-num-sm text-ink/90">{formatLat(t.lat, recordDigits(t.lat, t.lon))}&ensp;{formatLon(t.lon, recordDigits(t.lat, t.lon))}</div>
      </div>
      {showFootprint && (
        <div ref={clear.footprint} className="mt-1.5 flex items-baseline gap-2 text-caption text-muted">
          {/* The same square the globe draws, as a legend key. */}
          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] border border-ink" />
          <span>{t.footprint}</span>
        </div>
      )}
      {/* The pool note makes the plate taller; narrow halves print its one-line form, which keeps every
          qualifier (a clamp would cut "for reasons other than its terrain"). When the plate would reach the
          compared square, the note gives way first, then the footprint line. */}
      {showNote && (
        <div ref={clear.note} className="mt-1.5 border-t border-line pt-1.5 text-caption text-faint" title={sub ?? undefined}>
          <span className="@min-[680px]:hidden">{targets.earth.subShort ?? sub}</span>
          <span className="@max-[679px]:hidden">{sub}</span>
        </div>
      )}
    </div>
  );
}

/**
 * How much of a plate's optional detail fits above and left of the compared square as projected (the
 * footprint gauge's anchors), so a plate never covers the footprint: level 0 shows everything, 1 drops the
 * pool note, 2 also drops the footprint line. Each level is judged with the heights the pieces had when
 * they last showed (and the plate's full width), so hiding a piece cannot flip the answer back.
 */
function usePlateClearance(planet: Planet, has: { footprint: boolean; note: boolean }) {
  const plate = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const footprint = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const footprintH = useRef(22);
  const noteH = useRef(34);
  const fullW = useRef(0);
  const decidedFor = useRef<{ anchors: unknown; footprint: boolean; note: boolean } | null>(null);
  const [level, setLevel] = useState(0);
  const anchors = useGlobes((s) => s.anchors[planet]);
  useLayoutEffect(() => {
    const el = plate.current;
    if (!el || !core.current) return;
    if (footprint.current) footprintH.current = footprint.current.offsetHeight + 6;
    if (note.current) noteH.current = note.current.offsetHeight + 6;
    const maxW = Math.min(280, (el.parentElement?.clientWidth ?? 0) - 24);
    if (level === 0 && has.footprint) fullW.current = el.offsetWidth;
    const pts = CORNERS.map((id) => anchors[id]);
    const square = pts.some((p) => !p || !p.visible) ? null : { left: Math.min(...pts.map((p) => p!.x)), top: Math.min(...pts.map((p) => p!.y)) };
    const base = el.offsetHeight - (footprint.current ? footprintH.current : 0) - (note.current ? noteH.current : 0);
    const wide = fullW.current || maxW;
    const bare = Math.min(maxW, core.current.offsetWidth + 28); // + the plate's 14 px side padding
    const fp = has.footprint ? footprintH.current : 0;
    const origin = { x: el.offsetLeft, y: el.offsetTop };
    const boxes = [
      { w: wide, h: base + fp + (has.note ? noteH.current : 0) },
      { w: has.footprint ? wide : bare, h: base + fp },
      { w: bare, h: base },
    ];
    let next = plateLevel(square, origin, boxes, CLEARANCE);
    // Detail comes back only with room to spare, so whole-pixel rounding of the measured sizes can never
    // flip a plate back and forth at the boundary; and a plate changes level at most once per camera
    // position (anchor update), so a layout pass always settles.
    if (next < level) next = Math.min(level, plateLevel(square, origin, boxes, CLEARANCE + HYSTERESIS));
    const last = decidedFor.current;
    const sameInputs = !!last && last.anchors === anchors && last.footprint === has.footprint && last.note === has.note;
    if (next !== level && !sameInputs) {
      decidedFor.current = { anchors, footprint: has.footprint, note: has.note };
      setLevel(next);
    }
  });
  return { plate, core, footprint, note, level };
}

/** Live scale and altitude for one half, bottom-left of its free area and clear of the imagery credit. */
function HalfInstruments({ planet }: { planet: Planet }) {
  const ins = useGlobes((s) => s.insets[planet]);
  return (
    // A half narrower than the instruments plus the navigation row (portrait tablets) lifts the
    // instruments above the row, so the altitude is never covered by the zoom buttons.
    <div className="on-imagery frame absolute bottom-[var(--ib)] flex items-end gap-5 bg-[rgb(2_3_4/0.55)] px-3 py-2 [--frame-l:6px] transition-[bottom] duration-300 motion-reduce:transition-none @max-[459px]:bottom-[calc(var(--ib)+46px)]"
      style={{ left: ins.left + 12, ["--ib" as string]: `${ins.bottom + 30}px` }}>
      <ScaleBar planet={planet} maxPx={100} />
      <AltitudeReadout planet={planet} />
    </div>
  );
}
