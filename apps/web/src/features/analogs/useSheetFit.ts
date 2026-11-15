import { type RefObject, useEffect, useState } from "react";

/**
 * Phone sheet workaround (local to this feature): the shared Sheet gives its content a fixed max-height
 * whatever the snap point, so at "half" a footer would sit below the screen edge. This measures how much
 * of the panel is actually on screen and returns that height, so header / scrolling body / footer fit
 * the visible part and the primary action stays reachable. Measures every frame only while the sheet moves.
 */
export function useSheetFit(ref: RefObject<HTMLElement>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) { setHeight(null); return; }
    let raf = 0, last = -1e9, still = 0;
    const tick = () => {
      const el = ref.current;
      if (!el) { still = 24; return; }
      const top = el.getBoundingClientRect().top;
      const bottom = el.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight;
      if (Math.abs(top - last) > 0.5) { last = top; still = 0; setHeight(Math.max(96, Math.round(bottom - top))); } else still++;
      if (still < 24) raf = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(raf); still = 0; raf = requestAnimationFrame(tick); };
    start();
    // The sheet also moves without input (opening, programmatic snaps): a slow poll catches those.
    const poll = window.setInterval(() => {
      const top = ref.current?.getBoundingClientRect().top;
      if (still >= 24 && top !== undefined && Math.abs(top - last) > 0.5) start();
    }, 250);
    const events = ["pointerup", "pointermove", "keyup", "resize", "click"] as const;
    for (const e of events) window.addEventListener(e, start, { passive: true, capture: true });
    return () => { cancelAnimationFrame(raf); window.clearInterval(poll); for (const e of events) window.removeEventListener(e, start, { capture: true }); };
  }, [enabled, ref]);
  return height;
}
