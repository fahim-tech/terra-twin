import { useEffect, useRef } from "react";
import { create } from "zustand";

/** Why drawer width on desktop/tablet: min(440px, stage − 24px). One source for the drawer and framing. */
export const WHY_DRAWER_MAX_PX = 440;
export const WHY_DRAWER_WIDTH_CSS = `min(${WHY_DRAWER_MAX_PX}px, calc(100% - 24px))`;
export function whyDrawerWidth(stageW: number) {
  return Math.min(WHY_DRAWER_MAX_PX, stageW - 24);
}

/** Size of the stage (the globes' container) in CSS px, measured by <StageProbe/>. */
export const useCompareStage = create<{ w: number; h: number }>(() => ({ w: 0, h: 0 }));

/**
 * An invisible box filling the stage; reports its size so the comparison's camera framing does not
 * have to query the shell's DOM.
 */
export function StageProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const cur = useCompareStage.getState();
      if (cur.w !== w || cur.h !== h) useCompareStage.setState({ w, h });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="pointer-events-none invisible absolute inset-0 -z-10" />;
}
