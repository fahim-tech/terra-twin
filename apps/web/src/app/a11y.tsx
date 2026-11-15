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
    // The control that started the stage change (a rail command, a footer button) or <body>: focus moves to
    // the heading only from one of these, never away from something the user has moved to since.
    const trigger = document.activeElement;
    const allowed = () => {
      const a = document.activeElement;
      return !a || a === document.body || a === trigger || !a.isConnected;
    };
    // A modal opened with the stage change (the comparison brief) owns focus; the stage heading sits behind it.
    const modalOpen = () => useApp.getState().whyOpen || !!document.querySelector('[aria-modal="true"]');
    let done = false;
    const attempt = () => {
      if (done) return true;
      const el = document.querySelector<HTMLElement>(`[data-stage-heading="${stage}"]`);
      if (!el) return false;
      done = true;
      if (modalOpen() || !allowed()) return true;
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      return true;
    };
    // Lazy stages (Evidence, Report) mount when their chunk arrives, which on a slow network can take
    // seconds: wait for the heading to appear (capped at 10 s) instead of a fixed retry window.
    const t = window.setTimeout(() => {
      if (attempt()) return;
      mo.observe(document.body, { childList: true, subtree: true });
    }, 60);
    const mo = new MutationObserver(() => { if (attempt()) mo.disconnect(); });
    const cap = window.setTimeout(() => mo.disconnect(), 10_000);
    return () => { clearTimeout(t); clearTimeout(cap); mo.disconnect(); done = true; };
  }, [stage, introOpen]);
}
