import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../components/ui";
import { useTermTriggers } from "../../components/primitives";
import { GLOSSARY, type GlossaryKey } from "../../lib/glossary";

const GAP = 8;
const MARGIN = 8;

/**
 * The shared <Term> (label with the technical term and definition on demand), with the popover
 * rendered in a portal at a fixed position. The comparison strip and its mode panels clip their
 * content (overflow hidden / scroll), which cut off the in-flow popover and with it the verbatim G5
 * strings; here the popover opens above the trigger when there is room and below it otherwise, and
 * is kept inside the viewport. Same visual and keyboard behaviour as the primitive.
 */
export function CompareTerm({ k, children, className }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const g = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const triggers = useTermTriggers(setOpen);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);

  const place = useCallback(() => {
    const t = trigger.current?.getBoundingClientRect();
    const p = pop.current;
    if (!t || !p) return;
    const w = p.offsetWidth, h = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const below = t.top - GAP - h < MARGIN && t.bottom + GAP + h <= vh - MARGIN;
    const left = Math.min(Math.max(MARGIN, t.left), Math.max(MARGIN, vw - w - MARGIN));
    const top = below ? t.bottom + GAP : Math.max(MARGIN, t.top - GAP - h);
    setPos((prev) => (prev && prev.left === left && prev.top === top && prev.below === below ? prev : { left, top, below }));
  }, []);

  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!trigger.current?.contains(n) && !pop.current?.contains(n)) setOpen(false);
    };
    // Capture phase and preventDefault, so the comparison's own Escape (collapse a mode, then leave)
    // does not also run for the same key press.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    const reflow = () => place();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open, place]);

  return (
    <span className={cx("relative inline", className)} {...triggers.wrapper}>
      <button ref={trigger} type="button" aria-describedby={open ? id : undefined} aria-expanded={open}
        {...triggers.button}
        className="cursor-help underline decoration-faint/60 decoration-dotted underline-offset-[3px] hover:decoration-ink">
        {children ?? g.label}
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.span ref={pop} id={id} role="tooltip" data-compare-term=""
              initial={{ opacity: 0, y: pos?.below ? -4 : 4 }} animate={{ opacity: pos ? 1 : 0, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
              className="surface-solid z-[60] block w-[min(320px,calc(100vw-16px))] rounded-[10px] p-3 text-left text-caption font-normal normal-case tracking-normal text-muted">
              <span className="mb-1 block text-label text-ink">{g.term}</span>
              {g.definition}
              {"source" in g && g.source ? <span className="mt-1.5 block font-mono text-[11px] text-faint">{g.source}</span> : null}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
