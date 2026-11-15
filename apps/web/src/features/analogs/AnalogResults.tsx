import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { Bar, Button, Chip, cx, fmt, Note, pct, Section, Segmented, Spinner } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { api } from "../../services/api";
import { useApp } from "../../store/app";
import type { Tier2Result } from "../../types/contracts";
import { candidateList, type CandidateView, prettyWindow, selectedCandidate } from "./candidates";

export const DECISION_COPY: Record<Tier2Result["decision"]["type"], { title: string; tone: "ok" | "warn" | "neutral" | "bad" }> = {
  named_leader: { title: "Named leader", tone: "ok" },
  tied_set: { title: "Tied set", tone: "warn" },
  no_convincing_analog: { title: "No convincing analog", tone: "neutral" },
  insufficient_evidence: { title: "Insufficient evidence", tone: "bad" },
};

export function DecisionBlock({ t2 }: { t2: Tier2Result }) {
  const d = DECISION_COPY[t2.decision.type];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={d.tone}>{d.title}</Chip>
        {t2.decision.rotations_checked > 0 && <Chip>{t2.decision.rotations_checked} orientations checked</Chip>}
        <Chip tone={t2.operator.status === "ok" ? "earth" : "bad"}>operator {t2.operator.status}</Chip>
      </div>
      {t2.decision.label && <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{t2.decision.label}</p>}
    </div>
  );
}

function CandidateRow({ c, on, onClick }: { c: CandidateView; on: boolean; onClick: () => void }) {
  const t1 = c.t1, t2 = c.t2;
  const gate = t2?.landcover?.gate;
  return (
    <button onClick={onClick} aria-pressed={on}
      className={cx("w-full rounded-lg px-3 py-2.5 text-left transition-colors", on ? "bg-earth/10 ring-1 ring-inset ring-earth/30" : "hover:bg-elevated")}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          {c.rank !== undefined && <span className="num w-7 shrink-0 font-mono text-[10.5px] text-faint">#{c.rank}</span>}
          <span className={cx("truncate text-[12.5px]", on ? "text-earth" : "text-ink/90")}>{c.label}</span>
        </div>
        <span className="num shrink-0 text-[13px] font-medium">{fmt(c.score, undefined, 3)}</span>
      </div>
      <div className={cx("mt-1.5 flex items-center gap-3", c.rank !== undefined && "pl-9")}>
        <Bar value={c.score} className="flex-1" />
        <span className="num shrink-0 font-mono text-[10.5px] text-faint">{formatLat(c.lat, 1)} {formatLon(c.lon, 1)}</span>
      </div>
      <div className={cx("mt-1.5 flex flex-wrap gap-1", c.rank !== undefined && "pl-9")}>
        <Chip>coverage {pct(c.coverage)}</Chip>
        {t1?.known_analog.status === "near_documented_analog" && <Chip tone="warn">near {t1.known_analog.name}</Chip>}
        {t1?.quality_flags.some((f) => f.severity !== "info") && <Chip tone="warn">quality flag</Chip>}
        {t2?.kind && t2.kind !== "random" && <Chip tone="warn">{t2.kind}</Chip>}
        {gate && <Chip tone={gate === "pass" ? "ok" : gate === "fail" ? "bad" : "neutral"}>cover {gate}</Chip>}
      </div>
    </button>
  );
}

export function AnalogResults() {
  const { search, tier, set, candidateId, knownFilter, go, mission } = useApp();
  const [loadingMore, setLoadingMore] = useState(false);
  if (!search) return <div className="p-6"><Spinner label="No search yet" /></div>;
  const t1 = search.tier1, t2 = search.tier2;
  const all = candidateList(search);
  const current = selectedCandidate(search, candidateId);
  const list = all.filter((c) => c.tier === tier).filter((c) => tier === 2 || knownFilter === "all" || c.t1?.known_analog.status === knownFilter);

  const loadMore = async () => {
    if (!t1 || !search.mars.site) return;
    setLoadingMore(true);
    try {
      const page = await api.tier1Page(search.mars.site, (search.request as { mission?: string })?.mission ?? mission, t1.candidates.length, 100);
      set({ search: { ...search, tier1: { ...t1, candidates: [...t1.candidates, ...page.candidates] } } });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center gap-2"><Chip tone="earth">Earth analogs</Chip>
          {search.status === "unavailable" && <Chip tone="bad">unavailable</Chip>}</div>
        <h2 className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em]">Candidate terrain on Earth</h2>
        <div className="mt-3">
          <Segmented ariaLabel="Result tier" value={tier} onChange={(v) => set({ tier: v })}
            options={[{ value: 2, label: "Tier 2 · OOM" }, { value: 1, label: `Tier 1 · global${t1 ? ` (${t1.total.toLocaleString()})` : ""}`, disabled: !t1 }]} />
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tier === 2 ? (
          <Section title="Decision" aside={<span className="text-[10.5px] text-faint">{t2.target.window_km} km windows</span>}>
            <DecisionBlock t2={t2} />
            {t2.operator.status !== "ok" && (
              <div className="mt-3 space-y-2">
                <Note tone="warning">No similarity score is shown: the target-specific MOLA observation operator is unavailable here, and the app does not substitute the uncorrected comparison.</Note>
                <div className="flex flex-wrap gap-1.5">{(t2.operator as { missing_inputs?: string[] }).missing_inputs?.map((x) => <Chip key={x} className="whitespace-normal text-left">{x}</Chip>)}</div>
              </div>
            )}
            {t2.landcover_gate && (
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Land cover {t2.landcover_gate.mode === "exclude" ? "gate applied before ranking" : "reported, never used to exclude"} ·
                bare ≥ {t2.landcover_gate.bare_min}, vegetated ≤ {t2.landcover_gate.veg_max} (working hypotheses).
              </p>
            )}
          </Section>
        ) : t1 && (
          <Section title="Global screen" aside={<span className="text-[10.5px] text-faint">25 km cells</span>}>
            <div className="num grid grid-cols-3 gap-2 text-[11px] text-muted">
              <div><div className="text-faint">Leader S</div><span className="text-[14px] text-ink">{fmt(t1.summary.leader_similarity, undefined, 3)}</span></div>
              <div><div className="text-faint">Within 0.05</div><span className="text-[14px] text-ink">{t1.summary.n_within_0p05_of_leader}</span></div>
              <div><div className="text-faint">S ≥ 0.75</div><span className="text-[14px] text-ink">{t1.summary.n_strong_ge_0p75.toLocaleString()}</span></div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">{t1.disclaimer}</p>
          </Section>
        )}

        <div className="space-y-0.5 px-2 pb-3">
          {list.map((c) => <CandidateRow key={c.id} c={c} on={current?.id === c.id} onClick={() => set({ candidateId: c.id })} />)}
          {list.length === 0 && <p className="px-3 py-4 text-[12px] text-muted">No candidates in this view.</p>}
          {tier === 1 && t1 && t1.candidates.length < t1.total && (
            <Button variant="ghost" className="w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : `Load next 100 of ${t1.total.toLocaleString()}`}
            </Button>
          )}
        </div>

        {tier === 2 && t2.as_measured_baseline && (
          <Section title="Uncorrected comparator">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-muted">Leader as measured: <span className="text-ink">{prettyWindow(t2.as_measured_baseline.leader)}</span></span>
              <span className="num">{fmt(t2.as_measured_baseline.S, undefined, 3)}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">{t2.as_measured_baseline.label}</p>
          </Section>
        )}
      </div>

      {current && (
        <div className="border-t border-line/70 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="truncate text-[12.5px] text-earth">{current.label}</span>
            <span className="num text-[11px] text-faint">{current.tier === 2 ? "50 km window" : "25 km cell"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { go("compare"); set({ whyOpen: true }); }}><Sparkles className="h-3.5 w-3.5" /> Why this analog?</Button>
            <Button variant="primary-earth" onClick={() => go("compare")}>Compare <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
