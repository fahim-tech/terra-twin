import { motion } from "motion/react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { SPRING } from "../../components/primitives";
import { cx } from "../../components/ui";
import type { DossierSection } from "./model";
import { pickActive, scrollParent } from "./scrollspy";

/**
 * Tracks the section being read (by its heading crossing a reading line a quarter of the way down the
 * scroll viewport) and jumps to a section: scrolls it in and moves focus to its heading.
 */
export function useDossierNav(sections: DossierSection[], rootRef: RefObject<HTMLElement | null>): [string | null, (id: string) => void] {
  const key = sections.map((s) => s.id).join("|");
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const host = scrollParent(rootRef.current);
    if (!host) return;
    const ids = key.split("|");
    let raf = 0;
    const measure = () => {
      raf = 0;
      const top = host.getBoundingClientRect().top;
      const tops = ids.map((id) => (document.getElementById(`dossier-${id}-h`)?.getBoundingClientRect().top ?? Infinity) - top);
      const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 4;
      const i = pickActive(tops, host.clientHeight * 0.25, atEnd);
      if (i >= 0) setActive(ids[i]);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    host.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      host.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [key, rootRef]);

  const jump = useCallback((id: string) => {
    const section = document.getElementById(`dossier-${id}`);
    if (!section) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById(`dossier-${id}-h`)?.focus({ preventScroll: true });
  }, []);

  return [active, jump];
}

/** Sticky section index beside the dossier on wide screens: numbered entries, the current one marked. */
export function DossierIndex({ sections, active, onJump, className }: {
  sections: DossierSection[]; active: string | null; onJump: (id: string) => void; className?: string;
}) {
  return (
    <nav aria-label="Dossier sections" className={cx("no-print", className)}>
      <div className="kicker !text-muted">Dossier index</div>
      <ol className="mt-3 border-l border-line">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="relative">
              {on && <motion.span layoutId="dossier-index-mark" transition={SPRING} aria-hidden className="absolute -left-px inset-y-0 w-px bg-ink" />}
              <button type="button" onClick={() => onJump(s.id)} aria-current={on ? "location" : undefined}
                className={cx("hit flex w-full items-baseline gap-3 py-[7px] pl-3.5 pr-1 text-left transition-colors duration-150",
                  on ? "text-ink" : "text-faint hover:text-ink")}>
                <span className="num text-num-sm">{s.index}</span>
                <span className="text-[11px] font-semibold uppercase leading-[1.25] tracking-[0.12em]">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
