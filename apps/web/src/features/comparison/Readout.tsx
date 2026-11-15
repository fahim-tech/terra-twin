import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Measure } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { G5 } from "../../lib/glossary";
import { useApp } from "../../store/app";
import type { CandidateView } from "../analogs/candidates";
import { CompareTerm as Term } from "./CompareTerm";
import { NO_RING, PlanetLabel, PlanetMark, VerdictMark } from "./marks";
import type { CompareTargets, Verdict } from "./model";

/**
 * The comparison's telemetry readout: the pair as the stage heading (Mars | Earth), the score with its
 * basis, the decision with its verbatim G5 label, and the scope line. Every string is bound to the
 * search record (compareTargets / verdictFor), never to the live Mars selection.
 */
export interface ReadoutProps {
  c: CandidateView;
  basis: string;
  targets: CompareTargets;
  verdict: Verdict;
  onWhy: () => void;
}

const verdictTermKey = (v: Verdict) => (v.kind === "leader" ? "stableLeader" : v.kind === "tie_member" ? "tie" : v.kind === "insufficient" ? "notEnough" : null);

/** "■ Stable leader" — the decision mark and headline (with its G5 definition on demand). */
export function VerdictLine({ verdict, className }: { verdict: Verdict; className?: string }) {
  const k = verdictTermKey(verdict);
  return (
    <span className={cx("inline-flex items-center gap-2 text-label text-ink", className)}>
      <VerdictMark kind={verdict.kind} />
      <span>{k ? <Term k={k}>{verdict.headline}</Term> : verdict.headline}</span>
    </span>
  );
}

/** "S 0.614": the similarity symbol (with its definition) and the figure in mono. */
export function ScoreFigure({ c, className, symbolClassName }: { c: CandidateView; className?: string; symbolClassName?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={cx("text-caption text-muted", symbolClassName)}><Term k="similarity">S</Term></span>
      <Measure value={c.score} digits={3} className={cx("text-ink", className)} missing="no score" />
    </span>
  );
}

/**
 * Back to the Earth results. `compact`: in a strip narrowed beside the Why brief the word gives way
 * (the arrow keeps its accessible name), so the mode switch keeps its row.
 */
export function BackToResults({ className, compact = false }: { className?: string; compact?: boolean }) {
  const go = useApp((s) => s.go);
  return (
    <button type="button" onClick={() => go("earth")} aria-label="Back to Earth results" title="Back to Earth results"
      className={cx("hit label-caps -ml-1 inline-flex shrink-0 items-center justify-center gap-1.5 px-1 py-1 text-muted transition-colors duration-150 hover:text-ink active:text-ink/70 active:duration-0", className)}>
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> <span className={cx(compact && "@max-[600px]:hidden")}>Results</span>
    </button>
  );
}

/** Opens the brief. The wrapper marks the trigger so the drawer can hand focus back to it on close. */
export function WhyButton({ onWhy, className }: { onWhy: () => void; className?: string }) {
  return (
    <span data-why-trigger="" className="contents">
      <Button variant="primary-earth" onClick={onWhy} className={cx("group", className)}>
        Why this analog?
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">→</span>
      </Button>
    </span>
  );
}

/** The validation note under research scores: the wording is fixed ("validated on synthetic twins only"). */
function Validation({ c, lead = "Validated on" }: { c: CandidateView; lead?: string }) {
  if (c.tier !== 2) return null;
  return <span className="whitespace-nowrap">{lead} <Term k="synthetic" /></span>;
}

/** One planet's half of the pair heading: kicker (decorative; the heading text names the planet) and toponym. */
function PairName({ planet, name, role, size, className, roleClassName }: { planet: Planet; name: string; role: string; size: "lg" | "md" | "sm"; className?: string; roleClassName?: string }) {
  return (
    <span className={cx("block min-w-0", className)}>
      <PlanetLabel planet={planet} role={role} roleClassName={roleClassName} hidden />
      <span className={cx("toponym mt-2 block break-words text-ink",
        size === "lg" ? "text-[24px] leading-[1.02] tracking-[0.03em]" : size === "md" ? "text-[20px] leading-[1.04] tracking-[0.04em]" : "text-[17px] leading-[1.06] tracking-[0.04em]")}>
        {name}
      </span>
    </span>
  );
}

/** Latitude and longitude, each kept whole: a narrow cell may break between them, never inside one. */
const Coords = ({ lat, lon, className }: { lat: number; lon: number; className?: string }) => (
  <span className={cx("num block text-num-sm text-muted", className)}>
    <span className="whitespace-nowrap">{formatLat(lat, 3)}</span>&ensp;<span className="whitespace-nowrap">{formatLon(lon, 3)}</span>
  </span>
);

function Cell({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 px-4 py-3", className)}>
      <div className="kicker">{label}</div>
      {children}
    </div>
  );
}

/**
 * Collapsed readout on desktop and tablet: telemetry cells divided by hairlines. Wide strips (container
 * ≥ 1080 px) put the pair, score, decision and the Why action on one row; narrower ones (tablets) wrap the
 * decision onto a second row. Beside the open Why drawer (`narrow`) the Why cell is left out. The scope
 * line runs along the foot.
 */
export function TelemetryReadout({ c, basis, targets, verdict, onWhy, narrow }: ReadoutProps & { narrow: boolean }) {
  return (
    <>
      <div className={cx("grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.15fr)] grid-rows-[auto_1fr_auto] @min-[1080px]:grid-rows-[auto_1fr]", narrow
        ? "@min-[1080px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.55fr)]"
        : "@min-[1080px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.55fr)_auto]")}>
        {/* The pair is the stage heading; the planet kickers and roles are visual only. */}
        <h2 data-stage-heading="compare" tabIndex={-1} style={NO_RING} className="col-span-2 col-start-1 row-start-1 grid grid-cols-subgrid">
          <span className="sr-only">Comparing </span>
          {/* Beside the brief, cells under ~600 px drop the role words (the planet still names each half). */}
          <PairName planet="mars" name={targets.mars.name} role="Target" size={narrow ? "md" : "lg"} className="px-4 pt-3" roleClassName={narrow ? "@max-[600px]:hidden" : undefined} />
          <span className="sr-only"> on Mars with </span>
          <PairName planet="earth" name={targets.earth.name} role="Candidate" size={narrow ? "md" : "lg"} className="border-l border-line px-4 pt-3" roleClassName={narrow ? "@max-[600px]:hidden" : undefined} />
          <span className="sr-only"> on Earth</span>
        </h2>
        <Coords lat={targets.mars.lat} lon={targets.mars.lon} className="col-start-1 row-start-2 px-4 pb-3 pt-1.5" />
        <Coords lat={targets.earth.lat} lon={targets.earth.lon} className="col-start-2 row-start-2 border-l border-line px-4 pb-3 pt-1.5" />

        <Cell label="Similarity" className="col-start-3 row-span-2 row-start-1 border-l border-line">
          <div className="mt-1.5"><ScoreFigure c={c} className="text-[30px] leading-none tracking-[-0.01em]" symbolClassName="text-[15px]" /></div>
          <p className="mt-2 text-caption text-ink/85">{basis}</p>
        </Cell>

        <Cell label="Decision" className={cx("col-start-1 row-start-3 border-t border-line @min-[1080px]:col-span-1 @min-[1080px]:col-start-4 @min-[1080px]:row-span-2 @min-[1080px]:row-start-1 @min-[1080px]:border-l @min-[1080px]:border-t-0",
          narrow ? "col-span-3" : "col-span-2")}>
          <div className="mt-2"><VerdictLine verdict={verdict} /></div>
          <p className="mt-1 text-caption text-muted">{verdict.detail}</p>
        </Cell>

        {/* Beside the open Why drawer the action is already taken, so the cell is left out. */}
        {!narrow && (
          <div className="col-start-3 row-start-3 flex items-center justify-end border-l border-t border-line px-4 py-3 @min-[1080px]:col-start-5 @min-[1080px]:row-span-2 @min-[1080px]:row-start-1 @min-[1080px]:border-t-0">
            <WhyButton onWhy={onWhy} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line px-4 py-2 text-caption">
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span className="kicker shrink-0">Scope</span>
          <span className="text-muted">{G5.scope}</span>
        </span>
        {c.tier === 2 && <span className="ml-auto text-faint"><Validation c={c} /></span>}
      </div>
    </>
  );
}

/** Expanded (a mode open): the same facts compressed to one row plus a caption line, so the mode gets the room. */
export function CompactReadout({ c, basis, targets, verdict, onWhy, narrow }: ReadoutProps & { narrow: boolean }) {
  return (
    <div className="shrink-0 px-4 pb-2.5 pt-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 data-stage-heading="compare" tabIndex={-1} style={NO_RING} className="toponym flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[20px] leading-none tracking-[0.04em] text-ink">
          <span className="sr-only">Comparing </span>
          <span className="inline-flex items-center gap-2"><PlanetMark planet="mars" />{targets.mars.name}</span>
          <span aria-hidden className="h-px w-5 bg-line-strong" />
          <span className="sr-only"> with </span>
          <span className="inline-flex items-center gap-2"><PlanetMark planet="earth" />{targets.earth.name}</span>
        </h2>
        <ScoreFigure c={c} className="text-[20px] leading-none" />
        <VerdictLine verdict={verdict} />
        {!narrow && <WhyButton onWhy={onWhy} className="ml-auto" />}
      </div>
      <p className="mt-2 text-caption text-muted">
        <span className="text-ink/85">{basis}</span> · <Term k="scope" />{c.tier === 2 && <> · <Validation c={c} lead="validated on" /></>} · <span className="text-faint">{verdict.detail}</span>
      </p>
    </div>
  );
}

/** Phones: one column, the G5 verdict label and the scope one tap away (term popovers). */
export function PhoneReadout({ c, basis, targets, verdict, expanded }: ReadoutProps & { expanded: boolean }) {
  if (expanded) {
    return (
      <div className="shrink-0 px-4 py-2.5">
        <h2 data-stage-heading="compare" tabIndex={-1} style={NO_RING} className="toponym flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px] leading-tight tracking-[0.04em] text-ink">
          <span className="sr-only">Comparing </span>
          <span className="inline-flex items-center gap-1.5"><PlanetMark planet="mars" />{targets.mars.name}</span>
          <span aria-hidden className="h-px w-3 bg-line-strong" />
          <span className="sr-only"> with </span>
          <span className="inline-flex items-center gap-1.5"><PlanetMark planet="earth" />{targets.earth.name}</span>
        </h2>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <VerdictLine verdict={verdict} />
          <ScoreFigure c={c} className="text-[17px] leading-none" />
        </div>
      </div>
    );
  }
  return (
    <>
      <h2 data-stage-heading="compare" tabIndex={-1} style={NO_RING} className="grid shrink-0 grid-cols-2 border-b border-line">
        <span className="sr-only">Comparing </span>
        <PairName planet="mars" name={targets.mars.name} role="Target" size="sm" className="px-4 pb-2.5 pt-2.5" />
        <span className="sr-only"> on Mars with </span>
        <PairName planet="earth" name={targets.earth.name} role="Candidate" size="sm" className="border-l border-line px-4 pb-2.5 pt-2.5" />
        <span className="sr-only"> on Earth</span>
      </h2>
      <div className="shrink-0 px-4 pb-2.5 pt-2">
        <div className="flex items-center justify-between gap-3">
          <VerdictLine verdict={verdict} />
          <ScoreFigure c={c} className="text-[24px] leading-none" />
        </div>
        <p className="mt-1.5 text-caption text-ink/85">{basis}</p>
        <p className="mt-0.5 text-caption text-muted"><Term k="scope" />{c.tier === 2 && <> · <Validation c={c} lead="validated on" /></>}</p>
      </div>
    </>
  );
}
