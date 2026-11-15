import { motion } from "motion/react";
import type { ReactNode } from "react";
import { radioGroupKeys, SPRING } from "../../components/primitives";
import { cx } from "../../components/ui";

/**
 * Readout parts for the Earth results surfaces (mission-control language, docs/redesign/v2-mission-control.md):
 * indexed section rules, hairline key/value readouts, instrument-table rows with a square selection bar, and
 * joined square segmented controls. Square corners only; mono for figures. The marks are the app's shared
 * set (components/marks.tsx), re-exported for the Earth files that import them from here.
 */
export { AnalogMark, NEAR_ANALOG, OutcomeMark, StatusMark } from "../../components/marks";
export type { StatusKind as MarkState } from "../../components/marks";

/** Caps label that also sets a glossary <Term> inside it in caps, left-aligned (buttons inherit neither). */
export const CAPS = "kicker [&_button]:text-left [&_button]:uppercase";

/** Section rule: `02  BASIS ──────────── aside`. */
export function SectionHead({ index, children, aside, id, className }: { index: string; children: ReactNode; aside?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      {/* Index, title, then a hairline that fills the row (line-strong: the panel glass swallows plain line). */}
      <h3 id={id} className={cx(CAPS, "flex min-w-0 flex-1 items-center gap-2.5 !text-ink/85 after:h-px after:min-w-4 after:flex-1 after:bg-line-strong after:content-['']")}>
        <span className="num font-medium text-faint">{index}</span>
        <span>{children}</span>
      </h3>
      {aside !== undefined && aside !== null && <span className="num shrink-0 text-num-sm text-faint">{aside}</span>}
    </div>
  );
}

/** Key/value readout list with hairline rows. */
export function Readouts({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <dl aria-label={label} className={cx("divide-y divide-line border-y border-line", className)}>{children}</dl>;
}

export function Readout({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("grid grid-cols-[6.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-2", className)}>
      <dt className={CAPS}>{label}</dt>
      <dd className="min-w-0 text-caption text-ink/90">{children}</dd>
    </div>
  );
}

/**
 * A row of labelled figures divided by hairlines: the dense header of an instrument. Labels are tracked a
 * little tighter than a kicker so that "LAND CELLS" still fits a quarter of a 360 px phone.
 */
export function ReadoutStrip({ cells, className, label }: { cells: { key: string; label: ReactNode; value: ReactNode }[]; className?: string; label?: string }) {
  return (
    <dl aria-label={label} className={cx("grid border-y border-line", className)} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <div key={c.key} className={cx("min-w-0 py-2.5 max-md:py-2", i > 0 && "border-l border-line pl-3 max-md:pl-2.5", i < cells.length - 1 && "pr-2")}>
          <dt className={cx(CAPS, "whitespace-nowrap !tracking-[0.1em]")}>{c.label}</dt>
          <dd className="num mt-1.5 whitespace-nowrap text-[15px] leading-none text-ink">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Square 2 px bar on the left edge of the selected row; slides between rows of one list (critically damped). */
export function SelectionBar({ layoutId, tone = "earth" }: { layoutId?: string; tone?: "earth" | "ink" }) {
  return <motion.span aria-hidden layoutId={layoutId} transition={SPRING} className={cx("absolute inset-y-0 left-0 w-[2px]", tone === "earth" ? "bg-earth" : "bg-ink")} />;
}

/** Row button of an instrument table: hairline rows come from the list, press feedback is instant. */
export function rowClass(on: boolean, grid: string) {
  return cx("hit relative w-full text-left transition-colors duration-150 active:duration-0", grid,
    on ? "bg-white/[0.06]" : "hover:bg-white/[0.035] active:bg-white/[0.08]");
}

/**
 * Joined square cells with 1 px dividers; the selected cell is inverted. A radio group: one Tab stop,
 * arrow keys / Home / End move the selection.
 */
export function SegmentedField<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={radioGroupKeys(options.map((o) => o.value), value, onChange)}
      className={cx("flex border border-line-strong", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} title={o.title} onClick={() => onChange(o.value)}
            className={cx("hit flex-auto whitespace-nowrap px-2.5 py-2 text-[10.5px] font-semibold uppercase leading-none tracking-[0.1em] transition-colors duration-150 active:duration-0",
              i > 0 && "border-l border-line-strong",
              on ? "bg-ink text-space" : "text-muted hover:bg-white/[0.05] hover:text-ink active:bg-white/[0.1]")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small square text action (outline), for in-panel commands that must stay focusable while unavailable. */
export const ACTION = "hit inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] ring-1 ring-inset transition-[color,background,box-shadow] duration-150 active:duration-0";
