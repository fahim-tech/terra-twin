import { useEffect, useMemo, useState } from "react";
import { SFigure, StatusMark as SharedStatus } from "../../components/marks";
import { Term as GlobalTerm } from "../../components/primitives";
import { ExaggerationSwitch, GridFacts, ReliefNotice, ReliefView, unavailableWords, type Exaggeration } from "../../components/relief";
import { cx, pct, Spinner } from "../../components/ui";
import { useLayout } from "../../app/useLayout";
import { G5 } from "../../lib/glossary";
import { ApiError, useMarsRelief } from "../../services/api";
import { useWindowRelief, windowReliefId } from "../../services/gis";
import { useApp } from "../../store/app";
import type { Relief } from "../../types/contracts";
import { disclaimerText, formatValue, scopeText } from "../analogs/discoveryModel";
import { CompareNotice, CompareStrip } from "./ComparisonPanel";
import { CompareTerm as Term } from "./CompareTerm";
import {
  asMeasured, descriptorRows, liveBasis, liveGate, liveMarsKind, liveMarsName, liveOrigin, liveRatioRows, liveTargets, liveVerdict, liveVersions, liveView,
  type LivePair, numAt, rotationRange, rotationScores, strAt,
} from "./live";
import { PlanetMark, SectionRule } from "./marks";
import { type CompareTargets, keepFigures } from "./model";
import { VerdictLine } from "./Readout";
import { applications, RelevanceMode } from "./RelevanceMode";
import { Half, PlanetSwitch } from "./relief";
import { groupRows } from "./science";
import type { LiveCompare } from "./useLive";
import { BriefShell, Li, List, Note, Pair, Rows, Section } from "./WhyDrawer";

/**
 * Compare for a live discovery window: the same strip, plates and modes as a research window, every figure read
 * from the run payload. Measurements is the run's per-descriptor table (Mars, Earth as MOLA would observe it,
 * Earth as measured); Evidence the four orientations and the land-cover gate; 3D relief the run's own GLO-90
 * window (`/api/gis/windows/relief`) beside the Mars zone grid.
 */
export function LiveComparison({ live }: { live: Exclude<LiveCompare, { state: "off" }> }) {
  const phone = useLayout() === "phone";
  const go = useApp((s) => s.go);
  if (live.state === "loading") {
    return <CompareNotice phone={phone} title="Loading the discovery run" body={<Spinner label="Reading the run record" />} />;
  }
  if (live.state === "error") {
    return <CompareNotice phone={phone} title="Discovery run unavailable" body={`The run record could not be read: ${live.message}`}
      action={{ label: "Back to Earth results", earth: true, onClick: () => go("earth") }} />;
  }
  if (live.state === "missing") {
    return <CompareNotice phone={phone} title="Window not in this run" body="The selected window is not one of this run's refined windows. Choose a refined window in the Discovery tab."
      action={{ label: "Back to Earth results", earth: true, onClick: () => go("earth") }} />;
  }
  return <LiveStrip pair={live.pair} phone={phone} />;
}

function LiveStrip({ pair, phone }: { pair: LivePair; phone: boolean }) {
  const { r, c, run } = pair;
  const targets = useMemo(() => liveTargets(pair), [pair]);
  const verdict = useMemo(() => liveVerdict(pair), [pair]);
  const view = useMemo(() => liveView(pair), [pair]);
  const basis = keepFigures(liveBasis(pair));

  useEffect(() => {
    useApp.getState().announce(`Comparing ${targets.mars.name} on Mars with a discovery window on Earth. ${verdict.headline}. Similarity ${c.S === null ? "not available" : c.S.toFixed(3)}, ${basis}.`);
  }, [targets, verdict, c, basis]);

  return (
    <CompareStrip c={view} basis={basis} targets={targets} verdict={verdict}
      why={(onClose) => <LiveWhy key="why" pair={pair} phone={phone} onClose={onClose} />}
      renderMode={(mode, header) => (
        <>
          {mode === "measurements" && (
            <>
              {header(keepFigures(`${r.window_km} km windows · the descriptors this run's S was computed from (Earth as MOLA would observe it)`),
                keepFigures(`Mars: the run's target window from the MOLA mosaic; Earth: the Copernicus GLO-90 window, shown both as MOLA would observe it and as measured. Run ${run.run_id}.`))}
              <DescriptorTable pair={pair} />
            </>
          )}
          {mode === "evidence" && (
            <>
              {header(keepFigures(`Live discovery · ${r.window_km} km windows · run ${run.run_id}`))}
              <LiveEvidence pair={pair} />
            </>
          )}
          {mode === "relevance" && (
            <>
              {header("What the comparison does and does not cover")}
              <RelevanceMode c={view} gate={liveGate(r)} mars={{ lat: targets.mars.lat, lon: targets.mars.lon }} />
            </>
          )}
          {mode === "relief" && (
            <>
              {header()}
              <LiveRelief pair={pair} targets={targets} phone={phone} />
            </>
          )}
        </>
      )} />
  );
}

// ---------------------------------------------------------------- measurements

/** The run's descriptors for this pair: Mars | Earth as MOLA would observe it | Earth as measured | per-descriptor s. */
export function DescriptorTable({ pair, className }: { pair: LivePair; className?: string }) {
  const rows = descriptorRows(pair.c);
  if (!rows.length) return <p className="text-body text-muted">The run record holds no descriptor values for this window.</p>;
  const th = "kicker py-1.5 pr-3 text-right align-bottom font-normal";
  return (
    <div className={cx("max-w-[920px] overflow-x-auto scroll-thin", className)}>
      <table className="w-full min-w-[560px] text-left text-caption">
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="kicker py-1.5 pr-3 align-bottom font-normal">Descriptor</th>
            <th scope="col" className={th}><span className="inline-flex items-center gap-1.5"><PlanetMark planet="mars" />Mars</span></th>
            <th scope="col" className={th}><span className="inline-flex items-center gap-1.5"><PlanetMark planet="earth" />Earth · as MOLA would observe it</span></th>
            <th scope="col" className={th}>Earth · as measured</th>
            <th scope="col" className={cx(th, "pr-0")}>s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key} className="border-t border-line first:border-t-0">
              <th scope="row" className="py-1.5 pr-3 text-left text-label font-normal text-ink">{d.label}</th>
              <td className="num py-1.5 pr-3 text-right text-num-sm text-ink">{formatValue(d.mars, d.unit)}</td>
              <td className="num py-1.5 pr-3 text-right text-num-sm text-ink">{formatValue(d.oom, d.unit)}</td>
              <td className="num py-1.5 pr-3 text-right text-num-sm text-muted">{formatValue(d.measured, d.unit)}</td>
              <td className="num py-1.5 text-right text-num-sm text-muted">{formatValue(d.s, "", 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 border-t border-line pt-2 text-caption text-faint">
        S is computed on Mars and Earth as MOLA would observe it; the as-measured column is shown for reference only. s is the kernel's per-descriptor similarity (1 = equal). — means the run record has no value.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- evidence

function LiveEvidence({ pair }: { pair: LivePair }) {
  const { r, c } = pair;
  const rot = rotationScores(c);
  const range = rotationRange(c);
  const gate = liveGate(r);
  const lc = c.landcover;
  const am = asMeasured(c);
  const op = r.operator as Record<string, unknown>;
  const badge = r.decision.type === "named_leader" ? G5.leader : r.decision.type === "tied_set" ? G5.tied : null;
  return (
    <div className="grid gap-x-10 gap-y-6 @min-[900px]:grid-cols-2">
      <section aria-label="Similarity by orientation">
        <SectionRule title="By orientation" as="h4" aside="Earth window relative to MOLA tracks" className="mb-2" />
        {rot.length ? (
          <ul className="border-y border-line">
            {rot.map((s, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 border-t border-line/70 py-1.5 first:border-t-0">
                <span className="text-label text-ink">Orientation <span className="num">{i + 1}</span></span>
                <SFigure value={s} missing="no score" className="text-num text-ink" />
              </li>
            ))}
          </ul>
        ) : <p className="text-caption text-muted">The run record holds no per-orientation scores for this window.</p>}
        {range && <p className="mt-2 text-caption text-muted">Range over orientations <span className="num text-ink">{range[0].toFixed(3)}</span> to <span className="num text-ink">{range[1].toFixed(3)}</span>.</p>}
        {badge && <p className="mt-1.5 text-caption text-faint">Run decision: {badge}.</p>}
      </section>

      <section aria-label="Land-cover gate">
        <SectionRule title="Land-cover gate" as="h4" aside={gate?.status ? `thresholds: ${gate.status}` : undefined} className="mb-2" />
        {lc ? (
          <dl className="space-y-1.5 text-caption">
            <Pair term="Gate">
              <span className="inline-flex items-baseline gap-2 text-ink">
                <SharedStatus state={lc.gate === "pass" ? "on" : lc.gate === "fail" ? "struck" : "off"} className="translate-y-[-1px]" />
                {lc.gate ? lc.gate.replace(/_/g, " ") : "—"}
              </span>
              {lc.reason && <span className="text-muted"> · {lc.reason}</span>}
            </Pair>
            <Pair term="Cover"><span className="num text-ink">{pct(lc.frac_bare_like ?? null)}</span> bare-like · <span className="num text-ink">{pct(lc.frac_vegetated ?? null)}</span> vegetated</Pair>
            {gate && <Pair term="Rule">bare-like ≥ <span className="num">{pct(gate.bare_min)}</span> and vegetated ≤ <span className="num">{pct(gate.veg_max)}</span>{gate.mode ? <> · {gate.mode} </> : " "}(ESA WorldCover 2021)</Pair>}
          </dl>
        ) : <p className="text-caption text-muted">The run record has no land-cover result for this window.</p>}
      </section>

      <section aria-label="As-measured comparator">
        <SectionRule title="Without observation matching" as="h4" aside="diagnostic" className="mb-2" />
        <dl className="space-y-1.5 text-caption">
          <Pair term="S"><SFigure value={am.S} missing="not in the record" className="text-num text-ink" /> · Earth {G5.toggleMeasured}</Pair>
          <Pair term="Rank">{am.rank !== null ? <span className="num text-ink">{am.rank}</span> : "—"}{am.label && <span className="text-faint"> · {am.label}</span>}</Pair>
        </dl>
        <p className="mt-2 text-caption text-faint">Scores of other window sizes are not comparable with these ({G5.scale.toLowerCase()}).</p>
      </section>

      <section aria-label="Observation operator">
        <SectionRule title="Observation operator" as="h4" aside={strAt(op, "version") ?? undefined} className="mb-2" />
        <dl className="space-y-1.5 text-caption">
          <Pair term="Status">{r.operator.status === "ok" ? "Applied" : "Not applied"}{strAt(op, "status_note") && <span className="text-faint"> · {strAt(op, "status_note")}</span>}</Pair>
          <Pair term="Mars">Observed fraction <span className="num text-ink">{pct(numAt(r.target as Record<string, unknown>, "observed_fraction_native"))}</span> of MOLA cells. See <Term k="operator" />.</Pair>
        </dl>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 3D relief

function LiveRelief({ pair, targets, phone }: { pair: LivePair; targets: CompareTargets; phone: boolean }) {
  const { r, c } = pair;
  const zone = pair.zone;
  const earth = useWindowRelief({ lat: c.lat, lon: c.lon });
  const mars = useMarsRelief(zone);
  const [ve, setVe] = useState<Exaggeration>(4);
  const [side, setSide] = useState<"mars" | "earth">("earth");
  const scene = phone ? 250 : 300;
  const notice = scene + 28;
  const earth404 = earth.isError && earth.error instanceof ApiError && earth.error.status === 404;
  const earthWhy = earth.isError ? (earth404 ? "This window's elevation grid is not cached on this server." : `The elevation grid could not be read: ${(earth.error as Error).message}`) : null;
  const marsWhy = !zone ? `Mars relief is served per research zone, and this run's target is ${r.target.site ? "not one of them" : "a free point"}: there is no zone grid.` : mars.isError ? unavailableWords("mars", mars.error instanceof ApiError ? mars.error : { message: (mars.error as Error).message }).plain : null;
  const both = !!earth.data && !!mars.data;

  const half = (p: "mars" | "earth") => p === "mars" ? (
    <Half planet="mars" name={targets.mars.name} kind={liveMarsKind(pair)} relief={mars.data ?? null}>
      {zone && !mars.isError ? (
        <ReliefView planet="mars" id={zone} title={targets.mars.name} density="compact" controls="deck" sceneHeight={scene}
          wheel="modifier" exaggeration={ve} onExaggerationChange={setVe} exaggerationControl={!both} />
      ) : (
        <ReliefNotice planet="mars" title="No Mars elevation grid" height={notice}>
          <p className="text-body text-ink">{marsWhy}</p>
          <p className="mt-1.5">No other surface is shown in its place.</p>
        </ReliefNotice>
      )}
    </Half>
  ) : (
    <Half planet="earth" name={targets.earth.name} kind="Discovery window" relief={earth.data ?? null}>
      {earth.data ? (
        // The grid is already in the relief cache under this id (useWindowRelief), so the view draws it without refetching.
        <ReliefView key={windowReliefId(c.lat, c.lon)} planet="earth" id={windowReliefId(c.lat, c.lon)} title={targets.earth.name} density="compact" controls="deck"
          sceneHeight={scene} wheel="modifier" exaggeration={ve} onExaggerationChange={setVe} exaggerationControl={!both} />
      ) : earth.isError ? (
        <ReliefNotice planet="earth" title={earth404 ? "Window not cached" : "No relief grid"} height={notice}>
          <p className="text-body text-ink">{earthWhy}</p>
          <p className="mt-1.5">Windows are never extracted on request. No other terrain is shown in its place.</p>
        </ReliefNotice>
      ) : (
        <div className="grid place-items-center border border-line-strong bg-[#030405]" style={{ height: notice }}><Spinner label="Loading the elevation grid" /></div>
      )}
    </Half>
  );

  return (
    <div className="min-w-0">
      {phone ? (
        <>
          <PlanetSwitch value={side} onChange={setSide} />
          <div className="mt-2.5">{half(side)}</div>
        </>
      ) : (
        <>
          {both && (
            <div className="mb-2.5 flex items-center justify-end gap-3">
              <span aria-hidden className="text-caption text-muted">Same vertical exaggeration on both halves</span>
              <ExaggerationSwitch value={ve} onChange={setVe} label={<><span aria-hidden>V.E.</span><span className="sr-only">Vertical exaggeration, the same on both halves</span></>} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">{half("mars")}{half("earth")}</div>
        </>
      )}
      <ReliefCaption earth={earth.data ?? null} earthLine={earthWhy ?? "Loading the elevation grid."} mars={mars.data ?? null} marsLine={marsWhy ?? "Checking for a Mars elevation grid."} ve={ve} both={both} />
    </div>
  );
}

function ReliefCaption({ earth, earthLine, mars, marsLine, ve, both }: { earth: Relief | null; earthLine: string; mars: Relief | null; marsLine: string; ve: Exaggeration; both: boolean }) {
  const row = "grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-1.5";
  return (
    <dl className="mt-3 divide-y divide-line border-y border-line text-caption [&_button]:text-left">
      <div className={row}>
        <dt className="kicker !text-earth">Earth</dt>
        <dd className="text-muted">
          {earth ? (
            <>
              {earth.source.representation === "as_measured"
                ? <>Earth terrain: {G5.toggleMeasured} — the <GlobalTerm k="operator">MOLA observation model</GlobalTerm> is not applied · </>
                : <>{G5.toggleOom} · </>}
              {earth.source.title} · <GridFacts relief={earth} />
            </>
          ) : earthLine}
        </dd>
      </div>
      <div className={row}>
        <dt className="kicker !text-mars">Mars</dt>
        <dd className="text-muted">{mars ? <>Mars as measured · {mars.source.title} · <GridFacts relief={mars} /></> : marsLine}</dd>
      </div>
      {(earth || mars) && (
        <div className={row}>
          <dt className="kicker">Scale</dt>
          <dd className="text-muted">{both ? <>Same vertical exaggeration on both halves: <span className="num text-ink">×{ve}</span>.</> : <>Vertical exaggeration <span className="num text-ink">×{ve}</span>.</>}</dd>
        </div>
      )}
      <div className={row}>
        <dt className="kicker">Score</dt>
        <dd className="text-muted">The run's score uses “{G5.toggleOom}”.</dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------- Why brief

/** "Why this analog?" for a live window: what is true of this run, read from its payload. No research-record claims. */
function LiveWhy({ pair, phone, onClose }: { pair: LivePair; phone: boolean; onClose: () => void }) {
  const { r, c, run } = pair;
  const v = liveVerdict(pair);
  const g = groupRows(liveRatioRows(c));
  const sel = r.shortlist_selection as Record<string, unknown> | undefined;
  const cov = r.coarse_index_coverage as Record<string, unknown> | undefined;
  const sq = r.source_quality as Record<string, unknown> | undefined;
  const skipped = (sel?.skipped ?? null) as Record<string, number> | null;
  const versions = liveVersions(r);
  const origin = liveOrigin(c);
  const gate = liveGate(r);
  let n = 0;
  const next = () => ++n;
  const fmt = (x: number | null) => (x === null ? "—" : x.toLocaleString("en-US"));
  return (
    <BriefShell phone={phone} onClose={onClose} role="Discovery window" name={liveTargets(pair).earth.name} sub={origin}
      lat={c.lat} lon={c.lon} footprint={`${r.window_km} km discovery window`}>
      <Section index={next()} title="Decision" basis={`live discovery run ${run.run_id}`}>
        <div className="border border-line-strong bg-space/50">
          <div className="flex items-center justify-between gap-4 border-b border-line px-3.5 py-2.5">
            <VerdictLine verdict={v} className="min-w-0" />
            <SFigure value={c.S} missing="no score" className="shrink-0 text-[22px] leading-none text-ink" />
          </div>
          <div className="px-3.5 py-2.5">
            <p className="text-caption text-ink/90">{v.detail}</p>
            <dl className="mt-2 space-y-1 text-caption">
              <Pair term="Basis">{keepFigures(liveBasis(pair))}</Pair>
              <Pair term="Validation">{G5.validation}.</Pair>
            </dl>
          </div>
        </div>
      </Section>

      <Section index={next()} title="Scope of the search" basis="run record">
        <dl className="space-y-1.5 text-caption">
          <Pair term="Pool">{scopeText(r.candidate_pool_scope)}</Pair>
          <Pair term="Refined"><span className="num text-ink">{r.number_of_windows_refined}</span> windows of <span className="num">{r.window_km}</span> km, each compared as MOLA would observe it</Pair>
          {sel && (
            <Pair term="Shortlist">
              {strAt(sel, "source") ?? "Tier-1 rank order"}
              {numAt(sel, "tier1_top_n_considered") !== null && <> · top <span className="num">{fmt(numAt(sel, "tier1_top_n_considered"))}</span> screening cells considered</>}
              {numAt(sel, "n_selected") !== null && <> · <span className="num">{fmt(numAt(sel, "n_selected"))}</span> of <span className="num">{fmt(numAt(sel, "n_requested"))}</span> selected</>}
              {numAt(sel, "min_separation_km") !== null && <> · windows at least <span className="num">{numAt(sel, "min_separation_km")}</span> km apart</>}
              {skipped && Object.keys(skipped).length > 0 && (
                <span className="mt-0.5 block text-faint">Skipped: {Object.entries(skipped).map(([k, x]) => `${k.replace(/_/g, " ")} ${x}`).join(" · ")}</span>
              )}
            </Pair>
          )}
          {cov && (
            <Pair term="Screen">
              <span className="num">{fmt(numAt(cov, "n_cells_scored"))}</span> of <span className="num">{fmt(numAt(cov, "n_cells_total"))}</span> cells scored
              {strAt(cov, "statement") && <span className="block text-faint">{strAt(cov, "statement")}</span>}
            </Pair>
          )}
          {origin && <Pair term="This window">{origin}</Pair>}
        </dl>
      </Section>

      <Section index={next()} title="Similar" basis="run descriptors · Earth as MOLA would observe it">
        {g.similar.length ? <Rows rows={g.similar} /> : <Note>No descriptor falls inside the kernel tolerance.</Note>}
      </Section>

      <Section index={next()} title="Different" basis={gate ? "run descriptors; surface cover from ESA WorldCover 2021" : "run descriptors"}>
        {g.different.length ? <Rows rows={g.different} /> : <Note>None outside the kernel tolerance.</Note>}
        {c.landcover?.gate === "fail" && c.landcover.reason && <Note>Surface cover: {c.landcover.reason}</Note>}
        {g.missing.map((x) => <Note key={x.key}>{x.label}: not comparable, a value is missing.</Note>)}
      </Section>

      <Section index={next()} title="Processes" basis="not established">
        <List><Li>Terrain-shape similarity does not show that the same processes formed both surfaces. That needs geological evidence and expert review.</Li></List>
      </Section>

      <Section index={next()} title="Applications" basis="to be verified">
        <List>{applications(liveView(pair), gate).map((a) => <Li key={a.text}>{a.text} <span className="text-faint">Basis: {a.basis}.</span></Li>)}</List>
      </Section>

      <Section index={next()} title="Limits" basis="run record">
        <List>
          {r.disclaimers.map((d) => <Li key={d}>{disclaimerText(d)}.</Li>)}
          {(r.limitations ?? []).map((l) => <Li key={l}>{l}</Li>)}
        </List>
      </Section>

      <Section index={next()} title="Evidence" basis="data sources">
        <dl className="space-y-2 text-caption">
          <Pair term="Mars">MOLA target window for {liveMarsName(r)}; observed fraction <span className="num text-ink/90">{pct(numAt(r.target as Record<string, unknown>, "observed_fraction_native"))}</span>. See <Term k="operator" />.</Pair>
          <Pair term="Earth">{sq ? <>{strAt(sq, "dem_source") ?? "—"}; land cover {strAt(sq, "landcover_source") ?? "—"}; median valid fraction <span className="num text-ink/90">{pct(numAt(sq, "median_valid_fraction"))}</span></> : "The run record does not state its sources."}</Pair>
          <Pair term="Method">Live discovery, not the research record. The run payload does not say whether this window is a documented analog; novelty is not assessed.</Pair>
          <Pair term="Versions"><span className="num">{[versions.method, versions.processing, versions.contract].filter(Boolean).join(" · ") || "—"}</span></Pair>
        </dl>
      </Section>
    </BriefShell>
  );
}
