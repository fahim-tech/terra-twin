import { useEffect } from "react";
import { useGlobeEvents } from "./globeBus";
import { useApp } from "../store/app";

/** Visually hidden live regions fed by useApp().announce(). */
export function LiveRegion() {
  const a = useApp((s) => s.announcement);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{a && !a.urgent ? <span key={a.n}>{a.text}</span> : null}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{a && a.urgent ? <span key={a.n}>{a.text}</span> : null}</div>
    </>
  );
}

/**
 * One dismissal model: Escape (in the page or forwarded from a focused globe) closes the topmost
 * transient layer — drawer, then full-page view, then comparison. Menus handle their own Escape first.
 */
export function useEscapeToClose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (useApp.getState().closeTopmost()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const onGlobe = (m: { t: string }) => { if (m.t === "key") useApp.getState().closeTopmost(); };
  useGlobeEvents("mars", onGlobe as never);
  useGlobeEvents("earth", onGlobe as never);
}

/**
 * Move keyboard focus to the new stage's heading after a stage change, so screen-reader and
 * keyboard users land on the content that just appeared. Stages mark it with data-stage-heading.
 */
export function useStageFocus() {
  const stage = useApp((s) => s.stage);
  const introOpen = useApp((s) => s.introOpen);
  useEffect(() => {
    if (introOpen) return;
    // Lazy stages (evidence, report) can mount well after the change, so retry for about a second.
    let tries = 0;
    let t = 0;
    const attempt = () => {
      const el = document.querySelector<HTMLElement>(`[data-stage-heading="${stage}"]`);
      if (el) { if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); return; }
      if (++tries < 20) t = window.setTimeout(attempt, 60);
    };
    t = window.setTimeout(attempt, 60);
    return () => clearTimeout(t);
  }, [stage, introOpen]);
}
