import { Check, Copy, Download, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Kicker, Measure, Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import { resultsAreStale, searchTarget, type SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { DIFFERENCES_SOURCE, PLANETARY_DIFFERENCES } from "../comparison/science";
import { LocationPlate, PLATE_HEIGHT_KM, type PlateFrame } from "./LocationPlate";
import {
  buildCsv, buildReportJson, candidateRole, DECISION, decisionHeadline, decisionLabel, decisionMembers, dimensions,
  exportBaseName, fmtCoord, limitations, REFERENCES, representationLabel, resolveCandidate, terrainRows, windowLabel,
  type ReportCandidate,
} from "./model";
import { RatioChart } from "./RatioChart";

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const GATE_EFFECT = { exclude: "Vegetated ground is removed before ranking", report: "Land cover is reported, never used to rank" } as const;

export default function ReportView() {
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const selection = useApp((s) => s.selection);
  const target = useMemo(() => searchTarget(search), [search]);
  const c = useMemo(() => resolveCandidate(search, candidateId), [search, candidateId]);

  if (!search || !target) return <NoReport />;
  return <Dossier search={search} target={target} c={c} stale={resultsAreStale(search, selection)} liveLabel={selection?.label ?? null} />;
}

function NoReport() {
  const go = useApp((s) => s.go);
  return (
    <article className="mx-auto max-w-[1040px] px-4 pb-24 pt-14 md:px-10">
      <Kicker>TerraTwin dossier</Kicker>
      <h1 data-stage-heading="report" tabIndex={-1} className="toponym mt-3 text-toponym text-ink outline-none md:text-display">No report yet</h1>
      <p className="mt-4 max-w-[52ch] text-lead text-muted">A dossier is built from an Earth analog search. Choose a research zone on Mars and run Find Earth Analogs; the report then describes that search.</p>
      <Button variant="primary-mars" className="mt-6" onClick={() => go("mars")}>Go to the Mars explorer</Button>
    </article>
  );
}

function Dossier({ search, target, c, stale, liveLabel }: { search: AnalogSearch; target: SearchTarget; c: ReportCandidate | null; stale: boolean; liveLabel: string | null }) {
  const missions = useMissions();
  const mission = missions.data?.find((m) => m.id === target.mission) ?? null;
  const generatedAt = useMemo(() => new Date().toISOString(), [search.id, c?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const t2 = search.tier2;
  const role = c ? candidateRole(search, c) : null;
  const gateMode = t2.landcover_gate?.mode ?? mission?.gate_mode ?? null;

  const kicker = !c ? "Search summary · no candidate selected"
    : c.tier === 1 ? "Global screening cell (screen rank, not a decision)"
    : "Research comparison";

  // Plates: the Mars window at the search target; the Earth unit at the candidate. Identical frame styling.
  const marsFrame: PlateFrame = c?.tier === 1
    ? { nsKm: 25, ewKm: 25, label: "25 km cell scale · zone median" }
    : t2.operator.status === "ok"
      ? { nsKm: t2.target.window_km, ewKm: t2.target.window_km, label: `${t2.target.window_km} km research window` }
      : { nsKm: target.footprintKm, ewKm: target.footprintKm, label: `${target.footprintKm} km requested footprint` };
  const earthFrame: PlateFrame | null = !c ? null : c.tier === 1
    ? { nsKm: c.t1!.footprint.cell_km_ns, ewKm: c.t1!.footprint.cell_km_ew, label: "25 km screening cell" }
    : { nsKm: c.t2!.window_km, ewKm: c.t2!.window_km, label: `${c.t2!.window_km} km research window` };

  return (
    <article className="mx-auto max-w-[1040px] px-4 pb-28 pt-8 md:px-10 md:pt-12 print:max-w-none print:px-0 print:pt-0 print:pb-0">
      <ReportPrintStyles />

      {/* Title block */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <Kicker className="pt-1">TerraTwin dossier · {kicker}</Kicker>
          <Exports search={search} c={c} mission={mission} generatedAt={generatedAt} />
        </div>
        <h1 data-stage-heading="report" tabIndex={-1} className="toponym mt-5 text-balance text-[40px] leading-[1.04] tracking-[-0.02em] text-ink outline-none md:text-display">
          <span>{target.label}</span>
          <span className="mx-[0.28em] text-faint" aria-label="compared with">↔</span>
          {c ? <span>{c.label}</span> : <span className="text-muted">No candidate selected</span>}
        </h1>
        <p className="mt-4 flex items-start gap-2 text-lead text-warn">
          <span aria-hidden className="mt-[1px]">⚠</span>
          <span>Candidate identification — not validation of a new analog</span>
        </p>
        <dl className="mt-5 grid gap-x-8 gap-y-3 text-caption sm:grid-cols-2 lg:grid-cols-4">
          <Meta k="Mission">{mission?.label ?? target.mission.replace(/_/g, " ")}{gateMode ? <span className="block text-faint">{GATE_EFFECT[gateMode]}</span> : null}</Meta>
          <Meta k="Mars target"><span className="num text-num">{fmtCoord(target.lat, target.lon, 3)}</span><span className="block text-faint">{target.siteId ? "Research zone" : "Outside research zones"} · planetocentric, east-positive</span></Meta>
          <Meta k="Analysis units"><span className="text-ink">50 km research windows · 25 km screening cells</span><span className="block text-faint">Requested footprint <span className="num">{target.footprintKm}</span> km</span></Meta>
          <Meta k="Generated"><span className="num text-num">{generatedAt.slice(0, 16).replace("T", " ")} UTC</span><span className="block truncate text-faint">Analysis <span className="num">{search.id}</span></span></Meta>
        </dl>
        {stale && (
          <p className="mt-5 rounded-control bg-elevated px-3.5 py-2.5 text-body text-muted print:bg-transparent print:px-0" role="note">
            <span className="text-warn" aria-hidden>⚠ </span>This dossier describes <span className="text-ink">{target.label}</span>, the target of the last search. The current selection{liveLabel ? <> (<span className="text-ink">{liveLabel}</span>)</> : null} has moved on; run Find Earth Analogs again to report it.
          </p>
        )}
      </header>

      {/* Location plates */}
      <section aria-label="Location plates" className="mt-10 break-inside-avoid">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <LocationPlate planet="mars" lat={target.lat} lon={target.lon} frame={marsFrame} kicker={target.siteId ? "Mars · Research zone" : "Mars · Search target"} name={target.label} imagery="NASA Mars Trek imagery" />
          {c && earthFrame ? (
            <LocationPlate planet="earth" lat={c.lat} lon={c.lon} frame={earthFrame} kicker={c.tier === 1 ? "Earth · Screening cell" : role === "tie_member" ? "Earth · Tie member" : "Earth · Research window"} name={c.label} imagery="NASA GIBS imagery" />
          ) : (
            <NoCandidatePlate />
          )}
        </div>
        <p className="mt-4 text-caption text-faint">
          NASA Mars Trek / NASA GIBS imagery — visualization only. Rendered from the planet globes at <span className="num">{PLATE_HEIGHT_KM}</span> km, north up; frames are drawn at the nadir scale and are approximate. Imagery is never used in any measurement.
        </p>
      </section>

      <KeyFigures search={search} c={c} />

      <div className="mt-4">
        <Section title="Research comparison" aside="Tier 2 · observation-operator matching">
          <ResearchSummary search={search} c={c} />
        </Section>

        {search.tier1 && (
          <Section title="Global screen" aside="Tier 1 · coarse screening, as measured">
            <ScreenSummary search={search} c={c} />
          </Section>
        )}

        {c && <TerrainSection search={search} c={c} />}

        {c && (
          <Section title="Dimensions of analogy" aside="What this analysis can and cannot speak to">
            <ul className="divide-y divide-line">
              {dimensions(c).map((d) => (
                <li key={d.name} className="grid gap-1 py-2.5 sm:grid-cols-[220px_1fr] sm:gap-6">
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full", d.status === "evaluated" ? "bg-ink" : d.status === "partial" ? "bg-gradient-to-r from-ink from-50% to-transparent to-50% ring-1 ring-inset ring-ink" : "ring-1 ring-inset ring-faint")} />
                    <span className="text-label text-ink">{d.name}</span>
                  </div>
                  <div className="text-body text-muted"><span className={cx("text-caption", d.status === "not_evaluated" ? "text-faint" : "text-ink")}>{d.status === "evaluated" ? "Evaluated" : d.status === "partial" ? "Partial" : "Not evaluated"}</span> · {d.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-body text-muted">Physical-process analogy is not established by this analysis. Potential field-testing applications must be confirmed by site review.</p>
          </Section>
        )}

        <Section title="Planetary differences" aside="No Earth site reproduces these">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead><tr className="text-caption text-faint"><th className="pb-2 pr-4 font-medium">Factor</th><th className="pb-2 pr-4 font-medium text-mars">Mars</th><th className="pb-2 font-medium text-earth">Earth</th></tr></thead>
              <tbody>
                {PLANETARY_DIFFERENCES.map((p) => (
                  <tr key={p.factor} className="border-t border-line align-baseline">
                    <td className="py-2 pr-4 text-label text-ink">{p.factor}</td>
                    <td className="py-2 pr-4 text-body text-muted">{p.mars}</td>
                    <td className="py-2 text-body text-muted">{p.earth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-caption text-faint">{DIFFERENCES_SOURCE}</p>
        </Section>

        <Section title="Provenance" aside="Data, operator and coverage">
          <Provenance search={search} />
        </Section>

        <Section title="Limitations" aside="Required statements, verbatim">
          <ol className="space-y-2.5">
            {limitations(search).map((l, i) => (
              <li key={l.code} className="grid grid-cols-[24px_1fr] gap-2 text-body">
                <span className="num text-num text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className={l.verbatim ? "text-ink" : "text-muted"}>{l.text}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="New-analog claims" aside="Status">
          <p className="max-w-[68ch] text-body text-muted">No claim of a previously unrecognised analog is made. Novelty requires literature verification by the research team; absence from the reference set is not evidence of novelty.</p>
        </Section>

        <Section title="References">
          <ol className="space-y-1.5">
            {REFERENCES.map((r, i) => (
              <li key={r} className="grid grid-cols-[24px_1fr] gap-2 text-caption text-muted">
                <span className="num text-faint">{i + 1}.</span><span>{r}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <footer className="mt-10 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-caption text-faint">
        <span>TerraTwin · AstroSUST · NASA Space Apps 2026</span>
        <span>Research method <span className="num">{String((t2 as { method_version?: string }).method_version ?? (t2.operator as { version?: string }).version ?? "—")}</span></span>
        {search.tier1 && <span>Screen <span className="num">{search.tier1.method_version}</span></span>}
        <span>Analysis <span className="num">{search.id}</span></span>
      </footer>
    </article>
  );
}

function Meta({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-faint">{k}</dt>
      <dd className="mt-0.5 text-label text-ink">{children}</dd>
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 pt-10 md:grid-cols-[200px_1fr] print:break-inside-avoid-page print:pt-7">
      <div>
        <h2 className="toponym text-toponym-sm text-ink">{title}</h2>
        {aside && <p className="mt-1 text-caption text-faint">{aside}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function NoCandidatePlate() {
  const go = useApp((s) => s.go);
  return (
    <figure className="m-0 min-w-0">
      <div className="grid aspect-[4/3] w-full place-items-center rounded-surface bg-elevated/60 p-6 text-center ring-1 ring-inset ring-line">
        <div>
          <div className="kicker !text-earth">Earth · No candidate</div>
          <p className="mx-auto mt-3 max-w-[30ch] text-body text-muted">No Earth candidate is selected, so no Earth location is shown.</p>
          <Button variant="outline" className="no-print mt-4" onClick={() => go("earth")}>Choose a candidate</Button>
        </div>
      </div>
      <figcaption className="mt-3">
        <div className="toponym text-toponym-sm text-muted">No candidate selected</div>
        <div className="mt-1 text-caption text-faint">The dossier reports the search only.</div>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------------------------- key figures

function KeyFigures({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t2 = search.tier2;
  const d = t2.decision;
  const role = c ? candidateRole(search, c) : null;
  const t1weights = (search.tier1 as { weights_status?: string } | null)?.weights_status;

  let decision: ReactNode;
  if (c?.tier === 1) {
    decision = (
      <Fig label="Screen rank" value={<span className="num">#{c.t1!.rank}</span>}
        note={<>Global screening cell — a screen rank, not a decision. Research decision for this zone: {DECISION[d.type].glyph} {decisionHeadline(search)}.</>} />
    );
  } else {
    decision = (
      <Fig label="Decision" value={<span className="font-sans text-[22px] font-semibold tracking-[-0.01em]"><span aria-hidden className="mr-1.5 font-normal">{DECISION[d.type].glyph}</span>{decisionHeadline(search)}</span>}
        note={<>
          {decisionLabel(search)}
          {role === "tie_member" && <span className="mt-1 block text-ink">This window is one member of the tie — not a winner.</span>}
          {role === "research_window" && d.members.length > 0 && <span className="mt-1 block text-ink">This window is not a decision member.</span>}
        </>} />
    );
  }

  const scoreBasis = !c ? (d.type === "insufficient_evidence" ? "No score — not enough evidence" : "No candidate selected; no score is reported")
    : c.tier === 2 ? <>Research comparison · {representationLabel(t2.representation)}{role === "tie_member" ? " · does not rank tie members" : ""}</>
    : <>Global screen · Earth as measured · 25 km · mission-weighted</>;

  return (
    <section aria-label="Key figures" className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7 border-y border-line py-6 lg:grid-cols-[1.35fr_1fr_0.8fr_1.2fr] print:break-inside-avoid">
      <div className="col-span-2 lg:col-span-1">{decision}</div>
      <Fig label={<Term k="similarity">{c?.tier === 1 ? "Screen similarity" : "Similarity S"}</Term>}
        value={<Measure value={c ? c.score : null} digits={3} className="text-figure text-ink" />}
        note={scoreBasis} />
      <Fig label={<Term k="measures">Measures</Term>}
        value={c && c.measures.used !== null ? <span className="num">{c.measures.used}/{c.measures.of}</span> : <span className="num text-faint">—</span>}
        note={c ? (c.tier === 2 ? "Research descriptors computed for this window" : "Screening descriptors computed for this cell") : "No candidate"} />
      <Fig label="Validation"
        value={<span className="font-sans text-[22px] font-semibold tracking-[-0.01em]">{c?.tier === 1 ? "Not validated" : t2.validation_status === "synthetic_twins_only" ? "Synthetic only" : t2.validation_status.replace(/_/g, " ")}</span>}
        note={c?.tier === 1 ? <>Screening weights are {t1weights === "hypothesis" ? "working hypotheses" : t1weights ?? "unvalidated"}. {G5.validation}</> : G5.validation} />
    </section>
  );
}

function Fig({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-caption text-muted">{label}</div>
      <div className="mt-1 text-figure leading-[1.15] text-ink">{value}</div>
      {note && <div className="mt-2 max-w-[44ch] text-caption text-faint">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------- sections

function ResearchSummary({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t2 = search.tier2;
  const d = t2.decision;
  const pool = t2.candidate_pool as { n_windows?: number; n_random_stratified?: number; n_named_controls?: number; n_ranked?: number; ranked_basis?: string; window_km?: number } | null;
  const diag = (t2 as { diagnostics?: { footprint_leader_same_50_vs_25km?: boolean } }).diagnostics;
  const b = t2.as_measured_baseline;
  const members = decisionMembers(search);
  const currentLabel = c?.tier === 2 ? c.label : null;
  return (
    <div className="space-y-4">
      <div>
        {/* The key figures already carry the decision for a research window or no candidate; a screening cell needs it here. */}
        {(c?.tier === 1 || d.type === "insufficient_evidence") && (
          <>
            <div className="text-title text-ink"><span aria-hidden className="mr-1.5 font-normal">{DECISION[d.type].glyph}</span>{decisionHeadline(search)}{c?.tier === 1 && <span className="font-normal text-muted"> — research decision for this zone</span>}</div>
            {decisionLabel(search) && <p className="mt-1 max-w-[68ch] text-body text-muted">{decisionLabel(search)}</p>}
          </>
        )}
        {members.length > 0 && (
          <div className="mt-3">
            <div className="text-caption text-faint">{d.type === "tied_set" ? "Equivalent windows (unordered)" : "Leader"}</div>
            {d.type === "tied_set" ? (
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {members.map((m) => (
                  <li key={m} className={cx("rounded-control px-2.5 py-1 text-label", m === currentLabel ? "bg-earth/12 text-earth" : "bg-elevated text-ink")}>
                    {m}{m === currentLabel ? <span className="text-caption"> · this report</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="toponym mt-0.5 text-toponym-sm text-earth">{members.join(", ")}</div>
            )}
          </div>
        )}
      </div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Meta k="Candidate pool">
          <span className="num">{pool?.n_windows ?? "—"}</span> fixed research windows
          {pool?.n_random_stratified !== undefined && <span className="block text-caption text-faint"><span className="num">{pool.n_random_stratified}</span> stratified random + <span className="num">{pool.n_named_controls}</span> named controls · <span className="num">{pool.window_km ?? 50}</span> km</span>}
        </Meta>
        <Meta k="Ranked">
          {pool?.n_ranked !== undefined ? <><span className="num">{pool.n_ranked}</span> of <span className="num">{pool.n_windows}</span> windows</> : "—"}
          {pool?.ranked_basis && <span className="block text-caption text-faint">{pool.ranked_basis}</span>}
        </Meta>
        <Meta k={<Term k="operator">MOLA observation model</Term>}>
          {t2.operator.status === "ok" ? "Applied" : "Unavailable at this coordinate"}
          <span className="block text-caption text-faint">{t2.operator.status === "ok" ? `${(t2.operator as { mask?: string }).mask ?? ""}` : "No comparison is made"}</span>
        </Meta>
        <Meta k="Orientation check">
          {d.rotations_checked > 0 ? <><span className="num">{d.rotations_checked}</span> orientations of the Earth window</> : "Not run"}
          <span className="block text-caption text-faint">S is reported at rotation <span className="num">0°</span>, equal weights</span>
        </Meta>
        {b && (
          <Meta k="Uncorrected comparator">
            {windowLabel(b.leader)} · S <Measure value={b.S} digits={3} className="text-num" />
            <span className="block text-caption text-faint">{representationLabel("as_measured")}. Not a fallback.</span>
          </Meta>
        )}
        {diag?.footprint_leader_same_50_vs_25km === false && (
          <Meta k="Robustness">
            Leader differs with 25 km windows
            <span className="block text-caption text-faint">{G5.scale}</span>
          </Meta>
        )}
      </dl>
    </div>
  );
}

function ScreenSummary({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t1 = search.tier1!;
  const s = t1.summary;
  return (
    <div>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <Meta k="Cells searched"><span className="num">{t1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</span> land cells<span className="block text-caption text-faint"><span className="num">{t1.candidate_pool.cell_size_km}</span> km · GMTED2010</span></Meta>
        <Meta k="Top screen similarity"><Measure value={s.leader_similarity} digits={3} className="text-num" /><span className="block text-caption text-faint">Earth as measured; not the research S</span></Meta>
        <Meta k="Near the top"><span className="num">{s.n_within_0p05_of_leader}</span> cells within <span className="num">0.05</span><span className="block text-caption text-faint">Not ranked against each other</span></Meta>
      </dl>
      <p className="mt-3 max-w-[68ch] text-caption text-faint">{t1.candidate_pool.coverage_note} {t1.disclaimer}</p>
      {c?.tier === 2 && <p className="mt-2 text-caption text-faint">The selected candidate is a research window; the global screen is reported here as context only.</p>}
    </div>
  );
}

function TerrainSection({ search, c }: { search: AnalogSearch; c: ReportCandidate }) {
  const terrain = terrainRows(search, c);
  const reason = (c.t2?.features as { mars_reason?: string } | undefined)?.mars_reason;
  return (
    <Section title="Terrain comparison" aside="Global-screen descriptors, 25 km, as measured — context, not the research score">
      {terrain ? (
        <>
          <p className="mb-4 max-w-[68ch] text-body text-muted">
            {c.tier === 2
              ? <>Earth values come from the 25 km screening cell that contains this window, as measured. Its screen similarity is <Measure value={terrain.S} digits={3} className="text-num text-ink" /> — a different basis from the research S <Measure value={c.score} digits={3} className="text-num text-ink" />.</>
              : <>Each row compares the Mars zone median with this cell, both on the shared 25 km screening operator, Earth as measured.</>}
          </p>
          <RatioChart rows={terrain.rows} />
          {c.tier === 2 && <p className="mt-3 max-w-[68ch] text-caption text-faint">Per-descriptor research values (Earth as MOLA would observe it) are not loaded.{reason ? ` ${reason}` : ""}</p>}
        </>
      ) : (
        <p className="text-body text-muted">No screening descriptors are available for this candidate.</p>
      )}
    </Section>
  );
}

function Provenance({ search }: { search: AnalogSearch }) {
  const t2 = search.tier2;
  const op = t2.operator as { status: string; version?: string; interpolator?: string; mask?: string; registration?: string };
  const os = search.mars.observation_support;
  const gate = t2.landcover_gate;
  return (
    <dl className="divide-y divide-line">
      <Prov k="Mars elevation">USGS MOLA 463 m global mosaic (binned altimetry; grid spacing is not resolution).</Prov>
      <Prov k="Mars observation support">
        {os?.observed_fraction !== null && os?.observed_fraction !== undefined ? <><Measure value={os.observed_fraction * 100} unit="%" digits={0} className="text-num" /> of 463 m bins hold a laser return (MEGDR 128 ppd counts). Metadata, not a confidence weight.</> : "Not available for this target."}
      </Prov>
      <Prov k="Observation model">
        {op.status === "ok" ? <>Version <span className="num">{op.version ?? "—"}</span> · {op.interpolator ?? "—"} · ½-pixel blend{op.registration ? <span className="block text-faint">Registration {op.registration}</span> : null}</> : <>Unavailable at this coordinate. No comparison is made.</>}
      </Prov>
      <Prov k="Earth screen">{search.tier1 ? <>{search.tier1.candidate_pool.source}; <span className="num">{search.tier1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</span> cells; method <span className="num">{search.tier1.method_version}</span>; weights {String((search.tier1 as { weights_status?: string }).weights_status ?? "—")}.</> : "Not run for this target."}</Prov>
      <Prov k="Earth research pool">Copernicus DEM GLO-90, <span className="num">{t2.candidate_pool?.n_windows ?? "—"}</span> windows of <span className="num">{t2.candidate_pool?.window_km ?? 50}</span> km on a 463 m local grid.</Prov>
      <Prov k="Land cover">ESA WorldCover 2021 v200{gate ? <> · {gate.mode === "exclude" ? "applied before ranking" : "reported only, never excludes"} · bare-like ≥ <span className="num">{gate.bare_min.toFixed(2)}</span>, vegetated ≤ <span className="num">{gate.veg_max.toFixed(2)}</span> (working hypotheses)</> : null}.</Prov>
      <Prov k="Live refinement">
        {t2.live_refinement.status === "unavailable" ? "Not available" : t2.live_refinement.status}
        {t2.live_refinement.missing_inputs.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-caption text-faint">{t2.live_refinement.missing_inputs.map((m) => <li key={m}>Missing: {m}</li>)}</ul>
        )}
      </Prov>
      <Prov k="Plate imagery">NASA Mars Trek and NASA GIBS tiles via the app globes — visualization only.</Prov>
    </dl>
  );
}

function Prov({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-label text-ink">{k}</dt>
      <dd className="text-body text-muted">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ exports

function Exports({ search, c, mission, generatedAt }: { search: AnalogSearch; c: ReportCandidate | null; mission: Parameters<typeof buildReportJson>[2]; generatedAt: string }) {
  const announce = useApp((s) => s.announce);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const json = () => JSON.stringify(buildReportJson(search, c, mission, generatedAt), null, 2);
  const base = exportBaseName(search);
  return (
    <div role="toolbar" aria-label="Export report" className="no-print -my-1 flex flex-wrap items-center gap-1">
      <Button variant="ghost" onClick={async () => {
        try {
          await navigator.clipboard.writeText(json());
          setCopied(true); announce("Report JSON copied to the clipboard");
          clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600);
        } catch { announce("Could not copy — use Download JSON instead", true); }
      }}>
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copied" : "Copy JSON"}
      </Button>
      <Button variant="ghost" onClick={() => { download(`${base}.json`, json(), "application/json"); announce("Report JSON downloaded"); }}>
        <Download className="h-3.5 w-3.5" aria-hidden />Download JSON
      </Button>
      <Button variant="ghost" onClick={() => { download(`${base}.csv`, buildCsv(search, c), "text/csv"); announce("Report CSV downloaded"); }}>
        <Download className="h-3.5 w-3.5" aria-hidden />Download CSV
      </Button>
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" aria-hidden />Print
      </Button>
    </div>
  );
}

/** Feature-local print rules (index.css already swaps the colour tokens to the light print palette). */
function ReportPrintStyles() {
  return (
    <style>{`
      @media print {
        @page { margin: 14mm 14mm 16mm; }
        main > div.absolute.inset-0.z-20 { background: #fff !important; }
        [data-stage-heading="report"] { font-size: 40px !important; }
        img { break-inside: avoid; }
      }
    `}</style>
  );
}
