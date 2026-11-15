import { useEffect } from "react";
import type { Planet } from "../globes/protocol";
import { useGlobeBus } from "./globeBus";
import { useGlobes } from "../store/globes";

export interface Insets { top: number; right: number; bottom: number; left: number }

/**
 * Compute how much of a globe frame is covered along each edge by shell UI.
 * Elements opt in with data-occludes="mars" | "earth" | "both". A rect is assigned to the edge it
 * hugs: tall rects to left/right, wide rects to top/bottom.
 */
export function computeInsets(frame: DOMRect, occluders: DOMRect[]): Insets {
  const out: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const r of occluders) {
    const ix = Math.min(r.right, frame.right) - Math.max(r.left, frame.left);
    const iy = Math.min(r.bottom, frame.bottom) - Math.max(r.top, frame.top);
    if (ix <= 0 || iy <= 0) continue;
    const tall = iy >= frame.height * 0.45;
    const wide = ix >= frame.width * 0.45;
    const leftGap = r.left - frame.left, rightGap = frame.right - r.right;
    const topGap = r.top - frame.top, bottomGap = frame.bottom - r.bottom;
    if (tall && !wide) {
      if (leftGap <= rightGap) out.left = Math.max(out.left, r.right - frame.left);
      else out.right = Math.max(out.right, frame.right - r.left);
    } else if (wide) {
      if (topGap <= bottomGap) out.top = Math.max(out.top, r.bottom - frame.top);
      else out.bottom = Math.max(out.bottom, frame.bottom - r.top);
    }
  }
  return {
    top: Math.round(out.top), right: Math.round(out.right),
    bottom: Math.round(out.bottom), left: Math.round(out.left),
  };
}

/**
 * Keep both globes informed of the area their surrounding UI covers, so camera framing, the centre
 * crosshair and keyboard picks all use the visible part of the planet. Re-measures on resize and on
 * any attribute/class change in the stage (panels opening, sheets snapping, stage transitions).
 */
export function useGlobeInsets(stageEl: React.RefObject<HTMLElement>, frames: Record<Planet, React.RefObject<HTMLElement>>) {
  const bus = useGlobeBus();
  useEffect(() => {
    const root = stageEl.current;
    if (!root) return;
    let raf = 0;
    const last: Record<Planet, string> = { mars: "", earth: "" };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        for (const planet of ["mars", "earth"] as Planet[]) {
          const frame = frames[planet].current?.getBoundingClientRect();
          if (!frame || frame.width === 0) continue;
          const occ = Array.from(root.querySelectorAll<HTMLElement>(`[data-occludes="${planet}"], [data-occludes="both"]`))
            .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden" && Number(getComputedStyle(el).opacity) > 0.05)
            .map((el) => el.getBoundingClientRect());
          const ins = computeInsets(frame, occ);
          const key = JSON.stringify(ins);
          if (key !== last[planet]) {
            last[planet] = key;
            bus.send(planet, { t: "setInsets", ...ins });
            useGlobes.getState().setInsets(planet, ins);
          }
        }
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const mo = new MutationObserver(measure);
    mo.observe(root, { subtree: true, attributes: true, attributeFilter: ["class", "style", "data-occludes", "hidden"] , childList: true });
    root.addEventListener("transitionend", measure);
    measure();
    return () => { ro.disconnect(); mo.disconnect(); root.removeEventListener("transitionend", measure); cancelAnimationFrame(raf); };
  }, [bus, stageEl, frames]);
}
