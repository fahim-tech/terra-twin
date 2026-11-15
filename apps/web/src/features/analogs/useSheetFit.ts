import { type RefObject, useEffect, useState } from "react";

const THRESHOLDS = Array.from({ length: 51 }, (_, i) => i / 50);

/**
 * Phone sheet workaround (local to this feature): the shared Sheet gives its content a fixed max-height
 * whatever the snap point, so at "half" a footer would sit below the screen edge. This returns the height of
 * the part of the sheet's content box that is actually on screen, so header / scrolling body / footer fit the
 * visible part and the primary action stays reachable.
 *
 * An IntersectionObserver on the sheet's content box (the panel's parent, whose size this hook never changes)
 * reports every 2 % change of its visible part as the sheet moves; each report runs a short rAF settle loop
 * for the exact value. No global listeners, no polling.
 * TODO(shared): remove once the Sheet sizes its content to the current snap point.
 */
export function useSheetFit(ref: RefObject<HTMLElement>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!enabled || !el || !box || typeof IntersectionObserver === "undefined") { setHeight(null); return; }
    let raf = 0, last = -1e9, still = 0;
    const tick = () => {
      const top = el.getBoundingClientRect().top;
      const bottom = el.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight;
      if (Math.abs(top - last) > 0.5) { last = top; still = 0; setHeight(Math.max(96, Math.round(bottom - top))); } else still++;
      if (still < 12) raf = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(raf); still = 0; raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(start, { threshold: THRESHOLDS });
    io.observe(box);
    window.addEventListener("resize", start, { passive: true });
    start();
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", start); };
  }, [enabled, ref]);
  return height;
}
