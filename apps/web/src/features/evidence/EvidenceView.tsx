import { useMemo } from "react";
import { Chip, Dot, Eyebrow, Note, pct, Spinner } from "../../components/ui";
import { Plot } from "../../components/Plot";
import { useDatasets, useEvidence } from "../../services/api";

const METHOD_LABEL: Record<string, string> = {
  M0_baseline: "Direct comparison (baseline)",
  M1_qweights: "Coverage-weighted (retired)",
  M3_debias_global: "Constant bias correction",
  M3_debias_perEZ: "Per-site bias correction",
  M2_OOM: "Observation-operator matching",
};
const OP_LABEL: Record<string, string> = { baseline: "None (direct)", primary: "Linear + ½ px", nearest: "Nearest", cubic: "Cubic", no_halfshift: "Linear, no shift", random_mask: "Random mask" };

function Card({ eyebrow, title, children, tag }: { eyebrow: string; title: string; children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <section className="border-t border-line/60 py-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.015em]">{title}</h2></div>
        {tag}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] text-faint">{label}</div>
      <div className="num mt-1 text-[22px] font-semibold tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export default function EvidenceView() {
  const ev = useEvidence();
  const ds = useDatasets();
  const e = ev.data;

  const charts = useMemo(() => {
    if (!e) return null;
    const mrr = (e.synthetic_benchmark.mrr_ci as any[]).slice().sort((a, b) => a.MRR - b.MRR);
    const mrrData = [{
      type: "bar", orientation: "h", x: mrr.map((r) => r.MRR), y: mrr.map((r) => METHOD_LABEL[r.method] ?? r.method),
      marker: { color: mrr.map((r) => (r.method === "M2_OOM" ? "#57BDB4" : r.method === "M1_qweights" ? "#3a4654" : "#5d6b7c")) },
      error_x: { type: "data", symmetric: false, array: mrr.map((r) => r.ci_hi - r.MRR), arrayminus: mrr.map((r) => r.MRR - r.ci_lo), color: "#94A3B5", thickness: 1, width: 3 },
      hovertemplate: "%{y}<br>MRR %{x:.3f}<extra></extra>",
    }];
    const mis = e.falsification.misspecification_mrr as any[];
    const cols = ["baseline", "primary", "nearest", "cubic", "no_halfshift", "random_mask"];
    const z = mis.map((r) => cols.map((c) => r[c]));
    const misData = [{
      type: "heatmap", z, x: cols.map((c) => OP_LABEL[c]), y: mis.map((r) => OP_LABEL[r.true_chain] ?? r.true_chain),
      colorscale: [[0, "#101822"], [0.5, "#2b5f5b"], [1, "#57BDB4"]], zmin: 0.2, zmax: 1, showscale: true,
      colorbar: { thickness: 8, outlinewidth: 0, tickfont: { size: 10 }, title: { text: "MRR", side: "right" } },
      text: z.map((row) => row.map((v: number) => v.toFixed(2))), texttemplate: "%{text}", textfont: { size: 10, color: "#F2F5F8" },
      hovertemplate: "true chain %{y}<br>assumed %{x}<br>MRR %{z:.3f}<extra></extra>",
    }];
    const sup = (e.observation_support.rows as any[]).filter((r) => r.observed_fraction !== null).sort((a, b) => a.observed_fraction - b.observed_fraction);
    const supData = [{
      type: "bar", x: sup.map((r) => r.site.replace(/_/g, " ")), y: sup.map((r) => r.observed_fraction),
      marker: { color: "#EB896A" }, hovertemplate: "%{x}<br>%{y:.1%} of bins observed<extra></extra>",
    }];
    const fid = e.interpolator_selection.rows as any[];
    const fidData = [{
      type: "bar", orientation: "h", x: fid.map((r) => r.paired_abs_error), y: fid.map((r) => `${r.interpolator}${r.halfshift ? " + ½ px" : ""}`),
      marker: { color: fid.map((_r, i) => (i === 0 ? "#57BDB4" : "#5d6b7c")) }, hovertemplate: "%{y}<br>paired error %{x:.3f}<extra></extra>",
    }];
    return { mrrData, misData, supData, fidData };
  }, [e]);

  if (ev.isLoading) return <div className="p-10"><Spinner label="Loading scientific evidence" /></div>;
  if (ev.isError || !e || !charts) return <div className="p-10"><Note tone="critical">Evidence unavailable: {(ev.error as Error)?.message}</Note></div>;

  const tw = e.synthetic_benchmark.twin;
  const ab = e.synthetic_benchmark.abstention;
  const rm = e.real_mars;

  return (
    <div className="mx-auto max-w-[1080px] px-5 pb-24 pt-10 md:px-10">
      <header className="pb-8">
        <Eyebrow className="text-earth/80">Scientific evidence · MOSAIC tier 2</Eyebrow>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em]">{e.method.name}</h1>
        <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed text-muted">{e.method.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip tone="warn">Validated on synthetic terrain twins only</Chip><Chip>{e.method.version}</Chip><Chip>No field or expert validation</Chip>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(e.method.chain as string[]).map((c, i) => (
            <li key={c} className="rounded-xl bg-surface/70 p-3.5 ring-1 ring-line/60">
              <div className="num font-mono text-[10.5px] text-faint">0{i + 1}</div>
              <div className="mt-1 text-[12.5px] text-ink/90">{c}</div>
            </li>
          ))}
        </ol>
        <Note className="mt-5">{e.method.operator_note}.</Note>
      </header>

      <Card eyebrow="Synthetic benchmark" title="Exact-twin recovery on 213 synthetic terrain twins" tag={<Chip tone="warn">synthetic</Chip>}>
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          <Plot label="Mean reciprocal rank by method with 95% bootstrap intervals" data={charts.mrrData} height={230}
            layout={{ xaxis: { range: [0, 1], title: { text: "Mean reciprocal rank (95 % CI)", font: { size: 11 } } }, margin: { l: 210 } }} />
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
            <Stat label="Top-1 recovery, direct" value={pct(tw.M0_baseline.top1)} sub={`MRR ${tw.M0_baseline.MRR.toFixed(3)}`} />
            <Stat label="Top-1 recovery, OOM" value={pct(tw.M2_OOM.top1)} sub={`MRR ${tw.M2_OOM.MRR.toFixed(3)}`} />
          </div>
        </div>
        <Note tone="warning" className="mt-4">Twins were generated with the same modelled observation chain, so this measures the size of the bias and the benefit under a correct or near-correct operator — not real-world analog accuracy.</Note>
      </Card>

      <Card eyebrow="Falsification" title="The method fails when the assumed operator is wrong" tag={<Chip tone="bad">adverse result kept visible</Chip>}>
        <Plot label="Twin recovery MRR when the true observation chain differs from the assumed operator" data={charts.misData} height={260}
          layout={{ margin: { l: 120, b: 70 }, xaxis: { title: { text: "Operator assumed by the matcher", font: { size: 11 } } }, yaxis: { title: { text: "True chain", font: { size: 11 } } } }} />
        <p className="mt-3 text-[12.5px] text-muted">{e.falsification.headline}. The true MEGDR gridding algorithm is undocumented; the linear operator was selected from Mars-observable statistics, not from this benchmark.</p>
      </Card>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Card eyebrow="Operator selection" title="Interpolator chosen from Mars statistics">
          <Plot label="Paired fidelity error by interpolator variant" data={charts.fidData} height={210}
            layout={{ margin: { l: 120 }, xaxis: { title: { text: "Paired error |Δρ| + |Δκ| (lower is better)", font: { size: 11 } } } }} />
          <p className="mt-2 text-[11.5px] text-faint">Mars medians ρ_NS {e.interpolator_selection.mars_medians.rho_ns}, κ_EW {e.interpolator_selection.mars_medians.kap_ew}. Half-pixel registration measured on 39/39 EZs; not yet confirmed by USGS metadata.</p>
        </Card>
        <Card eyebrow="Abstention" title="Named leader or tied set">
          <div className="grid grid-cols-2 gap-5">
            <Stat label="Twins with a named leader" value={`${ab.n_named} / ${ab.n_named + ab.n_abstained}`} sub={`correct ${pct(ab.acc_named, 1)}`} />
            <Stat label="Tied sets containing the twin" value={`${ab.twin_in_tied_set_abstained} / ${ab.n_abstained}`} sub={`median size ${ab.tied_set_size_median_abstained}`} />
            <Stat label="Real EZs, report mode" value={`${rm.ungated.named} / 39`} sub="named leaders, 230-window pool" />
            <Stat label="Real EZs, gate-then-rank" value={`${rm.gated.gated_named} / 39`} sub={`${rm.gated.negative_controls_pass} of 6 negative controls pass`} />
          </div>
          <p className="mt-4 text-[11.5px] text-faint">A leader is named only if it is the same under all four 90° orientations of the Earth window relative to MOLA's north–south tracks.</p>
        </Card>
      </div>

      <Card eyebrow="Observation support" title="How much of Mars was actually observed" tag={<Chip tone="mars">39 Exploration Zones</Chip>}>
        <Plot label="Fraction of native MOLA bins with at least one laser return per Exploration Zone" data={charts.supData} height={240}
          layout={{ yaxis: { tickformat: ".0%", range: [0, 0.45], title: { text: "Bins with ≥ 1 shot", font: { size: 11 } } }, xaxis: { tickangle: -50, tickfont: { size: 9 } }, margin: { b: 100 } }} />
        <p className="mt-2 text-[12px] text-muted">Reported as metadata. It is never used as a confidence or a score weight: coverage-weighting gave no measurable benefit (twin ΔMRR +0.003) and was retired.</p>
      </Card>

      <Card eyebrow="Controls" title="Positive and negative controls">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">Elysium Planitia (Cerberus) · documented volcanic analogs</Eyebrow>
            <table className="w-full text-[12px]"><thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1 text-left font-medium">Control</th><th className="text-right font-medium">Direct</th><th className="text-right font-medium">OOM</th></tr></thead>
              <tbody>{["Holuhraun lava field", "Askja", "Mauna Kea"].map((n) => (
                <tr key={n} className="border-t border-line/40"><td className="py-1.5">{n}</td>
                  <td className="num text-right">#{e.controls.summary.cerberus[`${n}|M0`][0]}</td>
                  <td className="num text-right">#{e.controls.summary.cerberus[`${n}|OOM`][0]}</td></tr>))}</tbody></table>
            <p className="mt-2 text-[11.5px] text-faint">Ranks among 230 windows. The verified lava-field analog is not recovered at 50 km — terrain geometry is not geology.</p>
          </div>
          <div>
            <Eyebrow className="mb-2">Six vegetated negative controls</Eyebrow>
            <p className="text-[12.5px] leading-relaxed text-muted">Terrain-only matching alone places some negative controls in a flat target's top 10 ({e.controls.summary.neg_top10.OOM} of 36 pairs with OOM). The mission-conditional land-cover gate removes all six before ranking for field-test missions; McMurdo has no WorldCover data and is therefore not cleared.</p>
          </div>
        </div>
      </Card>

      <Card eyebrow="Geographic coverage" title="What was actually searched">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="Tier 1 · global coarse screen" value={e.coverage.tier1.n_cells.toLocaleString()} sub={`${e.coverage.tier1.cell_km} km cells · ${e.coverage.tier1.source}`} />
          <Stat label="Tier 2 · OOM research pool" value={String(e.coverage.tier2.n_windows)} sub={`${e.coverage.tier2.window_km} km windows · fixed sample`} />
          <Stat label="Mars targets with full evidence" value={String(e.coverage.mars.n_targets)} sub={e.coverage.mars.scope} />
        </div>
        <Note className="mt-5">{e.novelty.wording} ({e.novelty.status}). {e.novelty.site_novelty}</Note>
      </Card>

      <Card eyebrow="Limitations" title="Known limitations">
        <ul className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          {(e.limitations as { code: string; text: string }[]).map((l) => (
            <li key={l.code} className="flex gap-3 text-[12.5px] leading-relaxed text-muted"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-warn" />{l.text}</li>
          ))}
        </ul>
      </Card>

      <Card eyebrow="Data provenance" title="Datasets and integrity">
        {ds.data ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {ds.data.integrity_checks.map((c) => <Chip key={c.name} tone={c.ok ? "ok" : "bad"} title={c.detail}>{c.name.replace(/_/g, " ")}</Chip>)}
            </div>
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1.5 font-medium">Dataset</th><th className="hidden font-medium md:table-cell">Role</th><th className="font-medium">Status</th></tr></thead>
              <tbody>{ds.data.datasets.map((d) => (
                <tr key={d.id} className="border-t border-line/40 align-top">
                  <td className="py-2 pr-3"><div className="text-ink/90">{d.url ? <a className="hover:underline" href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</div>
                    {d.coverage && <div className="mt-0.5 text-[11px] text-faint">{d.coverage}</div>}</td>
                  <td className="hidden py-2 pr-3 text-muted md:table-cell">{d.role}</td>
                  <td className="py-2"><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-muted">
                    <Dot tone={d.status === "imported" ? "ok" : d.status === "missing" ? "bad" : d.status === "partial" ? "warn" : "muted"} />{d.status.replace("_", " ")}</span></td>
                </tr>))}</tbody>
            </table>
            {ds.data.research_import && (
              <p className="num mt-4 font-mono text-[10.5px] text-faint">{ds.data.research_import.package} · sha256 {ds.data.research_import.package_sha256.slice(0, 16)}… · imported {ds.data.research_import.imported_at}</p>
            )}
          </>
        ) : <Spinner label="Loading datasets" />}
      </Card>
      <p className="text-[11px] text-faint">All numbers on this page are read from the research package tables (oom_key_numbers.json, oom_gated_key_numbers.json and CSVs). Gate thresholds and verdict cut-offs are working hypotheses.</p>
    </div>
  );
}
