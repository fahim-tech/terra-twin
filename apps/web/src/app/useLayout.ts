import { useSyncExternalStore } from "react";

export type Layout = "phone" | "tablet" | "desktop";

/**
 * Layout class from both axes: a window under 768 px wide, or under 500 px tall (a phone held sideways),
 * is a phone; tablets run to 1200 px. Height matters because a landscape phone (844 × 390) has a tablet's
 * width but a stage too short for side panels that run its full height beside a floating navigator.
 */
export function layoutFor(w: number, h: number): Layout {
  return w < 768 || h < 500 ? "phone" : w < 1200 ? "tablet" : "desktop";
}

/** A phone held sideways: the context surface becomes a right-hand side sheet instead of a bottom sheet. */
export function isLandscapePhone(w: number, h: number): boolean {
  return h < 500 && w > h;
}

const subscribe = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };

/** Responsive layout class (see layoutFor). */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, () => layoutFor(window.innerWidth, window.innerHeight), () => "desktop");
}

export function useLandscapePhone(): boolean {
  return useSyncExternalStore(subscribe, () => isLandscapePhone(window.innerWidth, window.innerHeight), () => false);
}
