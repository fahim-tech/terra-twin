import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../components/ui";

const W = 300;
const GAP = 8;

/**
 * A trigger with a definition popover (hover, focus or tap), like the shared `Term` but with arbitrary
 * content. The popover is portalled and fixed-positioned so it is never clipped by a scrolling panel
 * or the phone sheet; it flips above the trigger when there is no room below.
 */
export function InfoPopover({ trigger, children, label, className }: { trigger: ReactNode; children: ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();
  const ptr = useRef("");

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(W, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    const h = pop.current?.offsetHeight ?? 140;
    const above = r.bottom + GAP + h > window.innerHeight - 12 && r.top - GAP - h > 12;
    setPos({ left, top: above ? r.top - GAP - h : r.bottom + GAP, above });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const away = () => setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
        onPointerDown={(e) => { ptr.current = e.pointerType; }} onClick={() => { if (ptr.current === "mouse") setOpen(true); else setOpen((o) => !o); ptr.current = ""; }} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setOpen(true); }} onBlur={() => setOpen(false)}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}
        className={cx("cursor-help rounded-control text-left", className)}>
        {trigger}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.span ref={pop} id={id} role="tooltip"
              initial={{ opacity: 0, y: pos?.above ? 4 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
              onAnimationStart={place}
              style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: `min(${W}px, calc(100vw - 24px))` }}
              className="surface-solid pointer-events-none z-[60] block rounded-[10px] p-3 text-left text-caption text-muted">
              {children}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
