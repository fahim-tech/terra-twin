import { useEffect, useState, type RefObject } from "react";

/** Where the reader's eye is, as a fraction of the scroll viewport's height from its top edge. */
export const READING_LINE = 0.3;

/**
 * The section being read: the last one (in document order) whose top edge has crossed the reading
 * line. Nothing is active above the first section. At the end of the scroll the last section is
 * active, because a short final section can never reach the line.
 */
export function activeSection<T extends string>(sections: readonly { id: T; top: number }[], line: number, atEnd = false): T | null {
  if (!sections.length) return null;
  const ordered = [...sections].sort((a, b) => a.top - b.top);
  if (atEnd) return ordered[ordered.length - 1].id;
  let current: T | null = null;
  for (const s of ordered) {
    if (s.top <= line) current = s.id;
    else break;
  }
  return current;
}

/** The nearest ancestor that scrolls vertically (the full-page stage), or null for the window. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return p;
  }
  return null;
}

/**
 * Scroll-spy for in-page navigation. Measures the sections on scroll (once per frame), on resize and
 * whenever the page content changes height (disclosures, late data).
 */
export function useScrollSpy<T extends string>(ids: readonly T[], anchor: RefObject<HTMLElement>, enabled = true): T | null {
  const [active, setActive] = useState<T | null>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!enabled || !el) return;
    const scroller = scrollParent(el);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      const height = scroller ? scroller.clientHeight : window.innerHeight;
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
      const scrollHeight = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
      const boxes = ids.flatMap((id) => {
        const s = document.getElementById(id);
        return s ? [{ id, top: s.getBoundingClientRect().top - top0 }] : [];
      });
      const atEnd = scrollTop > 0 && scrollTop + height >= scrollHeight - 2;
      const next = activeSection(boxes, height * READING_LINE, atEnd);
      setActive((prev) => (prev === next ? prev : next));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    measure();
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids, anchor, enabled]);
  return active;
}
