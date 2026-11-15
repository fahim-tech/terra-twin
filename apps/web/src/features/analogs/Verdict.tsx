import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { decisionG5Label, type GlossaryKey } from "../../lib/glossary";
import type { Tier2Result } from "../../types/contracts";
import { type MarkState, StatusMark } from "./instruments";

/**
 * Plain decision names (glossary §13) with their status mark; the research term stays on demand via <Term>.
 * `glyph` is the same mark as text, for plain-text contexts.
 */
export const DECISION_COPY: Record<Tier2Result["decision"]["type"], { title: string; tone: "ok" | "warn" | "neutral" | "bad"; mark: MarkState; glyph: string; term: GlossaryKey | null }> = {
  named_leader: { title: "Stable leader", tone: "ok", mark: "on", glyph: "■", term: "stableLeader" },
  tied_set: { title: "Tie", tone: "warn", mark: "caution", glyph: "■", term: "tie" },
  no_convincing_analog: { title: "No convincing analog", tone: "neutral", mark: "off", glyph: "□", term: null },
  insufficient_evidence: { title: "Not enough evidence", tone: "bad", mark: "fault", glyph: "■", term: "notEnough" },
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

/** Annunciator row of a decision: status mark, decision name (research term on demand), orientation check. */
export function DecisionHead({ t2, id, as: As = "h4" }: { t2: Tier2Result; id?: string; as?: "h3" | "h4" | "div" }) {
  const d = t2.decision;
  const c = DECISION_COPY[d.type];
  // Caution (tie) and fault (no evidence) light their row faintly, like an annunciator; colour is never the only cue.
  const lit = c.mark === "caution" ? "bg-warn/[0.07]" : c.mark === "fault" ? "bg-bad/[0.07]" : "bg-white/[0.035]";
  return (
    <div className={cx("flex min-h-[40px] items-center justify-between gap-3 px-3 py-2", lit)}>
      <As id={id} className="label-caps flex min-w-0 items-center gap-2.5 text-ink [&_button]:text-left [&_button]:uppercase">
        <StatusMark state={c.mark} />
        <span className="min-w-0">
          {c.term ? <Term k={c.term}>{c.title}</Term> : c.title}
          {d.type === "tied_set" && <span className="text-muted"> · {d.members.length} equivalent windows</span>}
        </span>
      </As>
      <RotationGlyph t2={t2} compact />
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
 * score at all, and the uncorrected comparison is never substituted.
 */
export function OperatorStatus({ t2, className }: { t2: Tier2Result; className?: string }) {
  const ok = t2.operator.status === "ok";
  return (
    <p className={cx("flex items-center gap-2 text-caption", ok ? "text-ink/90" : "text-ink", className)}>
      <StatusMark state={ok ? "on" : "fault"} />
      <span><Term k="operator">MOLA observation model</Term> {ok ? "applied" : "unavailable · no score shown"}</span>
    </p>
  );
}
