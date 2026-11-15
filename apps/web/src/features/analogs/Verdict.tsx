import { DECISION_WORDS, OutcomeMark, type OutcomeKind, outcomeKind } from "../../components/marks";
import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { decisionG5Label, type GlossaryKey } from "../../lib/glossary";
import type { Tier2Result } from "../../types/contracts";
import { StatusMark } from "./instruments";

type DecisionType = Tier2Result["decision"]["type"];

const copy = (type: DecisionType, term: GlossaryKey | null) => ({ title: DECISION_WORDS[type], mark: outcomeKind(type), term });

/**
 * Plain decision names (glossary §13) with their outcome mark (components/marks.tsx); the research term
 * stays on demand via <Term>. Every outcome is ink: a tie is a valid outcome, not a caution, and an
 * abstention is a result, not a fault.
 */
export const DECISION_COPY: Record<DecisionType, { title: string; mark: OutcomeKind; term: GlossaryKey | null }> = {
  named_leader: copy("named_leader", "stableLeader"),
  tied_set: copy("tied_set", "tie"),
  no_convincing_analog: copy("no_convincing_analog", null),
  insufficient_evidence: copy("insufficient_evidence", "notEnough"),
};

/** The research label for a decision: G5 verbatim for leader and tie (shared helper). */
export function decisionLabel(t2: Tier2Result): string | null {
  return decisionG5Label(t2.decision);
}

/**
 * One small square per orientation of the Earth window relative to the MOLA tracks. Filled = the leader
 * held in that orientation. Only a stable leader fills them: the research record states a tie as "not
 * determined", so its squares stay hollow rather than guessing which held. `compact` prints the count only
 * (the full sentence stays in the accessible text).
 */
export function RotationGlyph({ t2, className, compact }: { t2: Tier2Result; className?: string; compact?: boolean }) {
  const n = t2.decision.rotations_checked;
  if (!n) return null;
  const stable = t2.decision.type === "named_leader";
  const text = stable ? `Leader held in all ${n} orientations` : `${n} orientations checked · leader not determined`;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-2", className)} title={compact ? text : undefined}>
      <span aria-hidden className="grid grid-cols-2 gap-[2px]">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={cx("h-[5px] w-[5px]", stable ? "bg-ink" : "ring-1 ring-inset ring-muted")} />
        ))}
      </span>
      {compact
        ? <><span aria-hidden className="num text-num-sm uppercase text-muted">{stable ? `${n}/${n} held` : `${n} checked`}</span><span className="sr-only">{text}</span></>
        : <span className="text-caption text-muted">{text}</span>}
    </span>
  );
}

/**
 * Annunciator row of a decision: outcome mark, decision name (research term on demand), orientation check.
 * Every decision lights the row the same quiet way: none of them is a caution or a fault.
 */
export function DecisionHead({ t2, id, as: As = "h4" }: { t2: Tier2Result; id?: string; as?: "h3" | "h4" | "div" }) {
  const d = t2.decision;
  const c = DECISION_COPY[d.type];
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 bg-white/[0.035] px-3 py-2 max-md:min-h-9 max-md:py-1.5">
      <As id={id} className="label-caps flex min-w-0 items-center gap-2.5 text-ink [&_button]:text-left [&_button]:uppercase">
        <OutcomeMark kind={c.mark} />
        <span className="min-w-0">
          {c.term ? <Term k={c.term}>{c.title}</Term> : c.title}
          {d.type === "tied_set" && <span className="text-muted"> · {d.members.length}<span className="max-md:sr-only"> equivalent</span> windows</span>}
        </span>
      </As>
      {/* Phones drop the column heads, so a tie says its listing order here, always above its members. */}
      {d.type === "tied_set" && <span className="kicker shrink-0 !text-ink/80 md:hidden">Unordered · W → E</span>}
      <RotationGlyph t2={t2} compact className={d.type === "tied_set" ? "max-md:hidden" : undefined} />
    </div>
  );
}

/** Compact decision summary, kept for other views (comparison, report) that embed it. */
export function DecisionBlock({ t2 }: { t2: Tier2Result }) {
  const label = decisionLabel(t2);
  return (
    <div className="border border-line-strong">
      <DecisionHead t2={t2} as="div" />
      {label && <p className="border-t border-line px-3 py-2.5 text-caption text-muted">{label}</p>}
      <div className="border-t border-line px-3 py-2"><OperatorStatus t2={t2} /></div>
    </div>
  );
}

/**
 * Operator status (G5: no S without it). When the MOLA observation model is missing there is no research
 * score at all, and the uncorrected comparison is never substituted. A missing model is a gap in the
 * inputs (struck: not available), not a fault of the instrument.
 */
export function OperatorStatus({ t2, className }: { t2: Tier2Result; className?: string }) {
  const ok = t2.operator.status === "ok";
  return (
    <p className={cx("flex items-center gap-2 text-caption", ok ? "text-ink/90" : "text-ink", className)}>
      <StatusMark state={ok ? "on" : "struck"} />
      <span><Term k="operator">MOLA observation model</Term> {ok ? "applied" : "unavailable · no score shown"}</span>
    </p>
  );
}
