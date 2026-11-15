/**
 * Small presentational pieces shared by the dossier: numeral typesetting, numbered section heads,
 * decision and status marks, and hairline readout grids. Square, 1 px linework; no rounded containers.
 */
import type { ReactNode } from "react";
import { cx } from "../../components/ui";
import type { DecisionType, DimensionStatus } from "./model";
import { splitNumerals } from "./typeset";

/** Text with every numeral in the mono data face (units and words stay in the text face). */
export function Numerals({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {splitNumerals(text).map((s, i) => (s.num ? <span key={i} className="num">{s.text}</span> : s.text))}
    </span>
  );
}

/** Condensed display caps used for dossier titles and designations. */
export const DISPLAY = "font-[family-name:var(--font-display)] font-semibold uppercase";

/** Numbered section head: `03  RESEARCH COMPARISON ───────── aside`. The heading takes focus from the index. */
export function SectionHead({ index, title, aside, headingId }: { index: string; title: string; aside?: ReactNode; headingId: string }) {
  return (
    <div className="section-head flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
      <span aria-hidden className="num text-num-sm text-faint">{index}</span>
      <h2 id={headingId} tabIndex={-1} className={cx(DISPLAY, "text-[20px] leading-none tracking-[0.06em] text-ink md:text-[22px]")}>{title}</h2>
      <span aria-hidden className="h-px min-w-8 flex-1 self-center bg-line" />
      {aside && <span className="text-caption text-faint">{aside}</span>}
    </div>
  );
}

/** A dossier section: anchor for the index, numbered head, then content. */
export function DossierSection({ id, index, title, aside, children, className }: {
  id: string; index: string; title: string; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={`dossier-${id}`} aria-labelledby={`dossier-${id}-h`} className={cx("scroll-mt-10 pt-14 print:pt-9", className)}>
      <SectionHead index={index} title={title} aside={aside} headingId={`dossier-${id}-h`} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Research decision mark, drawn as 1 px linework with the same meaning as the glyphs in the other views:
 * ◉ stable leader, ◎ tie, — no convincing analog, ⊘ not enough evidence. Always paired with words.
 */
export function DecisionMark({ type, className }: { type: DecisionType; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={cx("inline-block h-[0.66em] w-[0.66em] shrink-0 overflow-visible", className)}>
      {type === "no_convincing_analog" ? (
        <path d="M1 6h10" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          {type === "named_leader" && <circle cx="6" cy="6" r="2.4" fill="currentColor" />}
          {type === "tied_set" && <circle cx="6" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
          {type === "insufficient_evidence" && <path d="M2.3 9.7L9.7 2.3" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
        </>
      )}
    </svg>
  );
}

const STATUS_WORD: Record<DimensionStatus, string> = { evaluated: "Evaluated", partial: "Partial", not_evaluated: "Not evaluated" };

/** 6 px status square: filled = evaluated, half = partial, outlined = not evaluated. Always with the word. */
export function StatusMark({ status, className }: { status: DimensionStatus; className?: string }) {
  return (
    <span aria-hidden className={cx("relative inline-block h-1.5 w-1.5 shrink-0 [print-color-adjust:exact]",
      status === "evaluated" ? "bg-ink" : status === "partial" ? "ring-1 ring-inset ring-ink" : "ring-1 ring-inset ring-faint", className)}>
      {status === "partial" && <span className="absolute inset-y-0 left-0 w-1/2 bg-ink" />}
    </span>
  );
}

export function statusWord(s: DimensionStatus): string {
  return STATUS_WORD[s];
}

export interface ReadoutItem { key: string; label: ReactNode; value: ReactNode; note?: ReactNode }

/**
 * Hairline readout grid: labelled values in cells separated by 1 px rules. Each cell draws its top and left
 * rule and the grid draws the right and bottom edge, so every rule is one line at any count or zoom (print
 * scales the dossier). The last cell closes its row, so no empty cell is left open.
 */
export function ReadoutGrid({ items, cols = 2, className }: { items: ReadoutItem[]; cols?: 2 | 3; className?: string }) {
  const odd = items.length % 2 === 1;
  const rem3 = items.length % 3;
  // Across two columns from `sm`, and across the three-column row from `lg`.
  const lastSpan = cx(odd && "sm:col-span-2", cols === 3 && (rem3 === 1 ? "lg:col-span-3" : rem3 === 2 ? "lg:col-span-2" : "lg:col-span-1"));
  return (
    <dl className={cx("grid border-b border-r border-line", cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2", className)}>
      {items.map((it, i) => {
        const span = i === items.length - 1 ? lastSpan : undefined;
        return (
          <div key={it.key} className={cx("min-w-0 border-l border-t border-line px-4 py-3.5", span)}>
            <dt className="kicker [&_button]:uppercase">{it.label}</dt>
            <dd className="mt-2 text-label text-ink">{it.value}</dd>
            {it.note && <dd className="mt-1 text-caption text-faint">{it.note}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
