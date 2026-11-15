import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, glossaryDefinition, keepsTermCase, type GlossaryEntry, type GlossaryKey } from "../lib/glossary";
import { useGlossaryFacts } from "../lib/facts";
import { termPopoverPlacement, type PopoverPlacement } from "../lib/popover";
import { cx } from "./ui";

export const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

/** Uppercase section kicker. */
export function Kicker({ children, className, tone }: { children: ReactNode; className?: string; tone?: "mars" | "earth" | "faint" }) {
  return <div className={cx("kicker", tone === "mars" && "text-mars", tone === "earth" && "text-earth", className)}>{children}</div>;
}

/** Place names: condensed grotesk caps, like a mission designation. */
export function Toponym({ children, size = "md", className, as: As = "h2", ...rest }: {
  children: ReactNode; size?: "sm" | "md" | "lg"; className?: string; as?: "h1" | "h2" | "h3" | "div" | "span";
} & Record<string, unknown>) {
  return (
    <As {...rest} className={cx("toponym text-ink outline-none", size === "lg" ? "text-display" : size === "md" ? "text-toponym" : "text-toponym-sm", className)}>
      {children}
    </As>
  );
}

/** A measurement: mono value with its unit in the text face. Missing values are shown as such, never as 0. */
export function Measure({ value, unit, digits, className, missing = "—" }: {
  value: number | null | undefined; unit?: string; digits?: number; className?: string; missing?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={cx("num text-faint", className)}>{missing}</span>;
  const d = digits ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2);
  const text = value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−");
  const u = unit === "deg" ? "°" : unit === "-" ? "" : unit;
  return (
    <span className={cx("whitespace-nowrap", className)}>
      <span className="num">{text}</span>
      {u ? (u === "°" || u === "%" ? <span className="num">{u}</span> : <span className="ml-[0.18em] text-[length:max(11px,0.82em)] text-muted">{u}</span>) : null}
    </span>
  );
}

/** Key figure with label and optional basis line. */
export function Figure({ label, value, unit, digits, basis, tone, className }: {
  label: ReactNode; value: number | null | undefined; unit?: string; digits?: number; basis?: ReactNode; tone?: "mars" | "earth"; className?: string;
}) {
  return (
    <div className={className}>
      <div className="kicker text-muted">{label}</div>
      <Measure value={value} unit={unit} digits={digits} className={cx("mt-1 block text-figure", tone === "mars" && "text-mars", tone === "earth" && "text-earth")} />
      {basis && <div className="mt-1 text-caption text-faint">{basis}</div>}
    </div>
  );
}

/**
 * Open/close handlers for a term popover: hover opens only for a mouse, keyboard focus opens, and a tap
 * or click toggles. (On touch, the compat mouseenter/focus that precede the click would otherwise open
 * the popover and the click would close it again.)
 */
export function useTermTriggers(setOpen: (v: boolean | ((o: boolean) => boolean)) => void) {
  const pointer = useRef<string | null>(null);
  return {
    wrapper: {
      onPointerEnter: (e: ReactPointerEvent) => { if (e.pointerType === "mouse") setOpen(true); },
      onPointerLeave: (e: ReactPointerEvent) => { if (e.pointerType === "mouse") setOpen(false); },
    },
    button: {
      onPointerDown: (e: ReactPointerEvent) => { pointer.current = e.pointerType; },
      onClick: () => { if (pointer.current === "mouse") setOpen(true); else setOpen((o) => !o); pointer.current = null; },
      onFocus: () => { if (!pointer.current) setOpen(true); },
      onBlur: () => { pointer.current = null; setOpen(false); },
    },
  };
}

/**
 * ARIA radio-group keyboard pattern: Arrow keys and Home/End move the selection (selection follows
 * focus). Pair with `tabIndex={checked ? 0 : -1}` on each radio so the group is one Tab stop.
 */
export function radioGroupKeys<T>(values: readonly T[], current: T, select: (v: T) => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const i = Math.max(0, values.indexOf(current));
    const n = values.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    select(values[to]);
    const radios = e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]");
    radios[to]?.focus();
  };
}

/**
 * Plain label with the technical term and its definition on demand (hover, focus or tap): keeps jargon out
 * of primary text without deleting it. The popover is
 * rendered in a portal at a fixed position (lib/popover.ts): a scrolling panel, the phone sheet or a clipped
 * strip can never cut it, it opens below the term when there is no room above, and it stays inside the
 * viewport. It follows the term while the page or a panel scrolls.
 */
export function Term({ k, children, className }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const g: GlossaryEntry = GLOSSARY[k];
  // Counts and grid facts in a definition come from the payloads, filled in at render time.
  const facts = useGlossaryFacts();
  const [open, setOpen] = useState(false);
  const triggers = useTermTriggers(setOpen);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<PopoverPlacement | null>(null);
  const place = useCallback(() => {
    const t = trigger.current?.getBoundingClientRect();
    const p = pop.current;
    if (!t || !p) return;
    const next = termPopoverPlacement(t, { w: p.offsetWidth, h: p.offsetHeight }, { w: document.documentElement.clientWidth, h: window.innerHeight });
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.below === next.below ? prev : next));
  }, []);
  useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!trigger.current?.contains(n) && !pop.current?.contains(n)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);
  return (
    <span className={cx("relative inline", className)} {...triggers.wrapper}>
      <button ref={trigger} type="button" aria-describedby={open ? id : undefined} aria-expanded={open} {...triggers.button}
        className="term-hit cursor-help underline decoration-faint/70 decoration-dotted underline-offset-[3px] hover:decoration-ink active:text-ink/70 active:decoration-ink">
        {children ?? g.label}
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.span ref={pop} id={id} role="tooltip"
              initial={{ opacity: 0, y: pos?.below ? -4 : 4 }} animate={{ opacity: pos ? 1 : 0, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
              className="no-print surface-solid frame z-[60] block w-[min(320px,calc(100vw-24px))] whitespace-normal rounded-control p-3 text-left font-sans text-caption font-normal normal-case tracking-normal text-muted [--frame-l:8px]">
              {/* Caps like every label, except terms with Greek symbols, which stay as written (ρ, κ). */}
              <span className={cx("mb-1.5 block text-ink", keepsTermCase(g.term) ? "text-label font-semibold" : "label-caps")}>{g.term}</span>
              {glossaryDefinition(k, facts)}
              {g.source ? <span className="mt-1.5 block font-mono text-[11px] text-faint">{g.source}</span> : null}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}

export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="hit label-caps -mx-1 inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-muted hover:text-ink active:text-ink/70 active:duration-0">
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        {summary}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Small square status tag: hairline border, mono caps. One per object at most; status uses glyph + word, never colour alone. */
export function Tag({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "mars" | "earth" | "warn" | "bad"; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-control border px-1.5 py-[3px] font-mono text-[10.5px] uppercase leading-none tracking-[0.06em]",
      tone === "neutral" && "border-line-strong text-muted", tone === "mars" && "border-mars/45 text-mars", tone === "earth" && "border-earth/45 text-earth",
      tone === "warn" && "border-warn/45 text-warn", tone === "bad" && "border-bad/45 text-bad", className)}>
      {children}
    </span>
  );
}

export function IconButton({ label, children, onClick, className, disabled, pressed }: { label: string; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={cx("hit inline-grid h-9 w-9 place-items-center rounded-control text-muted transition-[color,background] duration-150 hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12] active:duration-0 disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

/**
 * Underline tabs for switching views inside a surface: uppercase labels, 1 px ink rule under the selected one.
 * ARIA tabs pattern: one Tab stop (the selected tab), arrows and Home/End move between enabled tabs and
 * select them (automatic activation). `panelId` names the tab panel the tabs control (aria-controls).
 */
export function Tabs<T extends string>({ value, options, onChange, ariaLabel, className, panelId }: { value: T; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; ariaLabel: string; className?: string; panelId?: string }) {
  const base = useId();
  const enabled = options.filter((o) => !o.disabled);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = Math.max(0, enabled.findIndex((o) => o.value === value));
    const n = enabled.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0 || !n) return;
    e.preventDefault();
    onChange(enabled[to].value);
    e.currentTarget.querySelectorAll<HTMLElement>("[role=tab]:not(:disabled)")[to]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cx("flex gap-5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" id={`${base}-${o.value}`} aria-selected={on} aria-controls={on ? panelId : undefined}
            tabIndex={on ? 0 : -1} disabled={o.disabled} onClick={() => onChange(o.value)}
            className={cx("hit label-caps relative py-2 transition-colors active:duration-0 disabled:opacity-40", on ? "text-ink" : "text-faint hover:text-ink active:text-ink/70")}>
            {o.label}
            {on && <motion.span layoutId={`tab-${ariaLabel}`} transition={SPRING} className="absolute inset-x-0 -bottom-px h-px bg-ink" />}
          </button>
        );
      })}
    </div>
  );
}

/** Availability marks: filled square = available, outlined square = not connected. Always paired with words. */
export function Dots({ items, className }: { items: { label: string; on: boolean; note?: string }[]; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-caption">
          <span aria-hidden className={cx("h-1.5 w-1.5", i.on ? "bg-ink" : "ring-1 ring-inset ring-faint")} />
          <span className={i.on ? "text-ink" : "text-faint"}>{i.label}</span>
          {i.note && <span className="num text-num-sm text-muted">{i.note}</span>}
          <span className="sr-only">{i.on ? "available" : "not connected"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Content regions shared by desktop surfaces and the phone sheet. */
export function PanelHeader({ children, onClose, className }: { children: ReactNode; onClose?: () => void; className?: string }) {
  return (
    <div className={cx("relative shrink-0 px-5 pb-3 pt-5", className)}>
      {children}
      {onClose && <IconButton label="Close" onClick={onClose} className="absolute right-3 top-3"><X className="h-4 w-4" /></IconButton>}
    </div>
  );
}
/**
 * In the landscape-phone side sheet (`.side-sheet`, App.tsx) the whole panel scrolls as one column: the
 * header scrolls away with the body and only the footer command stays docked at the foot.
 */
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("scroll-thin fade-edges min-h-0 flex-1 overflow-y-auto px-5 py-2 [.side-sheet_&]:flex-none [.side-sheet_&]:overflow-visible [.side-sheet_&]:[mask-image:none]", className)}>{children}</div>;
}
export function PanelFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("shrink-0 bg-surface px-5 pb-5 pt-3 [padding-bottom:max(20px,env(safe-area-inset-bottom))] [.side-sheet_&]:sticky [.side-sheet_&]:bottom-0 [.side-sheet_&]:z-10 [.side-sheet_&]:pb-3", className)}>{children}</div>;
}

/** A titled block inside a panel body: caps title followed by a hairline rule. */
export function Block({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("py-3.5", className)}>
      {(title || aside) && (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          {title && <h3 className="kicker rule-after min-w-0 flex-1 text-ink/80">{title}</h3>}
          {aside && <div className="text-caption text-faint">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
