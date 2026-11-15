import { useLayout } from "../../app/useLayout";
import { Disclosure, Measure, Term, Toponym } from "../../components/primitives";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch, Tier2Candidate } from "../../types/contracts";
import { coord, decisionMembers, measuresOf, parseWindowId, prettyWindow, shortWindow, T2_MEASURES, unorderedMembers } from "./candidates";
import { chooseCandidate, switchTier } from "./tierMemory";
import { DECISION_COPY, decisionLabel, RotationGlyph } from "./Verdict";

function windowName(c: Tier2Candidate): { name: string; sub: string | null } {
  const w = parseWindowId(c.id);
  return w ? { name: shortWindow(c.id), sub: `Research pool · roughness decile ${w.decile}` } : { name: c.id, sub: c.kind && c.kind !== "random" ? c.kind : null };
}

/** "8/8 measures" — the descriptor coverage that every research score carries. */
function Measures({ c }: { c: Tier2Candidate }) {
  const n = measuresOf(c.coverage, T2_MEASURES);
  return <span className="whitespace-nowrap text-caption text-muted"><span className="num text-num-sm text-ink">{n ?? "—"}/{T2_MEASURES}</span> <Term k="measures">measures</Term></span>;
}

/** Stage 1 — the published research comparison for this zone (tier 2, OOM, fixed 230-window pool). */
export function ResearchStage({ search, candidateId }: { search: AnalogSearch; candidateId: string | null }) {
  const t2 = search.tier2;
  const d = t2.decision;
  const copy = DECISION_COPY[d.type];
  const label = decisionLabel(t2);
  const members = decisionMembers(t2);
  const others = t2.candidates.filter((c) => !d.members.includes(c.id) && c.lat !== null);
  const pool = t2.candidate_pool as (NonNullable<typeof t2.candidate_pool> & { n_ranked?: number; ranked_basis?: string }) | null;
  const winKm = t2.target.window_km || 50;
  const pick = (c: Tier2Candidate) => chooseCandidate(`t2:${c.id}`);
  const isOn = (c: Tier2Candidate) => candidateId === `t2:${c.id}`;
  const phone = useLayout() === "phone";

  return (
    <section aria-labelledby="stage-research" className="pb-2">
      {/* The tab above names the stage; this line states only its basis. */}
      <p className="text-caption text-faint"><span id="stage-research" className="sr-only">Research comparison: </span>{winKm} km windows · Earth as MOLA would observe it</p>

      {/* Verdict headline */}
      <div className="mt-4">
        <div className="flex items-center gap-2 text-title text-ink">
          <span aria-hidden className="text-muted">{copy.glyph}</span>
          {d.type === "named_leader" && <Term k="stableLeader">Stable leader</Term>}
          {d.type === "tied_set" && <span><Term k="tie">Tie</Term> · {d.members.length} equivalent windows</span>}
          {d.type === "insufficient_evidence" && <Term k="notEnough">Not enough evidence</Term>}
          {d.type === "no_convincing_analog" && <span>No convincing analog</span>}
        </div>

        {d.type === "named_leader" && members[0] && (
          <button type="button" onClick={() => pick(members[0])} aria-pressed={isOn(members[0])}
            className={cx("group -mx-2 mt-1.5 block w-[calc(100%+16px)] rounded-control px-2 py-1.5 text-left transition-colors hover:bg-elevated", isOn(members[0]) && "bg-elevated")}>
            <Toponym as="span" size="sm" className={cx("block", isOn(members[0]) && "!text-earth")}>{windowName(members[0]).name}</Toponym>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-caption text-muted">
              <span className="num text-num-sm">{coord(members[0].lat!, members[0].lon!)}</span>
              {windowName(members[0]).sub && <span>· {windowName(members[0]).sub}</span>}
            </span>
          </button>
        )}

        {label && d.type !== "tied_set" && <p className="mt-2 text-caption text-muted">{label}</p>}
      </div>

      {/* Score + basis */}
      {d.type === "named_leader" && members[0] && (
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-caption text-muted"><Term k="similarity">Similarity</Term></div>
            <div className="mt-0.5 flex items-baseline gap-2"><span className="num text-num-sm text-muted">S</span><Measure value={members[0].S} digits={3} className="text-figure text-ink" /></div>
          </div>
          <div className="pb-1 text-right">
            <Measures c={members[0]} />
            <div className="text-caption text-muted">validated on <Term k="synthetic">synthetic twins only</Term></div>
          </div>
        </div>
      )}

      {d.type === "tied_set" && (
        <>
          <div role="group" aria-label={`${members.length} tied research windows, not ranked against each other`} className="mt-3">
            <ul className="divide-y divide-line">
              {unorderedMembers(members).map((c) => {
                const w = windowName(c);
                const on = isOn(c);
                return (
                  <li key={c.id}>
                    {/* Phones: one equal-weight line per member, so the whole tied set fits together at half height. */}
                    <button type="button" onClick={() => pick(c)} aria-pressed={on}
                      className={cx("hit flex min-h-[44px] w-full items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-elevated", phone ? "py-1" : "py-1.5", on && "bg-elevated")}>
                      <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", on ? "bg-earth" : "ring-1 ring-inset ring-earth")} />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-label", on ? "text-earth" : "text-ink")}>{w.name}</span>
                        <span className={cx("num block text-num-sm text-muted", phone && "sr-only")}>{coord(c.lat!, c.lon!)}</span>
                      </span>
                      <span className={cx("text-right", phone && "flex items-baseline gap-2")}>
                        <span className="num block text-num text-ink">S {c.S === null ? "—" : c.S.toFixed(3)}</span>
                        <span className="num block text-num-sm text-faint">{measuresOf(c.coverage, T2_MEASURES) ?? "—"}/{T2_MEASURES}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {label && <p className="mt-2 text-caption text-muted">{label}</p>}
          <p className="mt-2 text-caption text-muted">
            Listed west to east. Equivalent at this resolution — none is preferred, so none is pre-selected.
            Scores use <Term k="measures">8 measures</Term>; validated on <Term k="synthetic">synthetic twins only</Term>.
          </p>
        </>
      )}

      {(d.type === "insufficient_evidence" || d.type === "no_convincing_analog") && (
        <p className="mt-2 text-caption text-muted">
          {t2.operator.status !== "ok"
            ? "No similarity score is shown: the MOLA observation model is unavailable here, and the uncorrected comparison is not substituted."
            : "No research window is named."}
          {search.tier1 && <> The <button type="button" className="text-ink underline decoration-faint underline-offset-2 hover:decoration-ink" onClick={() => switchTier(1)}>global screen</button> still lists comparable cells.</>}
        </p>
      )}

      {/* Rotation + pool */}
      {(d.rotations_checked > 0 || pool) && (
        <div className="mt-4 space-y-1.5">
          <RotationGlyph t2={t2} />
          {pool && (
            <p className="text-caption text-muted">
              Ranked among <span className="num text-num-sm text-ink">{pool.n_ranked ?? pool.n_windows}</span> of{" "}
              <span className="num text-num-sm text-ink">{pool.n_windows}</span> research windows
              {t2.landcover_gate?.mode === "exclude" ? " that pass the land-cover filter" : t2.landcover_gate ? " (land cover reported, not used to exclude)" : ""}
            </p>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-caption text-muted">Other research windows (context, not part of the decision)</div>
          <ul className="divide-y divide-line">
            {others.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} aria-pressed={isOn(c)}
                  className={cx("hit flex h-10 w-full items-center gap-3 rounded-control px-2 text-left hover:bg-elevated", isOn(c) && "bg-elevated")}>
                  <span className="min-w-0 flex-1 truncate text-label">{prettyWindow(c.id)}</span>
                  <span className="num text-num">S {c.S === null ? "—" : c.S.toFixed(3)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Caveats one step away */}
      <div className="mt-4 space-y-1">
        {t2.landcover_gate && (
          <p className="text-caption text-muted">
            <Term k="landCover">Land-cover filter</Term>:{" "}
            {t2.landcover_gate.mode === "exclude" ? "applied before ranking" : "reported only, never excludes"} · bare ≥{" "}
            <span className="num text-num-sm">{t2.landcover_gate.bare_min.toFixed(2)}</span>, vegetated ≤{" "}
            <span className="num text-num-sm">{t2.landcover_gate.veg_max.toFixed(2)}</span> (working hypotheses)
          </p>
        )}
        <p className="text-caption text-muted"><Term k="scope">Terrain geometry only</Term> · <Term k="operator">MOLA observation model</Term> · <Term k="scale">{winKm} km windows</Term></p>
      </div>

      {t2.as_measured_baseline && (
        <Disclosure className="mt-2" summary="Uncorrected comparator">
          <p className="mb-2 text-caption text-muted">
            The score above uses “{G5.toggleOom}”. For contrast, the uncorrected comparison with Earth terrain {G5.toggleMeasured}:
          </p>
          <div className="rounded-control bg-elevated px-3 py-2.5">
            <div className="text-caption text-muted">Earth terrain: {G5.toggleMeasured}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-label text-ink">{prettyWindow(t2.as_measured_baseline.leader)}</span>
              <span className="num shrink-0 text-num">S {t2.as_measured_baseline.S === null ? "—" : t2.as_measured_baseline.S.toFixed(3)}
                <span className="text-faint"> · {measuresOf(t2.as_measured_baseline.coverage, T2_MEASURES) ?? "—"}/{T2_MEASURES}</span></span>
            </div>
            <p className="mt-1.5 text-caption text-muted">{t2.as_measured_baseline.label}</p>
          </div>
        </Disclosure>
      )}
    </section>
  );
}
