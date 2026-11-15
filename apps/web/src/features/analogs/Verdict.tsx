import { Term } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import type { Tier2Result } from "../../types/contracts";

/** Plain decision names (glossary §13); the research term stays on demand via <Term>. */
export const DECISION_COPY: Record<Tier2Result["decision"]["type"], { title: string; tone: "ok" | "warn" | "neutral" | "bad"; glyph: string }> = {
  named_leader: { title: "Stable leader", tone: "ok", glyph: "◉" },
  tied_set: { title: "Tie", tone: "warn", glyph: "◎" },
  no_convincing_analog: { title: "No convincing analog", tone: "neutral", glyph: "—" },
  insufficient_evidence: { title: "Not enough evidence", tone: "bad", glyph: "⊘" },
};

/** The research label for a decision, verbatim (API first, G5 constant as the fallback). */
export function decisionLabel(t2: Tier2Result): string | null {
  if (t2.decision.label) return t2.decision.label;
  if (t2.decision.type === "named_leader") return G5.leader;
  if (t2.decision.type === "tied_set") return G5.tied;
  return null;
}

/**
 * Four small squares, one per orientation of the Earth window relative to the MOLA tracks.
 * Filled = the leader held in that orientation. Only a stable leader fills them: the research
 * record states a tie as "not determined", so its squares stay hollow rather than guessing which held.
 */
export function RotationGlyph({ t2, className }: { t2: Tier2Result; className?: string }) {
  const n = t2.decision.rotations_checked;
  if (!n) return null;
  const stable = t2.decision.type === "named_leader";
  const text = stable ? `Leader held in all ${n} orientations` : `${n} orientations checked · leader not determined`;
  return (
    <span className={cx("inline-flex items-center gap-2 text-caption text-muted", className)}>
      <span aria-hidden className="grid grid-cols-2 gap-[2px]">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={cx("h-[5px] w-[5px] rounded-[1px]", stable ? "bg-ink" : "ring-1 ring-inset ring-muted")} />
        ))}
      </span>
      {text}
    </span>
  );
}

/** Compact decision summary, kept for other views (comparison, report) that embed it. */
export function DecisionBlock({ t2 }: { t2: Tier2Result }) {
  const d = DECISION_COPY[t2.decision.type];
  const label = decisionLabel(t2);
  const termKey = t2.decision.type === "named_leader" ? "stableLeader" : t2.decision.type === "tied_set" ? "tie" : t2.decision.type === "insufficient_evidence" ? "notEnough" : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-label text-ink">
          <span aria-hidden className="mr-1.5">{d.glyph}</span>
          {termKey ? <Term k={termKey}>{d.title}</Term> : d.title}
          {t2.decision.type === "tied_set" && <span className="text-muted"> · {t2.decision.members.length} equivalent windows</span>}
        </span>
        <RotationGlyph t2={t2} />
      </div>
      {label && <p className="mt-2 text-caption text-muted">{label}</p>}
    </div>
  );
}
