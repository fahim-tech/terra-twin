import type { ReactNode } from "react";
import { OutcomeMark, PlanetMark, PLANET_NAME, StatusMark as SharedStatusMark, type StatusKind } from "../../components/marks";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { VERDICT_MARK, type VerdictKind } from "./model";

/**
 * The comparison's instrument parts. The marks themselves are the app's shared set (components/marks.tsx),
 * re-exported here for the files that already import them from this module.
 */
export { PlanetMark, PLANET_NAME };

/**
 * Headings that the shell or a dialog focus programmatically (tabIndex −1) are not controls, so they
 * draw no focus ring. Inline, because the global :focus-visible rule is unlayered and outranks utilities.
 */
export const NO_RING = { outline: "none" } as const;

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

/** The research decision for the compared candidate, as the shared outcome mark (model.ts VERDICT_MARK). */
export function VerdictMark({ kind, size, className }: { kind: VerdictKind; size?: number; className?: string }) {
  return <OutcomeMark kind={VERDICT_MARK[kind]} size={size} className={className} />;
}

const EVALUATION_MARK: Record<"evaluated" | "partial" | "not_evaluated", StatusKind> = { evaluated: "on", partial: "partial", not_evaluated: "off" };

/** Evaluation status as the shared status mark: filled = evaluated, half filled = partial, outlined = not evaluated. */
export function StatusMark({ status, className }: { status: "evaluated" | "partial" | "not_evaluated"; className?: string }) {
  return <SharedStatusMark state={EVALUATION_MARK[status]} className={className} />;
}

/** Index as two mono digits ("02"), the panel numbering used by section rules. */
export function indexLabel(i: number): string {
  return String(i).padStart(2, "0");
}

/**
 * Section header inside a panel: index, caps title and a hairline that fills the row (`02  TERRAIN ─────  4`).
 * The hairline is line-strong, as in the Mars and Earth panels: plain line vanishes on the strip's glass.
 */
export function SectionRule({ index, title, aside, as: As = "h3", id, className, titleClassName }: {
  index?: number; title: ReactNode; aside?: ReactNode; as?: "h2" | "h3" | "h4" | "div"; id?: string; className?: string; titleClassName?: string;
}) {
  return (
    <div className={cx("flex min-w-0 items-center gap-3", className)}>
      {index !== undefined && <span aria-hidden className="num shrink-0 text-[11px] leading-none text-faint">{indexLabel(index)}</span>}
      <As id={id} className={cx("label-caps min-w-0 text-ink", titleClassName)}>{title}</As>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-line-strong" />
      {aside !== undefined && aside !== null && <span className="shrink-0 text-caption text-faint">{aside}</span>}
    </div>
  );
}
