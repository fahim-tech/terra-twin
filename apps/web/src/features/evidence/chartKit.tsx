import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../components/ui";
import { niceTicks } from "./model";

/**
 * Instrument charts drawn with positioned HTML: hairline axes and guides, mono tick labels, square
 * markers. Text stays real text at its token size, the plot track stretches to any width (390 px
 * phones included), and there is nothing to drag or zoom.
 */

export interface Scale { lo: number; hi: number; ticks: number[]; at: (v: number) => number }

export function scale(lo: number, hi: number, ticks?: number[]): Scale {
  const t = ticks ?? niceTicks(lo, hi, 5);
  return { lo, hi, ticks: t, at: (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100 };
}

/** The shared row grid: label column (wraps), plot track. */
export const ROW_GRID = "grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-x-3 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-x-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-8";

/** Figure title line: "FIG 02  TWIN RECOVERY BY METHOD". */
export function FigTitle({ fig, id, children, className }: { fig?: string; id?: string; children: ReactNode; className?: string }) {
  return (
    <div id={id} className={cx("flex items-baseline gap-3", className)}>
      {fig && <span className="num shrink-0 text-[11px] leading-none text-faint">FIG {fig}</span>}
      <span className="text-[13px] font-semibold uppercase leading-snug tracking-[0.08em] text-ink">{children}</span>
    </div>
  );
}

export function Chart({ fig, title, basis, legend, children, footer, className }: {
  fig?: string; title: ReactNode; basis?: ReactNode; legend?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <figure className={cx("m-0", className)}>
      <figcaption className="mb-6">
        <FigTitle fig={fig}>{title}</FigTitle>
        {basis && <div className="mt-2.5 max-w-[72ch] text-caption text-muted">{basis}</div>}
        {legend && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-muted">{legend}</div>}
      </figcaption>
      {children}
      {footer && <div className="mt-6">{footer}</div>}
    </figure>
  );
}

/** Hairline guide through the track and vertical gridlines at the ticks. */
export function Grid({ s, guide = true }: { s: Scale; guide?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {guide && <span className="absolute inset-x-0 top-1/2 h-px bg-line" />}
      {s.ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-line/80" style={{ left: edgePx(s.at(t)) }} />
      ))}
    </div>
  );
}

/** Keeps a 1 px line at 100 % inside its track. */
const edgePx = (x: number) => (x >= 99.95 ? "calc(100% - 1px)" : `${x}%`);

/** One chart row: label (with mono value line) left, plot track right. */
export function Row({ label, value, children, emphasis, className, srText }: {
  label: ReactNode; value?: ReactNode; children: ReactNode; emphasis?: boolean; className?: string; srText?: string;
}) {
  return (
    <li className={cx(ROW_GRID, "items-center py-2", className)}>
      <div className="min-w-0">
        <div className={cx("text-label leading-tight", emphasis ? "text-ink" : "text-muted")}>{label}</div>
        {value && <div className="num mt-1 text-num-sm text-faint">{value}</div>}
        {srText && <span className="sr-only">{srText}</span>}
      </div>
      <div aria-hidden className="relative h-8">{children}</div>
    </li>
  );
}

/** Axis under the rows, aligned to the track column: hairline, ticks, mono labels, unit at the right. */
export function Axis({ s, title, format = (v: number) => v.toFixed(1) }: { s: Scale; title?: ReactNode; format?: (v: number) => string }) {
  return (
    <div aria-hidden className={cx(ROW_GRID, "mt-1")}>
      <div />
      <div>
        <div className="relative h-6 border-t border-line-strong">
          <Ticks s={s} format={format} />
        </div>
        {title && <div className="mt-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">{title}</div>}
      </div>
    </div>
  );
}

/** Tick marks and labels; the end labels sit inside the track so they never overflow the page. */
export function Ticks({ s, format }: { s: Scale; format: (v: number) => string }) {
  return (
    <>
      {s.ticks.map((t) => {
        const x = s.at(t);
        const edge = x <= 0.5 ? "left" : x >= 99.5 ? "right" : "mid";
        return (
          <span key={t} className="absolute top-0" style={{ left: edgePx(x) }}>
            <span className="absolute left-0 top-0 block h-[5px] w-px bg-line-strong" />
            <span className={cx("num absolute top-2 block whitespace-nowrap text-num-sm leading-none text-faint", edge === "left" ? "left-0" : edge === "right" ? "right-0" : "-translate-x-1/2")}>{format(t)}</span>
          </span>
        );
      })}
    </>
  );
}

/** Width of an element in CSS px (for pixel-aware layouts such as marker dodging). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Square marker kinds: solid = deployed / selected, alt = alternative, hollow = direct comparison, retired = withdrawn. */
export type MarkKind = "solid" | "alt" | "hollow" | "retired" | "warn" | "mars";

const MARK: Record<MarkKind, string> = {
  solid: "bg-ink",
  alt: "bg-muted",
  hollow: "border-[1.5px] border-muted bg-space",
  retired: "border-[1.5px] border-faint bg-space",
  warn: "bg-warn",
  mars: "bg-mars",
};

/** A square marker centred on a value. The ring separates it from the lines it sits on. */
export function Mark({ x, kind = "solid", size = 9, className, ring = "ring-space" }: { x: number; kind?: MarkKind; size?: number; className?: string; ring?: string }) {
  return (
    <span className={cx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ring-2", ring, MARK[kind], className)}
      style={{ left: `${x}%`, width: size, height: size }} />
  );
}

/** A hairline between two values (interval whisker, dumbbell). `caps` adds end ticks so short whiskers stay visible. */
export function Seg({ a, b, className, thick = 1, caps }: { a: number; b: number; className?: string; thick?: number; caps?: boolean }) {
  const l = Math.min(a, b), r = Math.max(a, b);
  return (
    <>
      <span className={cx("absolute top-1/2 -translate-y-1/2", className)} style={{ left: `${l}%`, width: `${r - l}%`, height: thick }} />
      {caps && [l, r].map((x, i) => <span key={i} className={cx("absolute top-1/2 h-[9px] w-px -translate-x-1/2 -translate-y-1/2", className)} style={{ left: `${x}%` }} />)}
    </>
  );
}

/**
 * Compact 0–1 instrument scale under a key figure: hairline track with end and mid ticks, square
 * marks and an optional link between two marks. Same marker language as the charts.
 */
export function MiniScale({ marks, link, linkClass = "bg-ink/45", ends = ["0", "1"], ring = "ring-surface" }: {
  marks: { v: number | null; kind: MarkKind; size?: number }[]; link?: [number | null, number | null]; linkClass?: string; ends?: [string, string]; ring?: string;
}) {
  const s = scale(0, 1, [0, 0.5, 1]);
  const [a, b] = link ?? [null, null];
  return (
    <div aria-hidden>
      <div className="relative h-3.5">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        {s.ticks.map((t) => <span key={t} className="absolute top-[3px] h-2 w-px bg-line-strong" style={{ left: edgePx(s.at(t)) }} />)}
        {a !== null && b !== null && <Seg a={s.at(a)} b={s.at(b)} className={linkClass} />}
        {marks.map((mk, i) => (mk.v === null ? null : <Mark key={i} x={s.at(mk.v)} kind={mk.kind} size={mk.size ?? 8} ring={ring} />))}
      </div>
      <div className="num mt-1.5 flex justify-between text-[10px] leading-none text-faint"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

/** Legend swatch + words (status is never colour alone). */
export function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2">{swatch}<span>{children}</span></span>;
}
export const SolidSwatch = ({ className }: { className?: string }) => <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0", className ?? "bg-ink")} />;
export const RingSwatch = ({ className }: { className?: string }) => <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 border-[1.5px]", className ?? "border-muted")} />;
/** ├─┤ interval whisker. */
export const IntervalSwatch = () => (
  <span aria-hidden className="relative inline-block h-[9px] w-4 shrink-0">
    <span className="absolute inset-x-0 top-1/2 h-px bg-muted" />
    <span className="absolute inset-y-0 left-0 w-px bg-muted" />
    <span className="absolute inset-y-0 right-0 w-px bg-muted" />
  </span>
);
/** Vertical hairline (median and reference lines). */
export const RuleSwatch = ({ className }: { className?: string }) => <span aria-hidden className={cx("inline-block h-3 w-px shrink-0", className ?? "bg-ink")} />;
