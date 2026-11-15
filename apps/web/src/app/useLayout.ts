import { useSyncExternalStore } from "react";

export type Layout = "phone" | "tablet" | "desktop";

const q = (w: number) => (w < 768 ? "phone" : w < 1200 ? "tablet" : "desktop") as Layout;
const subscribe = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };

/** Responsive layout class: phone < 768 ≤ tablet < 1200 ≤ desktop. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, () => q(window.innerWidth), () => "desktop");
}
