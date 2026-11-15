import { useEffect } from "react";
import type { Planet } from "../globes/protocol";
import { useGlobeBus } from "./globeBus";
import { useGlobes } from "../store/globes";

export interface Insets { top: number; right: number; bottom: number; left: number }

/**
 * Compute how much of a globe frame is covered along each edge by shell UI.
 * Elements opt in with data-occludes="mars" | "earth" | "both". A rect is assigned to the edge it
 * hugs, by proportional coverage: a rect that covers more of the frame's height than of its width is a
 * side panel (left/right), the opposite is a top/bottom strip. A full-height panel on a portrait tablet
 * (380 px of a 768 px frame) is therefore a side inset, not a top inset covering the whole frame.
 * No single inset may take more than 60 % of the frame along its axis, so the globe keeps a free area.
 */
export function computeInsets(frame: DOMRect, occluders: DOMRect[]): Insets {
  const out: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const maxX = frame.width * 0.6, maxY = frame.height * 0.6;
  for (const r of occluders) {
    const ix = Math.min(r.right, frame.right) - Math.max(r.left, frame.left);
    const iy = Math.min(r.bottom, frame.bottom) - Math.max(r.top, frame.top);
    if (ix <= 0 || iy <= 0) continue;
    const fx = ix / frame.width, fy = iy / frame.height;
    const tall = fy >= 0.45;
    const wide = fx >= 0.45;
    const leftGap = r.left - frame.left, rightGap = frame.right - r.right;
    const topGap = r.top - frame.top, bottomGap = frame.bottom - r.bottom;
    if (tall && (!wide || fy >= fx)) {
      if (leftGap <= rightGap) out.left = Math.max(out.left, Math.min(maxX, r.right - frame.left));
      else out.right = Math.max(out.right, Math.min(maxX, frame.right - r.left));
    } else if (wide) {
      if (topGap <= bottomGap) out.top = Math.max(out.top, Math.min(maxY, r.bottom - frame.top));
      else out.bottom = Math.max(out.bottom, Math.min(maxY, frame.bottom - r.top));
    }
  }
  return {
    top: Math.round(out.top), right: Math.round(out.right),
    bottom: Math.round(out.bottom), left: Math.round(out.left),
  };
}

/**
 * A frame's border box in viewport coordinates without its own CSS translate. The Mars frame glides back
 * from the intro pose (App.tsx) over 600 ms; framing must aim at where the frame comes to rest, not at a
 * position halfway through that glide (e.g. "Start with Jezero" closes the intro and flies at once).
 */
function restingRect(el: HTMLElement): DOMRect {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return el.getBoundingClientRect();
  const p = parent.getBoundingClientRect();
  return new DOMRect(p.left + parent.clientLeft + el.offsetLeft, p.top + parent.clientTop + el.offsetTop, el.offsetWidth, el.offsetHeight);
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
          const el = frames[planet].current;
          const frame = el ? restingRect(el) : null;
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
