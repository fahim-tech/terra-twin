import type { ReactNode } from "react";
import { StatusMark } from "../../components/marks";
import { cx } from "../../components/ui";
import { formatKm } from "./zones";

/** Numbered section title: "01  MISSION" (the index is decorative; the words carry the meaning). */
export function SectionTitle({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-baseline">
      <span aria-hidden className="num mr-3 text-[11px] font-medium tracking-[0.04em] text-faint">{String(n).padStart(2, "0")}</span>
      {children}
    </span>
  );
}

/**
 * A numbered panel section, "02  TERRAIN ─────── aside". Like the shared Block, but its rule is a
 * line-strong hairline: plain `line` all but vanishes on the panel glass over bright Mars imagery (the
 * Earth results panel draws its section rules the same way).
 */
export function Section({ n, title, aside, children, className }: { n: number; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("py-3.5", className)}>
      <div className="mb-2.5 flex items-center gap-3">
        <h3 className="kicker flex min-w-0 flex-1 items-center gap-3 !text-ink/80 after:h-px after:min-w-4 after:flex-1 after:bg-line-strong after:content-['']">
          <SectionTitle n={n}>{title}</SectionTitle>
        </h3>
        {aside && <span className="shrink-0 text-caption text-faint">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Square status mark (the shared set, components/marks.tsx): filled = on, outlined = off; `mars` where it
 * marks Mars data. Decorative — the words beside it (or a legend) always carry the state too.
 */
export function Mark({ on, tone = "ink", className }: { on: boolean; tone?: "ink" | "mars" | "faint"; className?: string }) {
  return <StatusMark state={on ? "on" : "off"} tone={tone === "mars" ? "mars" : undefined} className={className} />;
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

/** Distance with a mono figure and a text-face unit, kept on one line (e.g. great-circle km to a zone centre). */
export function KmFigure({ km }: { km: number }) {
  const [v, u] = formatKm(km).split(" ");
  return <span className="whitespace-nowrap"><span className="num">{v}</span> {u}</span>;
}
