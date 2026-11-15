import type { ReactNode } from "react";
import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch } from "../../types/contracts";
import { screenCellKm } from "../analogs/candidates";
import { candidateRole, decisionHeadline, decisionLabel, representationLabel, type ReportCandidate } from "./model";
import { DecisionMark, DISPLAY, Numerals } from "./parts";

/**
 * Grid placement of the four figures. Each figure's label, value and note are separate grid items in
 * shared rows, so every value sits on one baseline across the row (`self-baseline`) whatever its face or
 * size, and every note starts on one line. One column on phones, 2 × 2 from `sm`, one row from `lg`.
 * Vertical rules live on an overlay with the same column tracks (a baseline-aligned value cannot carry a
 * full-height border); horizontal rules are on the labels.
 */
const COLS = "sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.75fr_1.25fr] print:grid-cols-[1.3fr_0.9fr_0.75fr_1.25fr]";
const PLACE = [
  { col: "col-start-1", rows: ["row-start-1", "row-start-2", "row-start-3"], top: "" },
  {
    col: "col-start-1 sm:col-start-2",
    rows: ["row-start-4 sm:row-start-1", "row-start-5 sm:row-start-2", "row-start-6 sm:row-start-3"],
    top: "border-t sm:border-t-0",
  },
  {
    col: "col-start-1 lg:col-start-3 print:col-start-3",
    rows: ["row-start-7 sm:row-start-4 lg:row-start-1 print:row-start-1", "row-start-8 sm:row-start-5 lg:row-start-2 print:row-start-2", "row-start-9 sm:row-start-6 lg:row-start-3 print:row-start-3"],
    top: "border-t lg:border-t-0 print:border-t-0",
  },
  {
    col: "col-start-1 sm:col-start-2 lg:col-start-4 print:col-start-4",
    rows: ["row-start-10 sm:row-start-4 lg:row-start-1 print:row-start-1", "row-start-11 sm:row-start-5 lg:row-start-2 print:row-start-2", "row-start-12 sm:row-start-6 lg:row-start-3 print:row-start-3"],
    top: "border-t lg:border-t-0 print:border-t-0",
  },
] as const;

interface Fig { key: string; label: ReactNode; value: ReactNode; note: ReactNode }

/** Numerals: mono at figure size. Words: condensed caps, smaller, on the same baseline. */
const NUM_VALUE = "num text-[30px] leading-none tracking-[-0.01em] text-ink";
const WORD_VALUE = cx(DISPLAY, "text-[23px] leading-[1.08] tracking-[0.03em] text-ink");

export function KeyFigures({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t2 = search.tier2;
  const d = t2.decision;
  const role = c ? candidateRole(search, c) : null;
  const t1weights = (search.tier1 as { weights_status?: string } | null)?.weights_status;
  const cellKm = screenCellKm(search);

  const decision: Fig = c?.tier === 1
    ? {
        key: "decision", label: "Screen rank",
        value: <span className={NUM_VALUE}>#{c.t1!.rank}</span>,
        note: <>Global screening cell — a screen rank, not a decision. Research decision for this zone: <span className="whitespace-nowrap text-ink"><DecisionMark type={d.type} className="mr-1 -translate-y-px" />{decisionHeadline(search)}</span>.</>,
      }
    : {
        key: "decision", label: "Research decision",
        value: (
          <span className={cx(WORD_VALUE, "inline-flex items-baseline gap-2.5")}>
            <DecisionMark type={d.type} className="h-[0.62em] w-[0.62em]" />
            <Numerals text={decisionHeadline(search)} />
          </span>
        ),
        note: <>
          {decisionLabel(search)}
          {role === "tie_member" && <span className="mt-1.5 block text-ink">This window is one member of the tie — not a winner.</span>}
          {role === "research_window" && d.members.length > 0 && <span className="mt-1.5 block text-ink">This window is not a decision member.</span>}
        </>,
      };

  const scoreBasis = !c ? (d.type === "insufficient_evidence" ? "No score — not enough evidence" : "No candidate selected; no score is reported")
    : c.tier === 2 ? <>Research comparison · {representationLabel(t2.representation)}{role === "tie_member" ? " · does not rank tie members" : ""}</>
    : <>Global screen · Earth as measured{cellKm !== null ? <> · <span className="num">{cellKm}</span> km</> : ""} · mission-weighted</>;

  const figs: Fig[] = [
    decision,
    {
      key: "s", label: <Term k="similarity">{c?.tier === 1 ? "Screen similarity" : "Similarity S"}</Term>,
      value: c && c.score !== null ? <span className={NUM_VALUE}>{c.score.toFixed(3)}</span> : <span className={cx(NUM_VALUE, "!text-faint")}>—</span>,
      note: scoreBasis,
    },
    {
      key: "measures", label: <Term k="measures">Measures</Term>,
      value: c && c.measures.used !== null ? <span className={NUM_VALUE}>{c.measures.used}/{c.measures.of}</span> : <span className={cx(NUM_VALUE, "!text-faint")}>—</span>,
      note: c ? (c.tier === 2 ? "Research descriptors computed for this window" : "Screening descriptors computed for this cell") : "No candidate",
    },
    {
      key: "validation", label: "Validation",
      value: <span className={WORD_VALUE}>{c?.tier === 1 ? "Not validated" : t2.validation_status === "synthetic_twins_only" ? "Synthetic twins only" : t2.validation_status.replace(/_/g, " ")}</span>,
      note: c?.tier === 1
        ? <>Screening weights are {t1weights === "hypothesis" ? "working hypotheses" : t1weights ?? "unvalidated"}; the screen is not validated against field data or expert review.</>
        : <Numerals text={G5.validation} />,
    },
  ];

  return (
    <div className="frame print-keep relative border border-line bg-surface">
      <div aria-hidden className={cx("pointer-events-none absolute inset-0 hidden sm:grid", COLS)}>
        <span />
        <span className="border-l border-line" />
        <span className="hidden border-l border-line lg:block print:block" />
        <span className="hidden border-l border-line lg:block print:block" />
      </div>
      <dl className={cx("relative grid grid-cols-1", COLS)}>
        {figs.map((f, i) => {
          const p = PLACE[i];
          const cell = cx(p.col, "border-line px-5 md:px-6");
          return (
            <div key={f.key} className="contents">
              <dt className={cx(cell, p.rows[0], p.top, "kicker self-stretch pt-5 !text-muted [&_button]:uppercase")}>{f.label}</dt>
              <dd className={cx(cell, p.rows[1], "self-baseline pt-3.5")}>{f.value}</dd>
              <dd className={cx(cell, p.rows[2], "self-start pb-5 pt-3 text-caption text-faint")}>
                <span className="block max-w-[46ch]">{f.note}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
