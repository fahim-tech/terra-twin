import type { ReactNode } from "react";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import type { VerdictKind } from "./model";

/**
 * Small square marks of the comparison's instrument language. Colour and shape are signal only and
 * always sit beside words; nothing here is a rounded pill or a round status dot.
 */

export const PLANET_NAME: Record<Planet, string> = { mars: "Mars", earth: "Earth" };

/**
 * Headings that the shell or a dialog focus programmatically (tabIndex −1) are not controls, so they
 * draw no focus ring. Inline, because the global :focus-visible rule is unlayered and outranks utilities.
 */
export const NO_RING = { outline: "none" } as const;

/** Planet identity: a 6 px square in the planet colour. */
export function PlanetMark({ planet, className }: { planet: Planet; className?: string }) {
  return <span aria-hidden className={cx("inline-block h-1.5 w-1.5 shrink-0", planet === "mars" ? "bg-mars" : "bg-earth", className)} />;
}

/**
 * "■ MARS · TARGET": planet kicker with an optional role, uppercase and tracked. Never wider than its
 * cell: the role truncates, or gives way entirely where `roleClassName` hides it (narrow cells).
 */
export function PlanetLabel({ planet, role, className, roleClassName, hidden }: { planet: Planet; role?: ReactNode; className?: string; roleClassName?: string; hidden?: boolean }) {
  return (
    <span aria-hidden={hidden || undefined} className={cx("kicker inline-flex min-w-0 max-w-full items-center gap-2", className)}>
      <PlanetMark planet={planet} />
      <span className="shrink-0 text-ink/85">{PLANET_NAME[planet]}</span>
      {role && (
        <span className={cx("inline-flex min-w-0 items-center gap-2", roleClassName)}>
          <span aria-hidden className="h-px w-2.5 shrink-0 bg-line-strong" />
          <span className="min-w-0 truncate">{role}</span>
        </span>
      )}
    </span>
  );
}

/**
 * The research decision as a square mark beside its words: filled = stable leader, square in a square =
 * member of a tie, outline = screening cell, dash = no decision.
 */
export function VerdictMark({ kind, className }: { kind: VerdictKind; className?: string }) {
  if (kind === "leader") return <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 bg-ink", className)} />;
  if (kind === "tie_member") {
    return (
      <span aria-hidden className={cx("inline-grid h-2 w-2 shrink-0 place-items-center ring-1 ring-inset ring-ink", className)}>
        <span className="h-[3px] w-[3px] bg-ink" />
      </span>
    );
  }
  if (kind === "screening") return <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 ring-1 ring-inset ring-muted", className)} />;
  return <span aria-hidden className={cx("inline-block h-px w-2 shrink-0 bg-muted", className)} />;
}

/** Evaluation status: filled square = evaluated, half-filled = partial, outline = not evaluated. */
export function StatusMark({ status, className }: { status: "evaluated" | "partial" | "not_evaluated"; className?: string }) {
  if (status === "evaluated") return <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 bg-ink", className)} />;
  if (status === "partial") {
    return (
      <span aria-hidden className={cx("inline-flex h-2 w-2 shrink-0 ring-1 ring-inset ring-warn", className)}>
        <span className="h-full w-1/2 bg-warn" />
      </span>
    );
  }
  return <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 ring-1 ring-inset ring-faint", className)} />;
}

/** Index as two mono digits ("02"), the panel numbering used by section rules. */
export function indexLabel(i: number): string {
  return String(i).padStart(2, "0");
}

/** Section header inside a panel: index, caps title and a hairline that fills the row (`02  TERRAIN ─────  4`). */
export function SectionRule({ index, title, aside, as: As = "h3", id, className, titleClassName }: {
  index?: number; title: ReactNode; aside?: ReactNode; as?: "h2" | "h3" | "h4" | "div"; id?: string; className?: string; titleClassName?: string;
}) {
  return (
    <div className={cx("flex min-w-0 items-center gap-3", className)}>
      {index !== undefined && <span aria-hidden className="num shrink-0 text-[11px] leading-none text-faint">{indexLabel(index)}</span>}
      <As id={id} className={cx("label-caps min-w-0 text-ink", titleClassName)}>{title}</As>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-line" />
      {aside !== undefined && aside !== null && <span className="shrink-0 text-caption text-faint">{aside}</span>}
    </div>
  );
}
