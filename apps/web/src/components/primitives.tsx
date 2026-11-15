import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "../lib/glossary";
import { cx } from "./ui";

export const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

/** Uppercase section kicker — the only all-caps tier in the system. */
export function Kicker({ children, className, tone }: { children: ReactNode; className?: string; tone?: "mars" | "earth" | "faint" }) {
  return <div className={cx("kicker", tone === "mars" && "!text-mars", tone === "earth" && "!text-earth", className)}>{children}</div>;
}

/** Place names, set like a map plate. */
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
      {u ? (u === "°" || u === "%" ? <span className="num">{u}</span> : <span className="ml-[0.18em] text-[0.82em] text-muted">{u}</span>) : null}
    </span>
  );
}

/** Key figure with label and optional basis line. */
export function Figure({ label, value, unit, digits, basis, tone, className }: {
  label: ReactNode; value: number | null | undefined; unit?: string; digits?: number; basis?: ReactNode; tone?: "mars" | "earth"; className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-caption text-muted">{label}</div>
      <Measure value={value} unit={unit} digits={digits} className={cx("mt-0.5 block text-figure", tone === "mars" && "text-mars", tone === "earth" && "text-earth")} />
      {basis && <div className="mt-1 text-caption text-faint">{basis}</div>}
    </div>
  );
}

/**
 * Plain label with the technical term and definition on demand (hover, focus or tap).
 * Keeps jargon out of primary text without deleting it.
 */
export function Term({ k, children, className }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const g = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <span ref={ref} className={cx("relative inline", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="cursor-help underline decoration-faint/60 decoration-dotted underline-offset-[3px] hover:decoration-ink">
        {children ?? g.label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span id={id} role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.14 }}
            className="surface-solid absolute bottom-[calc(100%+8px)] left-0 z-50 block w-[min(320px,80vw)] rounded-[10px] p-3 text-left text-caption font-normal normal-case tracking-normal text-muted">
            <span className="mb-1 block text-label text-ink">{g.term}</span>
            {g.definition}
            {"source" in g && g.source ? <span className="mt-1.5 block font-mono text-[11px] text-faint">{g.source}</span> : null}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="hit -mx-1 inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-label text-muted hover:text-ink">
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

/** Small neutral tag. One per object at most; status uses glyph + word, never colour alone. */
export function Tag({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "mars" | "earth" | "warn" | "bad"; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-caption leading-none",
      tone === "neutral" && "bg-elevated text-muted", tone === "mars" && "bg-mars/12 text-mars", tone === "earth" && "bg-earth/12 text-earth",
      tone === "warn" && "bg-warn/12 text-warn", tone === "bad" && "bg-bad/12 text-bad", className)}>
      {children}
    </span>
  );
}

export function IconButton({ label, children, onClick, className, disabled, pressed }: { label: string; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={cx("hit inline-grid h-9 w-9 place-items-center rounded-control text-muted transition-[color,background,transform] duration-150 hover:bg-elevated hover:text-ink active:scale-[0.97] active:duration-75 disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

/** Underline tabs for switching views inside a surface. */
export function Tabs<T extends string>({ value, options, onChange, ariaLabel, className }: { value: T; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; ariaLabel: string; className?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx("flex gap-5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={on} disabled={o.disabled} onClick={() => onChange(o.value)}
            className={cx("hit relative py-2 text-label transition-colors disabled:opacity-40", on ? "text-ink" : "text-muted hover:text-ink")}>
            {o.label}
            {on && <motion.span layoutId={`tab-${ariaLabel}`} transition={SPRING} className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" />}
          </button>
        );
      })}
    </div>
  );
}

/** Availability dots: filled = available, hollow = not connected. Always paired with words. */
export function Dots({ items, className }: { items: { label: string; on: boolean; note?: string }[]; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-caption">
          <span aria-hidden className={cx("h-2 w-2 rounded-full", i.on ? "bg-ink" : "ring-1 ring-inset ring-faint")} />
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
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("scroll-thin fade-edges min-h-0 flex-1 overflow-y-auto px-5 py-2", className)}>{children}</div>;
}
export function PanelFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("shrink-0 px-5 pb-5 pt-3 [padding-bottom:max(20px,env(safe-area-inset-bottom))]", className)}>{children}</div>;
}

/** Grouping by space, not borders: a titled block inside a panel body. */
export function Block({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("py-3.5", className)}>
      {(title || aside) && (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          {title && <h3 className="text-label text-ink">{title}</h3>}
          {aside && <div className="text-caption text-faint">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
