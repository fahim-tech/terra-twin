import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export type SheetSnap = "peek" | "half" | "full";

/** Apple's projection: where a flick would come to rest under scroll-like deceleration. */
export function project(velocityPxPerS: number, decelerationRate = 0.998) {
  return ((velocityPxPerS / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary instead of a hard stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

interface Props {
  children: ReactNode;
  label: string;
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  /** Height of the always-visible strip in the peek state, px. */
  peek?: number;
  header?: ReactNode;
  className?: string;
  /** Marks the sheet as covering a globe (see useGlobeInsets). */
  occludes?: "mars" | "earth" | "both";
}

/** A text row's span inside a scrolling column, in the column's content coordinates. */
export interface Row { top: number; bottom: number }

/**
 * The deepest cut at or above `target` that crosses no row (so nothing comes to rest sliced through its
 * glyphs), searched no further up than `floor`. Returns `target` when every line in range cuts a row.
 */
export function cleanCut(rows: Row[], target: number, floor: number): number {
  for (let c = Math.round(target); c >= floor; c -= 2) {
    if (!rows.some((r) => r.top < c - 1 && r.bottom > c + 1)) return c;
  }
  return Math.round(target);
}

/** Leaf-like rows of a column: text lines, list items, buttons, figures; short enough to be one row. */
function rowsIn(el: HTMLElement, origin: number): Row[] {
  const out: Row[] = [];
  el.querySelectorAll<HTMLElement>("p, li, dt, dd, button, h2, h3, h4, [role=row], [role=tab], .num, span.kicker, span.toponym, label").forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.height > 0 && r.height <= 96) out.push({ top: r.top - origin, bottom: r.bottom - origin });
  });
  return out;
}

const GRAB = 44;

/**
 * Mobile bottom sheet. Tracks the finger 1:1 (respecting the grab offset), hands the release velocity
 * to a critically damped spring, projects momentum to choose the snap point, and rubber-bands at the
 * ends. The handle is also a button: tap or Enter cycles snap points; arrow keys move between them.
 *
 * Detents are content-aware: the peek ends on a clean line under the header's first rows (never through a
 * row of tabs), and the half detent shows the panel's first figure rows above its docked footer, ending
 * between two rows rather than through one. The grab strip is 44 px tall (the app's touch minimum).
 */
export function Sheet({ children, label, snap, onSnapChange, peek = 132, header, className, occludes }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const [fit, setFit] = useState<{ half: number | null; peek: number | null }>({ half: null, peek: null });
  const y = useMotionValue(10_000);
  const reduced = useReducedMotion();
  const drag = useRef<{ startY: number; startOffset: number; samples: { t: number; y: number }[] } | null>(null);
  const tapAt = useRef(-Infinity);

  const points = useCallback((height: number) => {
    const half = fit.half ?? Math.round(height * 0.48);
    const pk = Math.max(0, height - (fit.peek ?? peek));
    return { full: 64, half: Math.max(64, Math.min(half, pk - 48)), peek: pk };
  }, [peek, fit]);

  /**
   * Measure the content at rest and move the detents onto clean lines. Run once a detent has settled (the
   * panel lays itself out for the visible part of the sheet), so it measures what the reader sees.
   */
  const measureFit = useCallback(() => {
    const sec = host.current;
    if (!sec || !h || drag.current) return;
    const top = sec.getBoundingClientRect().top;
    const visBottom = Math.min(sec.parentElement!.getBoundingClientRect().bottom, window.innerHeight);
    const next = { ...fit };
    // Peek: the header rows above the first scrolling column, cut cleanly between 72 px and the default.
    const all = rowsIn(sec, top);
    const pk = cleanCut(all, peek, 72);
    if (Math.abs((fit.peek ?? peek) - pk) > 2) next.peek = pk;
    if (snap === "half") {
      // The panel's own scrolling body (PanelBody), not the sheet's outer scroller.
      const outer = sec.querySelector<HTMLElement>(":scope > [data-sheet-scroller]");
      const body = Array.from(sec.querySelectorAll<HTMLElement>("[data-sheet-scroller] *"))
        .find((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 8 && n !== outer);
      if (body) {
        const b = body.getBoundingClientRect();
        const footer = Math.max(0, visBottom - b.bottom);
        const rows = rowsIn(body, b.top - body.scrollTop);
        const figure = rows.find((r) => r.top > 24) ?? null;
        // At least the first figure rows (about 150 px of body), more when the screen allows it.
        const want = Math.max(b.height, Math.min(figure ? figure.bottom + 120 : 150, h * 0.42));
        const c = cleanCut(rows, want, Math.max(60, want - 140));
        const half = Math.round(h - (b.top - top) - c - footer);
        if (Math.abs((fit.half ?? Math.round(h * 0.48)) - half) > 4 && half > 64) next.half = half;
      }
    }
    if (next.half !== fit.half || next.peek !== fit.peek) setFit(next);
  }, [fit, h, peek, snap]);

  useLayoutEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const settle = useCallback((target: SheetSnap, velocity = 0) => {
    if (!h) return;
    const to = points(h)[target];
    if (reduced) { y.set(to); requestAnimationFrame(() => requestAnimationFrame(measureFit)); return; }
    // Critically damped by default; a little bounce only when a flick carried momentum.
    animate(y, to, { type: "spring", bounce: Math.abs(velocity) > 900 ? 0.12 : 0, duration: 0.38, velocity })
      .then(() => requestAnimationFrame(() => requestAnimationFrame(measureFit)));
  }, [h, points, reduced, y, measureFit]);

  useEffect(() => { settle(snap); }, [snap, settle]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    y.stop();
    drag.current = { startY: e.clientY, startOffset: y.get(), samples: [{ t: performance.now(), y: e.clientY }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !h) return;
    const p = points(h);
    let next = d.startOffset + (e.clientY - d.startY);
    if (next < p.full) next = p.full - rubberband(p.full - next, h);
    if (next > p.peek) next = p.peek + rubberband(next - p.peek, h);
    y.set(next);
    d.samples.push({ t: performance.now(), y: e.clientY });
    if (d.samples.length > 6) d.samples.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !h) return;
    const moved = Math.abs(e.clientY - d.startY);
    if (moved < 6) { // a tap on the handle cycles snap points
      tapAt.current = performance.now();
      cycle();
      return;
    }
    const first = d.samples[0], last = d.samples[d.samples.length - 1];
    const v = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const p = points(h);
    const projected = y.get() + project(v);
    const order: SheetSnap[] = ["full", "half", "peek"];
    const target = order.reduce((best, s) => (Math.abs(p[s] - projected) < Math.abs(p[best] - projected) ? s : best), "half" as SheetSnap);
    if (target === snap) settle(target, v);
    else onSnapChange(target);
  };

  const cycle = () => onSnapChange(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
  // Enter/Space and assistive-technology activation arrive as a click with no preceding pointer tap.
  const onHandleClick = () => {
    if (performance.now() - tapAt.current < 600) return; // already cycled by the pointer tap
    cycle();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const order: SheetSnap[] = ["peek", "half", "full"];
    const i = order.indexOf(snap);
    if (e.key === "ArrowUp" && i < 2) { e.preventDefault(); onSnapChange(order[i + 1]); }
    if (e.key === "ArrowDown" && i > 0) { e.preventDefault(); onSnapChange(order[i - 1]); }
  };

  return (
    <motion.section ref={host} aria-label={label} style={{ y }} data-occludes={occludes} data-sheet=""
      className={cx("absolute inset-x-0 top-0 z-20 flex flex-col bg-surface shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_-12px_40px_rgba(0,0,0,0.6)]", className)}
      >
      {/* Grab strip: 44 px tall (the touch minimum), the 3 px grabber centred; the whole strip drags and taps. */}
      <div className="touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <button type="button" onKeyDown={onKey} onClick={onHandleClick} aria-label={`${label}: ${snap === "full" ? "expanded" : snap === "half" ? "half open" : "collapsed"}. Press to change, arrow keys to resize.`}
          className="group mx-auto flex h-11 w-full items-center justify-center focus-visible:outline-offset-[-4px] active:bg-white/[0.03]">
          <span className="h-[3px] w-10 bg-ink/30 transition-colors group-hover:bg-ink/50 group-active:bg-ink/70 group-active:duration-0" />
        </button>
        {header}
      </div>
      <div data-sheet-scroller="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: h ? h - 64 - GRAB : undefined }}>
        {children}
      </div>
    </motion.section>
  );
}
