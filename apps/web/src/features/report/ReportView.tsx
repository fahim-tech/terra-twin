import { Copy, Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Chip, Eyebrow, fmt, Note, pct } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import { selectedCandidate } from "../analogs/candidates";
import { DECISION_COPY } from "../analogs/AnalogResults";
import { DIMENSIONS, tier1Rows } from "../comparison/ComparisonPanel";
import { DIFFERENCES_SOURCE, interpret, PLANETARY_DIFFERENCES } from "../comparison/science";

const REFERENCES = [
  "NASA PDS Geosciences Node: MGS MOLA MEGDR (MGS-M-MOLA-5-MEGDR-L3-V1.0), 128 px/deg counts.",
  "USGS Astrogeology: Mars MGS MOLA DEM 463 m global mosaic.",
  "Copernicus DEM GLO-90 (ESA; AWS Open Data). GMTED2010 (USGS/NGA).",
  "ESA WorldCover 10 m 2021 v200.",
  "Bussey & Hoffman (2016), NASA NTRS 20160001040 — human-class Exploration Zone criteria.",
  "Bodas-Salcedo et al. (2011) BAMS doi:10.1175/2011BAMS2856.1 — satellite-simulator (forward operator) principle.",
  "Kreslavsky & Head (1999) JGR doi:10.1029/1999JE001051; Shepard et al. (2001) JGR doi:10.1029/2000JE001429.",
  "Voigt et al. (2025) PSJ doi:10.3847/PSJ/adb5f1 — Holuhraun–Elysium Planitia analog (positive control).",
];

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ReportView() {
  const { search, candidateId, selection, footprintKm } = useApp();
  const missions = useMissions();
  const [copied, setCopied] = useState(false);
  const c = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);

  const report = useMemo(() => {
    if (!search || !selection) return null;
    const mission = missions.data?.find((m) => m.id === (search.request as { mission?: string }).mission);
    const t1 = c ? tier1Rows(search, c) : null;
    return {
      generated_at: new Date().toISOString(),
      product: "TerraTwin characterization report",
      status: "candidate_identification — not scientific validation of a new analog",
      analysis_id: search.id,
      mars_target: {
        label: selection.label, site: search.mars.site, lat: selection.lat, lon: selection.lon,
        coordinate_convention: "planetocentric latitude, east-positive longitude, Mars sphere R = 3,396,190 m",
        requested_footprint_km: footprintKm,
        analysis_units: { tier1: "25 km cells (EZ median)", tier2: "50 km window" },
        tier1_features: search.mars.tier1_features.map(({ key, value, unit, state, source_id }) => ({ key, value, unit, state, source_id })),
        observation_support: search.mars.observation_support,
      },
      mission: mission ? { id: mission.id, label: mission.label, gate_mode: mission.gate_mode, weights_status: mission.weights_status } : null,
      earth_candidate: c ? {
        id: c.t2?.id ?? c.t1?.region_id, tier: c.tier, lat: c.lat, lon: c.lon, footprint: c.tier === 2 ? "50 km window, 463 m AEQD" : "25 km cell",
        score: c.score, coverage: c.coverage, representation: c.tier === 2 ? search.tier2.representation : "as_measured",
        landcover: c.t2?.landcover ?? null, known_analog_status: c.t1?.known_analog.status ?? c.t2?.kind ?? null, novelty_claim: "not_assessed",
      } : null,
      tier2_decision: search.tier2.decision,
      operator: search.tier2.operator,
      landcover_gate: search.tier2.landcover_gate,
      as_measured_baseline: search.tier2.as_measured_baseline,
      tier1_comparison: t1?.rows.map((r) => ({ ...r, interpretation: interpret(r.key, r.mars, r.earth, r.s).text })) ?? [],
      dimensions_of_analogy: c ? DIMENSIONS(c) : [],
      coverage: {
        tier1_cells_searched: search.tier1?.candidate_pool.n_cells_searched ?? null,
        tier2_pool: search.tier2.candidate_pool,
        live_refinement: search.tier2.live_refinement,
      },
      validation_status: search.tier2.validation_status,
      disclaimers: search.tier2.disclaimers,
      planetary_differences: PLANETARY_DIFFERENCES,
    };
  }, [search, selection, c, missions.data, footprintKm]);

  if (!search || !selection || !report) return <div className="p-10"><Note>Run an analog search to generate a report.</Note></div>;

  const csv = () => {
    const rows = [["section", "key", "mars", "earth", "unit", "similarity_component", "interpretation"]];
    for (const r of report.tier1_comparison) rows.push(["tier1_comparison", r.key, String(r.mars ?? ""), String(r.earth ?? ""), r.unit, String(r.s ?? ""), r.interpretation]);
    rows.push([]);
    rows.push(["candidates", "id", "lat", "lon", "tier", "score", "coverage"]);
    for (const x of search.tier2.candidates) rows.push(["tier2", x.id, String(x.lat), String(x.lon), "2", String(x.S ?? ""), String(x.coverage ?? "")]);
    for (const x of search.tier1?.candidates ?? []) rows.push(["tier1", x.region_id, String(x.lat), String(x.lon), "1", String(x.similarity ?? ""), String(x.coverage)]);
    download(`terratwin-${search.mars.site ?? "target"}-${search.id}.csv`, rows.map((r) => r.map(csvEscape).join(",")).join("\n"), "text/csv");
  };
  const json = JSON.stringify(report, null, 2);
  const d = DECISION_COPY[search.tier2.decision.type];

  return (
    <article className="mx-auto max-w-[860px] px-5 pb-24 pt-10 md:px-10 print:max-w-none print:p-0 print:text-black">
      <div className="no-print mb-8 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Button>
        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy JSON"}</Button>
        <Button variant="outline" onClick={() => download(`terratwin-${search.mars.site ?? "target"}-${search.id}.json`, json, "application/json")}><Download className="h-3.5 w-3.5" /> JSON</Button>
        <Button variant="outline" onClick={csv}><Download className="h-3.5 w-3.5" /> CSV</Button>
      </div>

      <header className="border-b border-line/60 pb-6 print:border-black/20">
        <Eyebrow>TerraTwin characterization report · {new Date(report.generated_at).toUTCString()}</Eyebrow>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">
          <span className="text-mars print:text-black">{selection.label}</span> <span className="text-faint">↔</span> <span className="text-earth print:text-black">{c?.label ?? "no candidate selected"}</span>
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone="warn">Candidate identification — not validation of a new analog</Chip>
          <Chip>{report.mission?.label ?? "mission n/a"}</Chip>
          <Chip tone={d.tone}>{d.title}</Chip>
        </div>
      </header>

      <R title="Targets and geometry">
        <dl className="num grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
          <Row k="Mars target" v={`${formatLat(selection.lat)}, ${formatLon(selection.lon)}`} />
          <Row k="Earth candidate" v={c ? `${formatLat(c.lat)}, ${formatLon(c.lon)}` : "—"} />
          <Row k="Requested footprint" v={`${footprintKm} km (analysis on 25 km cells / 50 km windows)`} />
          <Row k="Earth unit" v={c?.tier === 2 ? "50 km window, 463 m local AEQD" : "25 km GMTED2010 cell"} />
          <Row k="Mars observed bins" v={pct(search.mars.observation_support?.observed_fraction ?? null, 1)} />
          <Row k="Representation" v={c?.tier === 2 ? "Earth as MOLA would observe it at this Mars site" : "As measured (tier 1)"} />
        </dl>
      </R>

      <R title="Similarity">
        <p className="text-[13px] leading-relaxed text-muted">
          {c ? <>Score <span className="num text-ink">{fmt(c.score, undefined, 3)}</span> with coverage {pct(c.coverage)} ({c.tier === 2 ? "OOM research record, equal weights, rotation 0°" : "tier-1 kernel, mission weights"}). </> : null}
          Tier-2 decision: <span className="text-ink">{d.title}</span>{search.tier2.decision.members.length ? ` (${search.tier2.decision.members.join(", ")})` : ""}.
          {search.tier2.as_measured_baseline && <> Uncorrected comparator leader: {search.tier2.as_measured_baseline.leader} (S {fmt(search.tier2.as_measured_baseline.S, undefined, 3)}).</>}
          {" "}A normalized similarity index is not a probability of identical planetary conditions.
        </p>
      </R>

      <R title="Terrain properties">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1.5 font-medium">Factor</th><th className="text-right font-medium">Mars</th><th className="text-right font-medium">Earth</th><th className="pl-4 font-medium">Interpretation</th></tr></thead>
          <tbody>{report.tier1_comparison.map((r) => (
            <tr key={r.key} className="border-t border-line/40 print:border-black/10"><td className="py-1.5">{r.label}</td><td className="num text-right">{fmt(r.mars, r.unit)}</td><td className="num text-right">{fmt(r.earth, r.unit)}</td><td className="pl-4 text-muted">{r.interpretation}</td></tr>))}</tbody>
        </table>
      </R>

      <R title="Dimensions of analogy and physical processes">
        <ul className="space-y-2 text-[12.5px]">{report.dimensions_of_analogy.map((x) => <li key={x.name}><span className="text-ink">{x.name}</span> <span className="text-faint">· {x.status.replace("_", " ")}</span> — <span className="text-muted">{x.detail}</span></li>)}</ul>
        <p className="mt-3 text-[12.5px] text-muted">Physical-process analogy is not established by this analysis. Potential field-testing applications must be confirmed by site review.</p>
      </R>

      <R title="Data provenance and observation support">
        <ul className="space-y-1.5 text-[12.5px] text-muted">
          <li>Mars: USGS MOLA 463 m mosaic (binned altimetry; grid spacing ≠ resolution); MEGDR 128 ppd counts. Operator {search.tier2.operator.status} ({String((search.tier2.operator as { version?: string }).version ?? "")}).</li>
          <li>Earth tier 1: GMTED2010 30″ screen, {search.tier1?.candidate_pool.n_cells_searched.toLocaleString() ?? "—"} cells. Tier 2: {search.tier2.candidate_pool?.n_windows ?? "—"}-window Copernicus GLO-90 research pool.</li>
          <li>Land cover: ESA WorldCover 2021 v200; gate {search.tier2.landcover_gate?.mode ?? "n/a"}; thresholds are working hypotheses.</li>
          <li>Live refinement: {search.tier2.live_refinement.status}{search.tier2.live_refinement.missing_inputs.length ? ` — missing ${search.tier2.live_refinement.missing_inputs.join("; ")}` : ""}.</li>
        </ul>
      </R>

      <R title="Limitations">
        <ul className="space-y-1.5 text-[12.5px] text-muted">
          <li>Terrain geometry only — not geology, formation process, habitability, gravity, atmosphere or radiation.</li>
          <li>Observation-space matching benefit shown on synthetic twins only (MRR 0.30 → 0.97); it fails if the true MOLA operator differs (cubic: 0.54 vs 0.65).</li>
          <li>Rankings depend on window size; tier-2 candidates come from a fixed 230-window research sample, not a worldwide high-resolution search.</li>
          {PLANETARY_DIFFERENCES.map((p) => <li key={p.factor}>{p.factor}: Mars {p.mars} vs Earth {p.earth}.</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-faint">{DIFFERENCES_SOURCE}</p>
      </R>

      <R title="Status of any new-analog claim">
        <p className="text-[12.5px] text-muted">No claim of a previously unrecognized analog is made. Novelty requires literature verification by the research team; absence from the reference set is not evidence of novelty.</p>
      </R>

      <R title="References">
        <ol className="list-decimal space-y-1 pl-5 text-[12px] text-muted">{REFERENCES.map((r) => <li key={r}>{r}</li>)}</ol>
      </R>
    </article>
  );
}

function R({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-line/40 py-6 print:break-inside-avoid print:border-black/10"><h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>{children}</section>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-line/30 py-1"><dt className="text-faint">{k}</dt><dd className="text-right text-ink/90">{v}</dd></div>;
}
