import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../components/ui";
import { niceTicks } from "./model";

/**
 * Label-left dot charts drawn with positioned HTML. Text stays real text at its token size, the
 * plot track stretches to any width (390 px phones included), and there is nothing to drag or zoom.
 */

export interface Scale { lo: number; hi: number; ticks: number[]; at: (v: number) => number }

export function scale(lo: number, hi: number, ticks?: number[]): Scale {
  const t = ticks ?? niceTicks(lo, hi, 5);
  return { lo, hi, ticks: t, at: (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100 };
}

/** The shared row grid: label column (wraps), plot track. */
export const ROW_GRID = "grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] gap-x-3 sm:grid-cols-[13.5rem_minmax(0,1fr)] sm:gap-x-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-8";

export function Chart({ id, title, basis, legend, children, footer, className }: {
  id?: string; title: ReactNode; basis?: ReactNode; legend?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <figure id={id} className={cx("m-0", className)}>
      <figcaption className="mb-4">
        <div className="text-title text-ink">{title}</div>
        {basis && <div className="mt-1 max-w-[62ch] text-caption text-muted">{basis}</div>}
        {legend && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-muted">{legend}</div>}
      </figcaption>
      {children}
      {footer && <div className="mt-4">{footer}</div>}
    </figure>
  );
}

/** Faint vertical gridlines behind a track. */
export function Grid({ s }: { s: Scale }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {s.ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${s.at(t)}%` }} />
      ))}
    </div>
  );
}

/** One chart row: label (with value line) left, plot track right. */
export function Row({ label, value, children, emphasis, className, srText }: {
  label: ReactNode; value?: ReactNode; children: ReactNode; emphasis?: boolean; className?: string; srText?: string;
}) {
  return (
    <li className={cx(ROW_GRID, "items-center py-2", className)}>
      <div className="min-w-0">
        <div className={cx("text-label leading-tight", emphasis ? "text-ink" : "text-muted")}>{label}</div>
        {value && <div className="num mt-0.5 text-num-sm text-faint">{value}</div>}
        {srText && <span className="sr-only">{srText}</span>}
      </div>
      <div aria-hidden className="relative h-8">{children}</div>
    </li>
  );
}

/** Axis under the rows, aligned to the track column. */
export function Axis({ s, title, format = (v: number) => v.toFixed(1) }: { s: Scale; title?: ReactNode; format?: (v: number) => string }) {
  return (
    <div aria-hidden className={cx(ROW_GRID, "mt-1")}>
      <div />
      <div>
        <div className="relative h-5 border-t border-line-strong">
          <Ticks s={s} format={format} />
        </div>
        {title && <div className="mt-3 text-center text-caption text-muted">{title}</div>}
      </div>
    </div>
  );
}

/** Tick marks and labels; the end labels sit inside the track so they never overflow the page. */
export function Ticks({ s, format }: { s: Scale; format: (v: number) => string }) {
  const last = s.ticks.length - 1;
  return (
    <>
      {s.ticks.map((t, i) => {
        const x = s.at(t);
        const edge = x <= 0.5 ? "left" : x >= 99.5 ? "right" : "mid";
        return (
          <span key={t} className="absolute top-0" style={{ left: `${x}%` }}>
            <span className="absolute left-0 top-0 block h-1 w-px bg-line-strong" />
            <span className={cx("num absolute top-1.5 block whitespace-nowrap text-num-sm text-faint", edge === "left" ? "left-0" : edge === "right" ? "right-0" : "-translate-x-1/2")}
              data-last={i === last || undefined}>{format(t)}</span>
          </span>
        );
      })}
    </>
  );
}

/** Width of an element in CSS px (for pixel-aware layouts such as dot dodging). */
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

/** A dot centred on a value. */
export function Dot({ x, kind = "solid", size = 10, className, title }: { x: number; kind?: "solid" | "ring" | "diamond"; size?: number; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2", kind === "diamond" ? "rotate-45 rounded-[1px]" : "rounded-full", className)}
      style={{ left: `${x}%`, width: size, height: size }} />
  );
}

/** A horizontal segment between two values (CI whisker, dumbbell bar). */
export function Seg({ a, b, className, thick = 2 }: { a: number; b: number; className?: string; thick?: number }) {
  const l = Math.min(a, b), r = Math.max(a, b);
  return <span className={cx("absolute top-1/2 -translate-y-1/2 rounded-full", className)} style={{ left: `${l}%`, width: `${r - l}%`, height: thick }} />;
}

/** Legend swatch + words (status is never colour alone). */
export function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2">{swatch}<span>{children}</span></span>;
}
export const SolidSwatch = ({ className }: { className?: string }) => <span aria-hidden className={cx("inline-block h-2.5 w-2.5 rounded-full", className ?? "bg-ink")} />;
export const RingSwatch = ({ className }: { className?: string }) => <span aria-hidden className={cx("inline-block h-2.5 w-2.5 rounded-full border-2", className ?? "border-muted")} />;
