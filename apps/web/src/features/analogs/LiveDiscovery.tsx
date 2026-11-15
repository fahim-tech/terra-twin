import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { DECISION_WORDS, type DecisionType, OutcomeMark, outcomeKind, SFigure, StatusMark } from "../../components/marks";
import { Disclosure, Term } from "../../components/primitives";
import { cx, Note, Spinner } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { decisionG5Label, type GlossaryKey, zoneName } from "../../lib/glossary";
import { type DiscoveryCandidate, type DiscoveryJob, type DiscoveryRun, useDiscoveryRun, useDiscoveryRuns, useGisStatus } from "../../services/gis";
import { useApp } from "../../store/app";
import {
  cellLabel, decisionMembers, descriptorLabel, descriptorUnit, disclaimerText, elapsedText, formatValue, jobPhase, otherCandidates, pctText, scopeText, windowsProgress,
} from "./discoveryModel";
import { Readout, Readouts, rowClass, SectionHead, SelectionBar } from "./instruments";
import { DiscoveryAction } from "./DiscoveryAction";
import { sText } from "./readout";
import { searchTarget } from "../../store/searchTarget";

const TERM: Partial<Record<DecisionType, GlossaryKey>> = { named_leader: "stableLeader", tied_set: "tie", insufficient_evidence: "notEnough" };
const MISSION_WORDS = (m: string | null | undefined) => (m ? m.replace(/_/g, " ") : "—");

/** A run target in words: the zone's name, or its coordinates. */
function targetText(site: string | null | undefined, lat: number | null | undefined, lon: number | null | undefined) {
  if (site) return zoneName(site);
  return typeof lat === "number" && typeof lon === "number" ? `${formatLat(lat, 2)} ${formatLon(lon, 2)}` : "—";
}

/* ------------------------------------------------------------------------------------------ progress */

const PHASES: { key: "queued" | "running" | "done"; word: string }[] = [
  { key: "queued", word: "Queued" }, { key: "running", word: "Running" }, { key: "done", word: "Done" },
];

/**
 * The job as an instrument: its state words, queue place, elapsed time, stage and counters, and the k/n
 * windows bar, all read from the job payload (nothing animated without data). The run continues on the
 * server whatever this page does; there is no cancel.
 */
export function JobProgress({ job }: { job: DiscoveryJob }) {
  const phase = jobPhase(job);
  const w = windowsProgress(job);
  const p = job.progress ?? null;
  const reduce = useReducedMotion();
  const failed = phase === "failed";
  const step = phase === "done" ? 2 : phase === "running" ? 1 : 0;
  return (
    <div className="frame border border-line-strong" aria-busy={!failed && phase !== "done"}>
      <div className={cx("flex min-h-[40px] items-center justify-between gap-3 px-3 py-2", failed ? "bg-bad/[0.08]" : phase === "busy" ? "bg-warn/[0.06]" : "bg-white/[0.035]")}>
        <p role="status" className="label-caps flex min-w-0 items-center gap-2.5 text-ink">
          <StatusMark state={failed ? "fault" : phase === "busy" ? "caution" : phase === "done" ? "on" : "partial"} />
          <span className="truncate">{job.state_label}</span>
        </p>
        <span className="num shrink-0 text-num-sm text-muted">{job.params.n_refine} windows · {job.params.window_km} km</span>
      </div>
      {/* Phase track: queued → running → done (busy is a queued state; a failure stops the track). */}
      <ol aria-label="Job phases" className="grid grid-cols-3 border-t border-line">
        {PHASES.map((ph, i) => (
          <li key={ph.key} className={cx("flex items-center gap-2 px-3 py-1.5 text-caption", i > 0 && "border-l border-line",
            !failed && i === step ? "text-ink" : !failed && i < step ? "text-muted" : "text-faint")}>
            <StatusMark state={!failed && i < step ? "on" : !failed && i === step ? "partial" : "off"} />
            {ph.word}<span className="sr-only">{!failed && i < step ? ", passed" : !failed && i === step ? ", current" : ""}</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 border-t border-line">
        <div className="px-3 py-2"><dt className="kicker">Queue position</dt><dd className="num mt-1 text-[15px] leading-none text-ink">{typeof job.queue_position === "number" ? job.queue_position : "—"}</dd></div>
        <div className="border-l border-line px-3 py-2"><dt className="kicker">Elapsed</dt><dd className="num mt-1 text-[15px] leading-none text-ink">{elapsedText(job.elapsed_s)}</dd></div>
        <div className="col-span-2 border-t border-line px-3 py-2">
          <dt className="kicker">Stage</dt>
          <dd className="mt-1 text-caption text-ink">{p?.stage_label ?? (phase === "queued" || phase === "busy" ? "Waiting for the worker" : "—")}</dd>
        </div>
        <div className="col-span-2 border-t border-line px-3 py-2">
          <dt className="kicker">Tier-1 cells scored</dt>
          <dd className="num mt-1 text-[15px] leading-none text-ink">{typeof p?.cells_scored === "number" ? p.cells_scored.toLocaleString("en-US") : "—"}</dd>
        </div>
      </dl>
      <div className="border-t border-line px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="kicker">Earth windows extracted</span>
          <span className="num text-num-sm text-ink">{w ? <>{w.k}<span className="text-faint"> / {w.n}</span></> : "—"}</span>
        </div>
        {/* Ticks per window when there are few enough to read; the bar fills only from the payload's k/n. */}
        <div role="progressbar" aria-label="Earth windows extracted" aria-valuemin={0} aria-valuemax={w?.n ?? 0} aria-valuenow={w?.k}
          aria-valuetext={w ? `${w.k} of ${w.n} windows` : "Not started"} className="relative mt-2 h-2 border border-line-strong">
          {w && <motion.span className="absolute inset-y-0 left-0 bg-earth" initial={false} animate={{ width: `${w.frac * 100}%` }} transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.4 }} />}
          {w && w.n <= 60 && Array.from({ length: w.n - 1 }, (_, i) => (
            <span key={i} aria-hidden className="absolute inset-y-0 w-px bg-space/70" style={{ left: `${((i + 1) / w.n) * 100}%` }} />
          ))}
        </div>
      </div>
      {failed && (
        <div className="border-t border-bad/40 px-3 py-2.5 text-caption text-ink">
          <p className="kicker !text-bad">Error{job.error?.type && <> · <span className="font-mono normal-case tracking-normal">{job.error.type}</span></>}</p>
          <p className="mt-1 break-words">{job.error?.message ?? "The job reported a failure without a message."}</p>
        </div>
      )}
      {p?.last_line && !failed && <p className="truncate border-t border-line px-3 py-1.5 font-mono text-[10.5px] text-faint" title={p.last_line}>{p.last_line}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------- run results */

function Annunciator({ run }: { run: DiscoveryRun }) {
  const d = run.refinement!.decision;
  const term = TERM[d.type];
  const rot = (d as { rotations_checked?: number }).rotations_checked;
  return (
    <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-white/[0.035] px-3 py-2">
      <h4 className="label-caps flex min-w-0 items-center gap-2.5 text-ink [&_button]:text-left [&_button]:uppercase">
        <OutcomeMark kind={outcomeKind(d.type)} />
        <span className="min-w-0">
          {term ? <Term k={term}>{DECISION_WORDS[d.type]}</Term> : DECISION_WORDS[d.type]}
          {d.type === "tied_set" && <span className="text-muted"> · {d.members.length}<span className="max-md:sr-only"> equivalent</span> windows</span>}
        </span>
      </h4>
      {/* Above the members, always in view: a tie is an unordered set. */}
      {d.type === "tied_set"
        ? <span className="kicker shrink-0 !text-ink/80"><span className="md:hidden">Unordered · W → E</span><span className="max-md:hidden">Unordered · west → east</span></span>
        : typeof rot === "number" ? <span className="num text-num-sm uppercase text-muted">{rot} orientations checked</span> : null}
    </div>
  );
}

/** A refined window as a selectable row: coordinate label, S, coverage, verdict, land-cover gate. */
function CandRow({ c, on, onPick }: { c: DiscoveryCandidate; on: boolean; onPick: () => void }) {
  const lc = c.landcover;
  return (
    <li>
      <button type="button" aria-pressed={on} onClick={onPick}
        aria-label={`${cellLabel(c.lat, c.lon)}, similarity ${sText(c.S)}, coverage ${pctText(c.coverage)}${c.verdict ? `, ${c.verdict}` : ""}${lc?.gate ? `, land cover ${lc.gate}` : ""}`}
        className={rowClass(on, "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2 pl-3 pr-3")}>
        {on && <SelectionBar layoutId="live-selection" />}
        <span className={cx("num min-w-0 truncate text-num", on ? "text-earth" : "text-ink")}>{cellLabel(c.lat, c.lon)}</span>
        <span className="num whitespace-nowrap text-right text-num text-ink">
          {/* In a tie every member gets the same weight: the figure is set like the others, never as a rank. */}
          <span className="text-faint">S </span>{sText(c.S)}
        </span>
        <span className="min-w-0 truncate text-caption text-muted">
          {c.verdict ?? "—"}{lc?.gate ? ` · land cover ${lc.gate}` : ""}
        </span>
        <span className="num whitespace-nowrap text-right text-num-sm text-faint">cov {pctText(c.coverage)}</span>
      </button>
    </li>
  );
}

/** Mars vs Earth per descriptor: as MOLA would observe it (the basis of S) and as measured (diagnostic). */
function DescriptorTable({ c, units }: { c: DiscoveryCandidate; units?: Record<string, string> }) {
  const f = c.features;
  const keys = Object.keys(f?.mars ?? f?.earth_as_mola_would_see ?? {});
  if (!f || !keys.length) return <p className="text-caption text-faint">The run lists no descriptors for this window.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] border-y border-line text-left">
        <caption className="sr-only">Descriptors: Mars, Earth as MOLA would observe it, Earth as measured</caption>
        <thead>
          <tr className="kicker border-b border-line [&>th]:py-1.5 [&>th]:font-semibold">
            <th scope="col">Descriptor</th>
            <th scope="col" className="text-right"><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 bg-mars" />Mars</span></th>
            <th scope="col" className="text-right" title="Earth terrain: as MOLA would observe it at this Mars site"><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 bg-earth" />As MOLA</span></th>
            <th scope="col" className="text-right">As meas.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {keys.map((k) => {
            const u = descriptorUnit(k, units);
            return (
              <tr key={k} className="[&>td]:py-1.5">
                <th scope="row" className="pr-2 text-caption font-normal text-muted">{descriptorLabel(k)}</th>
                <td className="num whitespace-nowrap pl-2 text-right text-num-sm text-ink">{formatValue(f.mars?.[k], u)}</td>
                <td className="num whitespace-nowrap pl-2 text-right text-num-sm text-ink">{formatValue(f.earth_as_mola_would_see?.[k], u)}</td>
                <td className="num whitespace-nowrap pl-2 text-right text-num-sm text-muted">{formatValue(f.earth_as_measured?.[k], u)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Detail of the selected live window: S with its range over rotations, gate, tier-1 record, descriptors. */
function CandidateDetail({ c, run, index }: { c: DiscoveryCandidate; run: DiscoveryRun; index: string }) {
  const r = run.refinement!;
  const range = c.S_range_over_rotations;
  const lc = c.landcover;
  const am = c.as_measured_comparison as { S?: number | null; label?: string } | undefined;
  const tieMember = r.decision.type === "tied_set" && r.decision.members.includes(c.id);
  return (
    <section aria-labelledby="live-detail" className="mt-6">
      <SectionHead id="live-detail" index={index}>Selected window</SectionHead>
      <div className="mt-2.5 border border-line-strong">
        <div className="relative px-3 py-2.5 pl-4">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-earth" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="num min-w-0 whitespace-nowrap text-num text-earth">{cellLabel(c.lat, c.lon)}</span>
            <SFigure value={c.S} term className="shrink-0 text-[22px] text-ink" />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="break-all font-mono text-[10.5px] text-faint">{c.id}</span>
            <span className="text-caption text-muted">validated on <Term k="synthetic">synthetic twins only</Term></span>
          </div>
        </div>
        {tieMember && <p className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-caption text-ink/85"><OutcomeMark kind="tie" />One of {r.decision.members.length} tied windows</p>}
      </div>
      <Readouts className="mt-3" label="Selected window">
        <Readout label="S range">
          {range && range.length === 2 ? <><span className="num text-ink">{sText(range[0])}–{sText(range[1])}</span> over the four orientations</> : "—"}
        </Readout>
        <Readout label={<Term k="measures">Coverage</Term>}>{pctText(c.coverage)}</Readout>
        <Readout label="Verdict">{c.verdict ?? "—"}{(c as { verdict_thresholds_status?: string }).verdict_thresholds_status ? <span className="text-muted"> · thresholds are a {(c as { verdict_thresholds_status?: string }).verdict_thresholds_status}</span> : null}</Readout>
        <Readout label={<Term k="landCover">Land cover</Term>}>
          {lc?.gate ?? "—"}{lc?.reason ? <span className="text-muted"> · {lc.reason}</span> : null}
          {lc && (typeof lc.frac_bare_like === "number" || typeof lc.frac_vegetated === "number") && (
            <span className="text-muted"> · bare <span className="num">{pctText(lc.frac_bare_like)}</span>, vegetated <span className="num">{pctText(lc.frac_vegetated)}</span></span>
          )}
        </Readout>
        <Readout label="Tier-1 screen">
          {typeof c.tier1_rank === "number" ? <>rank <span className="num text-ink">{c.tier1_rank}</span>, </> : "rank —, "}
          similarity <span className="num text-ink">{sText(c.tier1_similarity)}</span>
          <span className="text-muted"> · 25 km cells, Earth as measured</span>
        </Readout>
        {am && (
          <Readout label="As measured">
            S <span className="num text-ink">{sText(am.S)}</span>{am.label ? <span className="text-muted"> · {am.label}</span> : null}
          </Readout>
        )}
      </Readouts>
      <div className="mt-3"><DescriptorTable c={c} /></div>
    </section>
  );
}

/** The scope a run covered, from its own fields. */
function Scope({ run }: { run: DiscoveryRun }) {
  const r = run.refinement!;
  const sel = (r.shortlist_selection ?? {}) as { source?: string; tier1_top_n_considered?: number; n_requested?: number; n_selected?: number; min_separation_km?: number; skipped?: Record<string, number> };
  const cov = (r.coarse_index_coverage ?? {}) as { n_cells_scored?: number; n_cells_total?: number; statement?: string };
  const sq = (r.source_quality ?? {}) as { dem_source?: string; landcover_source?: string; median_valid_fraction?: number };
  const skipped = Object.entries(sel.skipped ?? {}).filter(([, v]) => typeof v === "number" && v > 0);
  return (
    <Readouts label="Scope of the run">
      <Readout label="Pool">{scopeText(r.candidate_pool_scope)}</Readout>
      <Readout label="Refined"><span className="num text-ink">{r.number_of_windows_refined}</span> windows of <span className="num">{r.window_km}</span> km</Readout>
      <Readout label="Shortlist">
        {typeof sel.n_selected === "number" && typeof sel.n_requested === "number" ? <><span className="num text-ink">{sel.n_selected}</span> of <span className="num">{sel.n_requested}</span> requested</> : "—"}
        {typeof sel.tier1_top_n_considered === "number" && <>, from the tier-1 top <span className="num">{sel.tier1_top_n_considered}</span></>}
        {typeof sel.min_separation_km === "number" && <>, windows at least <span className="num">{sel.min_separation_km}</span> km apart</>}.
        {sel.source && <span className="block text-muted">{sel.source}</span>}
        {skipped.length > 0 && <span className="block text-muted">Skipped: {skipped.map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")}</span>}
      </Readout>
      <Readout label="Coarse index">
        {typeof cov.n_cells_scored === "number" && typeof cov.n_cells_total === "number" && <><span className="num text-ink">{cov.n_cells_scored.toLocaleString("en-US")}</span> of <span className="num">{cov.n_cells_total.toLocaleString("en-US")}</span> cells scored. </>}
        {cov.statement && <span className="text-muted">{cov.statement.charAt(0).toUpperCase() + cov.statement.slice(1)}.</span>}
      </Readout>
      <Readout label="Sources">
        {sq.dem_source ?? "—"}{sq.landcover_source ? <span className="text-muted"> · land cover {sq.landcover_source}</span> : null}
        {typeof sq.median_valid_fraction === "number" && <span className="text-muted"> · median valid {pctText(sq.median_valid_fraction)}</span>}
      </Readout>
    </Readouts>
  );
}

function RunView({ run }: { run: DiscoveryRun }) {
  const liveCandidate = useApp((s) => s.liveCandidate);
  const [shown, setShown] = useState(10);
  const r = run.refinement;
  if (!r) {
    return (
      <Note tone="warning">
        This run has no refinement record{run.reasons?.length ? `: ${run.reasons.join("; ")}` : "."} Nothing is shown in its place.
      </Note>
    );
  }
  const d = r.decision;
  const members = decisionMembers(run);
  const others = otherCandidates(run);
  const pick = (id: string) => useApp.getState().set({ liveCandidate: liveCandidate === id ? null : id });
  const selected = r.candidates.find((c) => c.id === liveCandidate) ?? null;
  const label = decisionG5Label(d);
  const excluded = r.excluded ? r.excluded.length : null;
  const gateBefore = ((r.shortlist_selection as { skipped?: Record<string, unknown> } | undefined)?.skipped?.gate_excluded) as number | undefined;
  const rot = (d as { rotations_checked?: number }).rotations_checked;
  const disclaimers = r.disclaimers.map(disclaimerText);
  let n = 0;
  const next = () => String(++n).padStart(2, "0");
  const idx = { decision: next(), detail: selected ? next() : "", others: others.length ? next() : "", scope: next(), caveats: next(), runs: next() };

  return (
    <div>
      <p className="text-caption text-faint">
        {targetText(r.target.site, r.target.lat, r.target.lon)} · {MISSION_WORDS(r.mission)} · <span className="num">{r.window_km}</span> km windows · Earth as MOLA would observe it
      </p>

      <SectionHead index={idx.decision} className="mt-4 max-md:sr-only">Decision</SectionHead>
      <div className="mt-2.5 border border-line-strong max-md:mt-2">
        <Annunciator run={run} />
        {members.length > 0 && (
          <div role="group" aria-label={d.type === "tied_set" ? `${members.length} tied windows, not ranked against each other, listed west to east` : "Named window"} className="border-t border-line">
            {d.type === "tied_set" && (
              <div aria-hidden className="kicker grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-1.5 pl-3 pr-3 max-md:hidden">
                <span>Location · west → east</span><span>S · not a rank</span>
              </div>
            )}
            <ul className="divide-y divide-line">
              {members.map((c) => <CandRow key={c.id} c={c} on={liveCandidate === c.id} onPick={() => pick(c.id)} />)}
            </ul>
          </div>
        )}
        <div className="space-y-1.5 border-t border-line px-3 py-2.5 text-caption text-muted">
          {label && <p className="text-ink/80">{label}</p>}
          {d.type === "tied_set" && <p>Equivalent at this resolution — none is preferred, so none is pre-selected. Each S is at one orientation{typeof rot === "number" ? `; the leader changes across the ${rot} checked` : ""}.</p>}
          {d.type === "no_convincing_analog" && <p>No refined window is named. The windows below are context, not a result.</p>}
          <p>Scores use the <Term k="measures">measures</Term> each row lists; validated on <Term k="synthetic">synthetic twins only</Term>. S is not comparable across window sizes.</p>
        </div>
      </div>

      {selected && <CandidateDetail c={selected} run={run} index={idx.detail} />}

      {others.length > 0 && (
        <>
          <SectionHead index={idx.others} className="mt-6" aside={others.length}>Other refined windows</SectionHead>
          <p className="mt-1.5 text-caption text-muted">
            Context, not part of the decision
            {typeof gateBefore === "number" && <> · land-cover filter removed <span className="num">{gateBefore}</span> shortlisted cells before extraction</>}
            {excluded !== null && <> · <span className="num">{excluded}</span> refined windows excluded</>}.
          </p>
          <ul aria-label="Other refined windows, context only" className="mt-2 divide-y divide-line border-y border-line">
            {others.slice(0, shown).map((c) => <CandRow key={c.id} c={c} on={liveCandidate === c.id} onPick={() => pick(c.id)} />)}
          </ul>
          {others.length > shown && (
            <button type="button" onClick={() => setShown(others.length)} className="hit mt-2 text-caption text-muted underline decoration-faint underline-offset-2 hover:text-ink">
              Show all {others.length} refined windows
            </button>
          )}
        </>
      )}

      <SectionHead index={idx.scope} className="mt-6">Scope</SectionHead>
      <div className="mt-2.5"><Scope run={run} /></div>

      <SectionHead index={idx.caveats} className="mt-6">Caveats</SectionHead>
      <ul className="mt-2.5 space-y-1.5">
        {disclaimers.map((t) => <li key={t} className="flex gap-2.5 text-caption text-ink/85"><span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 bg-faint" />{t}</li>)}
      </ul>
      {r.limitations && r.limitations.length > 0 && (
        <Disclosure className="mt-2" summary="Limitations">
          <ul className="space-y-1.5">{r.limitations.map((t) => <li key={t} className="text-caption text-muted">{t}</li>)}</ul>
        </Disclosure>
      )}
      <p className="mt-4 border-t border-line pt-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">
        Run {run.run_id} · {typeof run.seconds === "number" ? `${run.seconds.toFixed(1)} s` : "— s"} · {r.operator.status === "ok" ? "operator ok" : "operator unavailable"}
      </p>
      <PreviousRuns current={run.run_id} index={idx.runs} />
    </div>
  );
}

/** Previous runs on the server (judges can open the cached ones). */
function PreviousRuns({ current, index }: { current: string | null; index: string }) {
  const runs = useDiscoveryRuns();
  return (
    <section aria-labelledby="live-previous" className="mt-6">
      <SectionHead id="live-previous" index={index} aside={runs.data?.length}>Runs on this server</SectionHead>
      {runs.isLoading ? <div className="mt-2.5"><Spinner label="Loading runs" /></div>
        : runs.isError ? <p className="mt-2.5 text-caption text-muted">Runs could not be listed: {(runs.error as Error).message}</p>
        : !runs.data?.length ? <p className="mt-2.5 text-caption text-faint">No discovery has run on this server yet.</p> : (
          <ul className="mt-2.5 divide-y divide-line border-y border-line">
            {runs.data.map((x) => {
              const on = x.run_id === current;
              return (
                <li key={x.run_id}>
                  <button type="button" aria-pressed={on} onClick={() => useApp.getState().set({ liveRunId: x.run_id, liveCandidate: null })}
                    className={rowClass(on, "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 pl-3 pr-3")}>
                    {on && <SelectionBar layoutId="live-run" tone="ink" />}
                    <span className="min-w-0 truncate text-label text-ink">{targetText(x.target.site, x.target.lat, x.target.lon)}</span>
                    <span className="num text-num-sm text-faint">{x.run_id}</span>
                    <span className="flex min-w-0 items-center gap-2 truncate text-caption text-muted">
                      <OutcomeMark kind={outcomeKind(x.decision.type)} />
                      {x.decision.type ? (DECISION_WORDS[x.decision.type as DecisionType] ?? x.decision.type) : "—"} · {MISSION_WORDS(x.mission)}
                    </span>
                    <span className="num text-num-sm text-faint">{x.number_of_windows_refined ?? "—"} win · {typeof x.seconds === "number" ? `${Math.round(x.seconds)} s` : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/**
 * Stage 3 — live discovery (GIS): the submitted job's progress while it runs, then its run; or any previous
 * run opened from the list. Everything shown comes from the job and run payloads.
 */
export function LiveDiscovery() {
  const discovery = useApp((s) => s.discovery);
  const liveRunId = useApp((s) => s.liveRunId);
  const gis = useGisStatus();
  const run = useDiscoveryRun(liveRunId);
  const job = discovery?.job ?? null;
  const running = job && job.status !== "done";
  const showRun = !!liveRunId;
  const search = useApp((s) => s.search);
  const t = searchTarget(search);
  const target = t ? { lat: t.lat, lon: t.lon, siteId: t.siteId, label: t.siteId ? zoneName(t.siteId) : t.label } : null;
  return (
    <section aria-labelledby="stage-live" className="pb-2">
      <h3 id="stage-live" className="sr-only">Live discovery</h3>
      {gis.data && gis.data.status !== "available" && (
        <Note tone="info" className="mb-3">GIS discovery is not connected on this server{gis.data.reason ? `: ${gis.data.reason}` : "."}</Note>
      )}
      {running && job && (
        <div className="mb-5">
          <p className="mb-2 text-caption text-faint">
            {discovery!.request.label} · {MISSION_WORDS(job.params.mission)} · the run continues on the server if you leave this page.
          </p>
          <JobProgress job={job} />
        </div>
      )}
      {showRun ? (
        run.isLoading ? <Spinner label="Loading the run" />
          : run.isError ? <Note tone="critical">The run could not be loaded: {(run.error as Error).message}</Note>
          : run.data ? <RunView key={run.data.run_id} run={run.data} /> : null
      ) : (
        <>
          {!running && target && (
            <div className="frame border border-line-strong p-3">
              <p className="text-caption text-muted">
                No discovery is open for {target.label}. A discovery screens every Earth land cell, refines the shortlist as MOLA would observe it, and runs on the server.
              </p>
              <DiscoveryAction className="mt-3" selection={target} />
            </div>
          )}
          <PreviousRuns current={liveRunId} index={running ? "02" : "01"} />
        </>
      )}
    </section>
  );
}
