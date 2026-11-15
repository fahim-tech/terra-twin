/**
 * Dossier section bodies. Every figure is read from the stored search (or the evidence record); missing
 * values show as missing, never as 0. Numerals are set in the mono face throughout.
 */
import type { ReactNode } from "react";
import { Measure, Tag, Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import { screenCellKm } from "../analogs/candidates";
import { DIFFERENCES_SOURCE, PLANETARY_DIFFERENCES } from "../comparison/science";
import {
  decisionHeadline, decisionLabel, decisionMemberRows, dimensions, type EvidenceRecord, fmtLat, fmtLon, limitations, REFERENCES,
  representationLabel, type ReportCandidate, terrainRows, windowLabel,
} from "./model";
import { DecisionMark, DISPLAY, Numerals, type ReadoutItem, ReadoutGrid, StatusMark, statusWord } from "./parts";
import { RatioChart } from "./RatioChart";
import { indexLabel } from "./typeset";

const N = ({ children }: { children: ReactNode }) => <span className="num">{children}</span>;

// ------------------------------------------------------------------------------- research comparison

export function ResearchSummary({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t2 = search.tier2;
  const d = t2.decision;
  const pool = t2.candidate_pool as { n_windows?: number; n_random_stratified?: number; n_named_controls?: number; n_ranked?: number; ranked_basis?: string; window_km?: number } | null;
  const diag = (t2 as { diagnostics?: { footprint_leader_same_50_vs_25km?: boolean } }).diagnostics;
  const op = t2.operator as { status: string; mask?: string };
  const b = t2.as_measured_baseline;
  const members = decisionMemberRows(search);
  const current = c?.tier === 2 ? c.id : null;

  const items: ReadoutItem[] = [];
  if (pool) {
    items.push({
      key: "pool", label: "Candidate pool", value: <><N>{pool.n_windows ?? "—"}</N> fixed research windows</>,
      note: pool.n_random_stratified !== undefined
        ? <><N>{pool.n_random_stratified}</N> stratified random + <N>{pool.n_named_controls ?? "—"}</N> named controls · <N>{pool.window_km ?? "—"}</N> km</>
        : undefined,
    });
  }
  if (pool?.n_ranked !== undefined) {
    items.push({ key: "ranked", label: "Ranked", value: <><N>{pool.n_ranked}</N> of <N>{pool.n_windows ?? "—"}</N> windows</>, note: pool.ranked_basis ? <Numerals text={pool.ranked_basis} /> : undefined });
  }
  items.push({
    key: "operator", label: <Term k="operator">MOLA observation model</Term>,
    value: op.status === "ok" ? "Applied" : "Unavailable at this coordinate",
    note: op.status === "ok" ? (op.mask ? <Numerals text={op.mask} /> : undefined) : "No comparison is made",
  });
  items.push({
    key: "orientation", label: "Orientation check",
    value: d.rotations_checked > 0 ? <><N>{d.rotations_checked}</N> orientations of the Earth window</> : "Not run",
    note: d.rotations_checked > 0 ? <>S is reported at rotation <N>0°</N>, equal weights</> : undefined,
  });
  if (b) {
    items.push({ key: "baseline", label: "Uncorrected comparator", value: <><Numerals text={windowLabel(b.leader)} /> · S <Measure value={b.S} digits={3} /></>, note: <>{representationLabel("as_measured")}. Not a fallback.</> });
  }
  if (diag?.footprint_leader_same_50_vs_25km === false) {
    items.push({ key: "robust", label: "Robustness", value: <>Leader differs with <N>25</N> km windows</>, note: <Numerals text={G5.scale} /> });
  }

  return (
    <div className="space-y-6">
      {/* The key figures carry the decision for a research window or no candidate; a screening cell needs it here. */}
      {c?.tier === 1 && (
        <div>
          <div className="text-title text-ink"><DecisionMark type={d.type} className="mr-2 -translate-y-px" /><Numerals text={decisionHeadline(search)} /><span className="font-normal text-muted"> — research decision for this zone</span></div>
          {decisionLabel(search) && <p className="mt-1 max-w-[68ch] text-body text-muted">{decisionLabel(search)}</p>}
        </div>
      )}
      {members.length > 0 && d.type === "tied_set" && (
        <div>
          <div className="kicker">Equivalent windows · unordered, listed west to east</div>
          <table className="mt-2 w-full border-collapse text-left">
            <caption className="sr-only">Equivalent windows of the tie, unordered, listed west to east</caption>
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="kicker py-2 pr-4">Window</th>
                <th scope="col" className="kicker py-2 pr-4 text-right">Latitude</th>
                <th scope="col" className="kicker py-2 pr-4 text-right">Longitude</th>
                <th scope="col" className="py-2"><span className="sr-only">In this dossier</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line">
                  <th scope="row" className={cx("py-2.5 pr-4 text-label font-medium", m.id === current ? "text-earth" : "text-ink")}><Numerals text={m.label} /></th>
                  <td className="num whitespace-nowrap py-2.5 pr-4 text-right text-num text-muted">{m.lat === null ? "—" : fmtLat(m.lat, 2)}</td>
                  <td className="num whitespace-nowrap py-2.5 pr-4 text-right text-num text-muted">{m.lon === null ? "—" : fmtLon(m.lon, 2)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right">{m.id === current ? <span className="kicker !text-earth">This dossier</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {members.length > 0 && d.type !== "tied_set" && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="kicker">Leader</span>
          <span className={cx(DISPLAY, "text-[22px] leading-none tracking-[0.04em] text-earth")}>{members.map((m) => m.label).join(", ")}</span>
          {members.length === 1 && members[0].lat !== null && members[0].lon !== null && (
            <span className="num text-num text-muted">{fmtLat(members[0].lat, 3)} {fmtLon(members[0].lon, 3)}</span>
          )}
        </div>
      )}
      <ReadoutGrid items={items} />
    </div>
  );
}

// ------------------------------------------------------------------------------------- global screen

export function ScreenSummary({ search, c }: { search: AnalogSearch; c: ReportCandidate | null }) {
  const t1 = search.tier1!;
  const s = t1.summary;
  return (
    <div>
      <ReadoutGrid cols={3} items={[
        { key: "cells", label: "Cells searched", value: <><N>{t1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</N> land cells</>, note: <><N>{t1.candidate_pool.cell_size_km}</N> km · {t1.candidate_pool.source.split(/\s/)[0]}</> },
        { key: "top", label: "Top screen similarity", value: <Measure value={s.leader_similarity} digits={3} />, note: "Earth as measured; not the research S" },
        { key: "near", label: "Near the top", value: <><N>{s.n_within_0p05_of_leader}</N> cells within <N>0.05</N></>, note: "Not ranked against each other" },
      ]} />
      <p className="mt-4 max-w-[72ch] text-caption text-faint"><Numerals text={`${t1.candidate_pool.coverage_note} ${t1.disclaimer}`} /></p>
      {c?.tier === 2 && <p className="mt-2 text-caption text-faint">The selected candidate is a research window; the global screen is reported here as context only.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------- terrain comparison

export function terrainAside(search: AnalogSearch): string {
  const cellKm = screenCellKm(search);
  return `Global-screen descriptors${cellKm !== null ? `, ${cellKm} km` : ""}, as measured — context, not the research score`;
}

export function TerrainComparison({ search, c }: { search: AnalogSearch; c: ReportCandidate }) {
  const terrain = terrainRows(search, c);
  const cellKm = screenCellKm(search);
  const reason = (c.t2?.features as { mars_reason?: string } | undefined)?.mars_reason;
  if (!terrain) return <p className="text-body text-muted">No screening descriptors are available for this candidate.</p>;
  return (
    <>
      <p className="mb-5 max-w-[72ch] text-body text-muted">
        {c.tier === 2
          ? <>Earth values come from the {cellKm !== null ? <><N>{cellKm}</N> km </> : ""}screening cell that contains this window, as measured. Its screen similarity is <Measure value={terrain.S} digits={3} className="text-ink" /> — a different basis from the research S <Measure value={c.score} digits={3} className="text-ink" />.</>
          : <>Each row compares the Mars zone median with this cell, both on the shared {cellKm !== null ? <><N>{cellKm}</N> km </> : ""}screening operator, Earth as measured.</>}
      </p>
      <RatioChart rows={terrain.rows} />
      {c.tier === 2 && <p className="mt-4 max-w-[72ch] text-caption text-faint">Per-descriptor research values (Earth as MOLA would observe it) are not loaded.{reason ? <> <Numerals text={reason} /></> : null}</p>}
    </>
  );
}

// --------------------------------------------------------------------------------------- dimensions

export function Dimensions({ c, cellKm }: { c: ReportCandidate; cellKm: number | null }) {
  return (
    <>
      <ul className="border-t border-line-strong">
        {dimensions(c, cellKm).map((d) => (
          <li key={d.name} className="grid items-baseline gap-x-6 gap-y-1.5 border-b border-line py-3 sm:grid-cols-[230px_128px_1fr]">
            <div className="flex items-baseline gap-2.5">
              <StatusMark status={d.status} />
              <span className="text-label text-ink">{d.name}</span>
            </div>
            <div><Tag className={cx("translate-y-[-1px]", d.status !== "not_evaluated" && "!text-ink")}>{statusWord(d.status)}</Tag></div>
            <div className="text-body text-muted"><Numerals text={d.detail} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-[72ch] text-body text-muted">Physical-process analogy is not established by this analysis. Potential field-testing applications must be confirmed by site review.</p>
    </>
  );
}

// ---------------------------------------------------------------------------- planetary differences

export function Differences() {
  return (
    <>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Planetary differences between Mars and Earth</caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="kicker w-[30%] py-2 pr-4">Factor</th>
            <th scope="col" className="py-2 pr-4"><span className="kicker inline-flex items-center gap-2 !text-mars"><span aria-hidden className="h-1.5 w-1.5 bg-mars [print-color-adjust:exact]" />Mars</span></th>
            <th scope="col" className="py-2"><span className="kicker inline-flex items-center gap-2 !text-earth"><span aria-hidden className="h-1.5 w-1.5 bg-earth [print-color-adjust:exact]" />Earth</span></th>
          </tr>
        </thead>
        <tbody>
          {PLANETARY_DIFFERENCES.map((p) => (
            <tr key={p.factor} className="border-b border-line align-baseline">
              <th scope="row" className="py-2.5 pr-4 text-label font-medium text-ink">{p.factor}</th>
              <td className="py-2.5 pr-4 text-body text-muted"><Numerals text={p.mars} /></td>
              <td className="py-2.5 text-body text-muted"><Numerals text={p.earth} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-faint">Source: {DIFFERENCES_SOURCE}</p>
    </>
  );
}

// ---------------------------------------------------------------------------------------- provenance

export function Provenance({ search }: { search: AnalogSearch }) {
  const t2 = search.tier2;
  const op = t2.operator as { status: string; version?: string; interpolator?: string; registration?: string; half_pixel_blend?: boolean; reason?: string };
  const os = search.mars.observation_support;
  const gate = t2.landcover_gate;
  const res = search.mars.tier1_features.find((f) => typeof f.native_resolution_m === "number")?.native_resolution_m ?? null;
  const resM = res !== null && res !== undefined ? Math.round(res) : null;
  return (
    <dl className="border-t border-line-strong">
      <Row k="Mars elevation">
        {resM !== null
          ? <>USGS MOLA <N>{resM}</N> m global mosaic (binned altimetry; grid spacing is not resolution).</>
          : <>USGS MOLA global mosaic — no Mars terrain was measured for this target.</>}
      </Row>
      <Row k="Mars observation support">
        {os?.observed_fraction !== null && os?.observed_fraction !== undefined
          ? <><Measure value={os.observed_fraction * 100} unit="%" digits={0} /> of bins hold a laser return (<Numerals text={os.source_grid} />). Metadata, not a confidence weight.</>
          : "Not available for this target."}
      </Row>
      <Row k="Observation model">
        {op.status === "ok"
          ? <>Version <N>{op.version ?? "—"}</N> · {op.interpolator ?? "—"}{op.half_pixel_blend ? " · ½-pixel blend" : ""}{op.registration ? <span className="mt-0.5 block text-caption text-faint">Registration <Numerals text={op.registration} /></span> : null}</>
          : <>Unavailable at this coordinate. No comparison is made.</>}
      </Row>
      <Row k="Earth screen">
        {search.tier1
          ? <><Numerals text={search.tier1.candidate_pool.source} />; <N>{search.tier1.candidate_pool.n_cells_searched.toLocaleString("en-US")}</N> cells of <N>{search.tier1.candidate_pool.cell_size_km}</N> km; method <N>{search.tier1.method_version}</N>; weights {String((search.tier1 as { weights_status?: string }).weights_status ?? "—")}.</>
          : "Not run for this target."}
      </Row>
      <Row k="Earth research pool">
        {t2.candidate_pool
          ? <>Copernicus DEM GLO-90, <N>{t2.candidate_pool.n_windows}</N> windows of <N>{t2.candidate_pool.window_km}</N> km{resM !== null ? <>, resampled to the <N>{resM}</N> m MOLA grid</> : null}.</>
          : "No research pool for this target."}
      </Row>
      <Row k="Land cover">
        ESA WorldCover 2021 v200{gate ? <> · {gate.mode === "exclude" ? "applied before ranking" : "reported only, never excludes"} · bare-like ≥ <N>{gate.bare_min.toFixed(2)}</N>, vegetated ≤ <N>{gate.veg_max.toFixed(2)}</N> (working hypotheses)</> : <> · not used for this search</>}.
      </Row>
      <Row k="Live refinement">
        {t2.live_refinement.status === "unavailable" ? "Not available" : t2.live_refinement.status}
        {t2.live_refinement.missing_inputs.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-caption text-faint">{t2.live_refinement.missing_inputs.map((m) => <li key={m}>Missing: <Numerals text={m} /></li>)}</ul>
        )}
      </Row>
      <Row k="Plate imagery">NASA Mars Trek and NASA GIBS tiles via the app globes — visualization only.</Row>
    </dl>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[230px_1fr] sm:gap-6">
      <dt className="kicker pt-[3px] !text-muted">{k}</dt>
      <dd className="text-body text-ink/90">{children}</dd>
    </div>
  );
}

// --------------------------------------------------------------------------- limitations, references

export function Limitations({ search, evidence }: { search: AnalogSearch; evidence: EvidenceRecord | null | undefined }) {
  return (
    <ol className="border-t border-line-strong">
      {limitations(search, evidence).map((l, i) => (
        <li key={l.code} className="grid grid-cols-[44px_1fr] gap-3 border-b border-line py-3 text-body">
          <span className="num text-num text-faint">L{indexLabel(i + 1)}</span>
          <Numerals text={l.text} className={l.verbatim ? "text-ink" : "text-muted"} />
        </li>
      ))}
    </ol>
  );
}

export function References() {
  return (
    <ol className="border-t border-line-strong">
      {REFERENCES.map((r, i) => (
        <li key={r} className="grid grid-cols-[44px_1fr] gap-3 border-b border-line py-2.5 text-caption text-muted">
          <span className="num text-faint">[{i + 1}]</span>
          <span>{r}</span>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------------------------- empty plate

export function NoCandidatePlate({ hasCandidates, screenRan, decision }: { hasCandidates: boolean; screenRan: boolean; decision: AnalogSearch["tier2"]["decision"]["type"] }) {
  const go = useApp((s) => s.go);
  // With nothing to choose, the next step is a supported research location, not the empty candidate list.
  const why = hasCandidates
    ? "No Earth candidate is selected, so no Earth location is shown."
    : decision === "insufficient_evidence"
      ? `There is not enough evidence for a research comparison here${screenRan ? "" : ", and no global screen ran"}, so there is no Earth location to show.`
      : "This search returned no Earth candidates, so there is no Earth location to show.";
  return (
    <figure className="m-0 min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="num shrink-0 text-num-sm text-ink">PLATE B</span>
          <span className="kicker truncate !text-earth">Earth · No candidate</span>
        </span>
      </div>
      <div className="frame relative mt-3 p-[22px] [--frame-l:12px]">
        <div className="grid aspect-[4/3] w-full place-items-center bg-surface p-6 text-center ring-1 ring-inset ring-line-strong">
          <div>
            <p className="mx-auto max-w-[34ch] text-body text-muted">{why}</p>
            {hasCandidates
              ? <Button variant="outline" className="no-print mt-5" onClick={() => go("earth")}>Choose a candidate →</Button>
              : <Button variant="outline" className="no-print mt-5" onClick={() => go("mars")}>Choose a research zone →</Button>}
          </div>
        </div>
      </div>
      <figcaption className="mt-1">
        <div className={cx(DISPLAY, "text-[20px] leading-tight tracking-[0.04em] text-muted")}>{hasCandidates ? "No candidate selected" : "No Earth candidates"}</div>
        <div className="mt-1.5 text-caption text-faint">{hasCandidates ? "The dossier reports the search only." : "Research comparisons run inside the supported Mars research zones."}</div>
      </figcaption>
    </figure>
  );
}
