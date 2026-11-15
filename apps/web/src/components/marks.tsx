import type { ReactNode } from "react";
import type { Planet } from "../globes/protocol";
import { Measure, Term } from "./primitives";
import { cx } from "./ui";

/**
 * TerraTwin's one mark set (docs/redesign/v2-mission-control.md §1, §4): small drawn marks that sit beside
 * words and never replace them. Shape carries the meaning; colour is signal only: ink by default, amber
 * for a caution, red for a fault, a planet colour only where the mark belongs to that planet's data. Every
 * mark is drawn (SVG), never a typed glyph, which changes with the font and can turn into an emoji, and
 * every mark is aria-hidden: the words beside it carry the meaning.
 */

/* ------------------------------------------------------------------------------- decision outcomes */

/**
 * What a research decision says, about a zone or about one candidate:
 * `leader` the stable leader · `tie` a tie, or one window of a tied set (a valid outcome, not a warning) ·
 * `none` no analog named (no convincing analog, not enough evidence, or a window the decision does not
 * name) · `screening` a global-screen cell, ranked by the screen but not a decision · `not_loaded` no
 * outcome loaded.
 */
export type OutcomeKind = "leader" | "tie" | "none" | "screening" | "not_loaded";

export type OutcomeShape = "solid" | "nested" | "hollow" | "brackets" | "dash";

/** Ink tones only: decisions are not cautions or faults, and they are not one planet's data. */
export type MarkInk = "ink" | "muted" | "faint";

export interface OutcomeSpec {
  shape: OutcomeShape;
  ink: MarkInk;
  /** The legend word for the mark (views print the specific decision beside it). */
  word: string;
}

export const OUTCOME_MARKS: Record<OutcomeKind, OutcomeSpec> = {
  leader: { shape: "solid", ink: "ink", word: "Stable leader" },
  tie: { shape: "nested", ink: "ink", word: "Tie" },
  none: { shape: "hollow", ink: "ink", word: "No analog named" },
  screening: { shape: "brackets", ink: "muted", word: "Screening cell, not a decision" },
  not_loaded: { shape: "dash", ink: "faint", word: "Not loaded" },
};

/** The research record's decision types, as the API names them. */
export type DecisionType = "named_leader" | "tied_set" | "no_convincing_analog" | "insufficient_evidence";

/**
 * The outcome mark for a research decision type. No decision at all (nothing loaded yet, or no research
 * configuration for the mission) is `not_loaded`; a type this build does not know names no analog.
 */
export function outcomeKind(type: DecisionType | string | null | undefined): OutcomeKind {
  if (!type) return "not_loaded";
  if (type === "named_leader") return "leader";
  if (type === "tied_set") return "tie";
  return "none";
}

/**
 * The plain name of each research decision, the same in every view (glossary §13); the research term
 * stays on demand where a view links it.
 */
export const DECISION_WORDS: Record<DecisionType, string> = {
  named_leader: "Stable leader",
  tied_set: "Tie",
  no_convincing_analog: "No convincing analog",
  insufficient_evidence: "Not enough evidence",
};

/** The decision's plain name; an unknown type is said as the record writes it, never guessed. */
export function decisionWord(type: DecisionType | string): string {
  return DECISION_WORDS[type as DecisionType] ?? type.replace(/_/g, " ");
}

const INK_CLASS: Record<MarkInk, string> = { ink: "text-ink", muted: "text-muted", faint: "text-faint" };

/**
 * A decision outcome mark: solid square = stable leader, two nested squares = tie, hollow square = no
 * analog named, corner brackets = screening cell (not a decision), short dash = not loaded. Drawn on the
 * pixel grid at `size` px (default 8), so its 1 px lines stay crisp; `className` may set another colour.
 */
export function OutcomeMark({ kind, size = 8, className }: { kind: OutcomeKind; size?: number; className?: string }) {
  const s = Math.max(5, Math.round(size));
  const spec = OUTCOME_MARKS[kind];
  return (
    <svg aria-hidden width={s} height={s} viewBox={`0 0 ${s} ${s}`} shapeRendering="crispEdges" data-mark={kind}
      className={cx("inline-block shrink-0 overflow-visible", INK_CLASS[spec.ink], className)}>
      <OutcomeShapePath shape={spec.shape} s={s} />
    </svg>
  );
}

function OutcomeShapePath({ shape, s }: { shape: OutcomeShape; s: number }) {
  if (shape === "solid") return <rect width={s} height={s} fill="currentColor" />;
  if (shape === "dash") return <rect x={1} y={Math.floor((s - 1) / 2)} width={s - 2} height={1} fill="currentColor" />;
  const e = s - 0.5;
  if (shape === "brackets") {
    const a = Math.max(2, Math.round(s * 0.3));
    return (
      <path fill="none" stroke="currentColor" strokeWidth={1}
        d={`M0.5 ${a}V0.5H${a} M${s - a} 0.5H${e}V${a} M${e} ${s - a}V${e}H${s - a} M${a} ${e}H0.5V${s - a}`} />
    );
  }
  const k = Math.max(2, Math.round(s * 0.3));
  return (
    <>
      <rect x={0.5} y={0.5} width={s - 1} height={s - 1} fill="none" stroke="currentColor" strokeWidth={1} />
      {shape === "nested" && <rect x={k} y={k} width={s - 2 * k} height={s - 2 * k} fill="currentColor" />}
    </>
  );
}

/* ---------------------------------------------------------------------------------------- statuses */

/**
 * The state of an input, layer, check or evaluation: `on` filled · `off` outlined · `partial` half filled ·
 * `caution` amber triangle · `fault` red square with a cross · `struck` outlined and struck through (not
 * available). Caution and fault differ from on/off in shape as well as colour.
 */
export type StatusKind = "on" | "off" | "partial" | "caution" | "fault" | "struck";

export type StatusShape = "solid" | "hollow" | "half" | "triangle" | "crossed" | "struck";

export const STATUS_MARKS: Record<StatusKind, { shape: StatusShape; tone: "ink" | "faint" | "warn" | "bad" }> = {
  on: { shape: "solid", tone: "ink" },
  off: { shape: "hollow", tone: "faint" },
  partial: { shape: "half", tone: "ink" },
  caution: { shape: "triangle", tone: "warn" },
  fault: { shape: "crossed", tone: "bad" },
  struck: { shape: "struck", tone: "faint" },
};

const TONE_CLASS = { ink: "text-ink", faint: "text-faint", warn: "text-warn", bad: "text-bad", mars: "text-mars", earth: "text-earth" } as const;

/**
 * A status mark, 6 px by default (caution and fault are drawn a pixel larger so their shapes read).
 * `tone` sets the ink of an on, off or partial mark: a planet colour where the mark belongs to that
 * planet's data. Caution, fault and struck keep their own colours.
 */
export function StatusMark({ state, tone, size, className }: { state: StatusKind; tone?: "ink" | "mars" | "earth"; size?: number; className?: string }) {
  const spec = STATUS_MARKS[state];
  const s = Math.max(5, Math.round(size ?? (state === "caution" || state === "fault" ? 7 : 6)));
  const toned = state === "on" || state === "off" || state === "partial";
  const colour = toned && tone ? TONE_CLASS[tone] : TONE_CLASS[spec.tone];
  const e = s - 0.5;
  return (
    <svg aria-hidden width={s} height={s} viewBox={`0 0 ${s} ${s}`} data-mark={state}
      shapeRendering={spec.shape === "triangle" ? "geometricPrecision" : "crispEdges"}
      className={cx("inline-block shrink-0 overflow-visible [print-color-adjust:exact]", colour, className)}>
      {spec.shape === "solid" && <rect width={s} height={s} fill="currentColor" />}
      {spec.shape === "triangle" && <path d={`M${s / 2} 0L${s} ${s}H0Z`} fill="currentColor" />}
      {(spec.shape === "hollow" || spec.shape === "half" || spec.shape === "crossed" || spec.shape === "struck") && (
        <rect x={0.5} y={0.5} width={s - 1} height={s - 1} fill="none" stroke="currentColor" strokeWidth={1} />
      )}
      {spec.shape === "half" && <rect width={Math.ceil(s / 2)} height={s} fill="currentColor" />}
      {spec.shape === "struck" && <path d={`M0.5 ${e}L${e} 0.5`} stroke="currentColor" strokeWidth={1} shapeRendering="geometricPrecision" />}
      {spec.shape === "crossed" && <path d={`M2 2L${s - 2} ${s - 2}M${s - 2} 2L2 ${s - 2}`} stroke="currentColor" strokeWidth={1} shapeRendering="geometricPrecision" />}
    </svg>
  );
}

/* --------------------------------------------------------------------------------- planets, flags */

export const PLANET_NAME: Record<Planet, string> = { mars: "Mars", earth: "Earth" };

/** Planet identity: a 6 px square in the planet colour (it belongs to that planet's data). */
export function PlanetMark({ planet, className }: { planet: Planet; className?: string }) {
  return <span aria-hidden className={cx("inline-block h-1.5 w-1.5 shrink-0 [print-color-adjust:exact]", planet === "mars" ? "bg-mars" : "bg-earth", className)} />;
}

/** The one wording for a screened cell near a documented analog of the reference set (API: near_documented_analog). */
export const NEAR_ANALOG = "Near documented analog";

/** Near a documented analog: a 1 px outlined diamond. */
export function AnalogMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 8 8" className={cx("inline-block h-2 w-2 shrink-0 text-muted", className)}>
      <path d="M4 0.75 7.25 4 4 7.25 0.75 4Z" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------ symbol */

/**
 * "S 0.614", set the same way in every view: the similarity symbol S in the text face, quieter and about
 * half the figure's size (never below 11 px), then the figure in mono. `term` links the symbol to its
 * definition where a view offers one (`symbol` swaps in a view's own term trigger, e.g. one whose popover
 * escapes a clipping panel); inside a button it must stay plain text (no nested controls). A missing score
 * reads as missing, never as 0.
 */
export function SFigure({ value, term = false, symbol, digits = 3, missing = "—", className, figureClassName }: {
  value: number | null | undefined; term?: boolean; symbol?: ReactNode; digits?: number; missing?: string; className?: string; figureClassName?: string;
}) {
  return (
    <span className={cx("inline-flex items-baseline gap-[0.32em] whitespace-nowrap", className)}>
      <span className="font-sans text-[length:max(11px,0.5em)] font-medium normal-case tracking-normal text-muted">{symbol ?? (term ? <Term k="similarity">S</Term> : "S")}</span>
      <Measure value={value} digits={digits} missing={missing} className={figureClassName} />
    </span>
  );
}

/* ----------------------------------------------------------------------------------------- legends */

/** A legend row: each mark with its word, kept whole; the row wraps between items, never inside one. */
export function MarkLegend({ items, label, className }: { items: { key: string; mark: ReactNode; word: ReactNode }[]; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-faint", className)}>
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">{i.mark}{i.word}</li>
      ))}
    </ul>
  );
}

/** The one order outcome marks are listed in, in every legend. */
export const OUTCOME_ORDER: readonly OutcomeKind[] = ["leader", "tie", "none", "screening", "not_loaded"];

/**
 * The outcome kinds a set of rows actually shows, each once and in the legend order: a legend names the
 * marks on screen, never ones that cannot appear (with no outcome loaded it is just the dash).
 */
export function legendKinds(shown: Iterable<OutcomeKind>): OutcomeKind[] {
  const s = new Set(shown);
  return OUTCOME_ORDER.filter((k) => s.has(k));
}

/** Legend of decision outcome marks, with the canonical words (or the view's own, in the same order). */
export function OutcomeLegend({ kinds, words, label = "Research outcome marks", className }: {
  kinds: OutcomeKind[]; words?: Partial<Record<OutcomeKind, string>>; label?: string; className?: string;
}) {
  return (
    <MarkLegend label={label} className={className}
      items={kinds.map((k) => ({ key: k, mark: <OutcomeMark kind={k} />, word: words?.[k] ?? OUTCOME_MARKS[k].word }))} />
  );
}
