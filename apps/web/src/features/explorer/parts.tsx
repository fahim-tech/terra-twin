import type { ReactNode } from "react";
import { cx } from "../../components/ui";

/** Numbered section title for a `Block`: "01  TERRAIN" (the Block draws the hairline after it). */
export function SectionTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-baseline">
      <span aria-hidden className="num mr-3 text-[10.5px] font-medium tracking-[0.04em] text-faint">{String(n).padStart(2, "0")}</span>
      {children}
    </span>
  );
}

/**
 * Square status mark: filled = on, outlined = off. Decorative — the words beside it (or a legend)
 * always carry the state too.
 */
export function Mark({ on, tone = "ink", className }: { on: boolean; tone?: "ink" | "mars" | "faint"; className?: string }) {
  const fill = tone === "mars" ? "bg-mars" : tone === "faint" ? "bg-faint" : "bg-ink";
  const ring = tone === "mars" ? "ring-mars" : "ring-faint";
  return <span aria-hidden className={cx("inline-block h-1.5 w-1.5 shrink-0", on ? fill : cx("ring-1 ring-inset", ring), className)} />;
}

/** Caps micro label and a mono value, e.g. LAT 17.676° N. */
export function Readout({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <span className="kicker">{label}</span>
      <span className="num text-num text-ink/90">{children}</span>
    </span>
  );
}

/** Square key cap for keyboard hints. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cx("inline-grid h-[18px] min-w-[18px] place-items-center px-1 font-mono text-[10.5px] leading-none text-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)]", className)}>
      {children}
    </kbd>
  );
}
