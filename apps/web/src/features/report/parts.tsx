/**
 * Small presentational pieces shared by the dossier: numeral typesetting, numbered section heads,
 * decision and status marks (the app's shared set), and hairline readout grids. Square, 1 px linework; no
 * rounded containers.
 */
import type { ReactNode } from "react";
import { OutcomeMark, outcomeKind, StatusMark as SharedStatusMark, type StatusKind } from "../../components/marks";
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
 * Research decision mark: the app's shared outcome mark (components/marks.tsx), so the dossier draws a
 * decision exactly as the Mars, Earth and comparison views do: solid square = stable leader, two nested
 * squares = tie, hollow square = no analog named (no convincing analog, not enough evidence). Always paired
 * with words. `size` in px, drawn on the pixel grid.
 */
export function DecisionMark({ type, size = 9, className }: { type: DecisionType; size?: number; className?: string }) {
  return <OutcomeMark kind={outcomeKind(type)} size={size} className={className} />;
}

const STATUS_WORD: Record<DimensionStatus, string> = { evaluated: "Evaluated", partial: "Partial", not_evaluated: "Not evaluated" };
const STATUS_KIND: Record<DimensionStatus, StatusKind> = { evaluated: "on", partial: "partial", not_evaluated: "off" };

/** Shared status square: filled = evaluated, half filled = partial, outlined = not evaluated. Always with the word. */
export function StatusMark({ status, className }: { status: DimensionStatus; className?: string }) {
  return <SharedStatusMark state={STATUS_KIND[status]} className={className} />;
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
    <dl className={cx("print-keep grid border-b border-r border-line", cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2", className)}>
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
