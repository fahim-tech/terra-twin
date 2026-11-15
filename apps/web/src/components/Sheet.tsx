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
}

/**
 * Mobile bottom sheet. Tracks the finger 1:1 (respecting the grab offset), hands the release velocity
 * to a critically damped spring, projects momentum to choose the snap point, and rubber-bands at the
 * ends. The handle is also a button: tap or Enter cycles snap points; arrow keys move between them.
 */
export function Sheet({ children, label, snap, onSnapChange, peek = 112, header, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const y = useMotionValue(10_000);
  const reduced = useReducedMotion();
  const drag = useRef<{ startY: number; startOffset: number; samples: { t: number; y: number }[] } | null>(null);

  const points = useCallback((height: number) => ({ full: 64, half: Math.round(height * 0.48), peek: Math.max(0, height - peek) }), [peek]);

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
    if (reduced) { y.set(to); return; }
    // Critically damped by default; a little bounce only when a flick carried momentum.
    animate(y, to, { type: "spring", bounce: Math.abs(velocity) > 900 ? 0.12 : 0, duration: 0.38, velocity });
  }, [h, points, reduced, y]);

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
      onSnapChange(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
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

  const onKey = (e: React.KeyboardEvent) => {
    const order: SheetSnap[] = ["peek", "half", "full"];
    const i = order.indexOf(snap);
    if (e.key === "ArrowUp" && i < 2) { e.preventDefault(); onSnapChange(order[i + 1]); }
    if (e.key === "ArrowDown" && i > 0) { e.preventDefault(); onSnapChange(order[i - 1]); }
  };

  return (
    <motion.section ref={host} aria-label={label} style={{ y }}
      className={cx("absolute inset-x-0 top-0 z-20 flex flex-col rounded-t-[18px] border-t border-line/70 bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.45)]", className)}
      >
      <div className="touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <button type="button" onKeyDown={onKey} aria-label={`${label}: ${snap === "full" ? "expanded" : snap === "half" ? "half open" : "collapsed"}. Press to change, arrow keys to resize.`}
          className="mx-auto flex h-6 w-full items-center justify-center focus-visible:outline-offset-[-4px]">
          <span className="h-1 w-9 rounded-full bg-ink/25" />
        </button>
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: h ? h - 64 - 24 : undefined }}>
        {children}
      </div>
    </motion.section>
  );
}
