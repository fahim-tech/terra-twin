import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Disclosure, Kicker, Tag, Term, Toponym } from "../../components/primitives";
import { Button, cx, Spinner } from "../../components/ui";
import { G5, zoneName } from "../../lib/glossary";
import { useDatasets, useEvidence, type DatasetsResponse } from "../../services/api";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import { AbstentionSplit, FalsificationChart, InterpolatorChart, MethodChart, Stat, SupportStrip } from "./charts";
import { buildModel, fmtInt, fmtNum, fmtPct, type EvidenceModel } from "./model";
import { jumpTo } from "./jump";
import { ProcessFigure } from "./ProcessFigure";

const SECTIONS = [
  ["ev-process", "Method"],
  ["ev-benchmark", "Benchmark"],
  ["ev-falsification", "Falsification"],
  ["ev-selection", "Operator choice"],
  ["ev-support", "Observation support"],
  ["ev-abstention", "Abstention"],
  ["ev-controls", "Controls"],
  ["ev-coverage", "Coverage"],
  ["ev-limitations", "Limitations"],
  ["ev-provenance", "Provenance"],
] as const;

export default function EvidenceView() {
  const ev = useEvidence();
  const ds = useDatasets();
  const search = useApp((s) => s.search);
  const target = searchTarget(search);
  const announce = useApp((s) => s.announce);
  const model = useMemo(() => (ev.data ? buildModel(ev.data) : null), [ev.data]);

  // The shell focuses the stage heading shortly after navigation; if this lazily loaded page was not
  // mounted yet, take focus here so keyboard and screen-reader users still land on the heading.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>('[data-stage-heading="evidence"]');
      const active = document.activeElement;
      if (h && (!active || active === document.body)) h.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const said = useRef<string | null>(null);
  useEffect(() => {
    const state = ev.isError ? "error" : model ? "ready" : null;
    if (!state || said.current === state) return;
    said.current = state;
    if (state === "error") announce("Evidence could not be loaded.", true);
    else announce("Evidence loaded: synthetic validation results, falsification and limitations.");
  }, [ev.isError, model, announce]);

  return (
    <article className="mx-auto max-w-[1040px] px-4 pb-28 pt-10 sm:px-8 md:pt-14">
      <header>
        <Kicker>Research method · synthetic validation only</Kicker>
        <Toponym as="h1" size="md" data-stage-heading="evidence" tabIndex={-1} style={{ outline: "none" }} className="mt-3 text-[34px] leading-[1.05] sm:text-[44px]">
          Observation-operator matching
        </Toponym>
        {model?.method.summary && <p className="mt-4 max-w-[64ch] text-lead text-muted">{model.method.summary}</p>}
        {model && (
          <p className="mt-3 text-caption text-faint">
            {model.method.name}{model.method.version && <> · <span className="num">{model.method.version}</span></>} · used for the <Term k="researchComparison" /> · not validated against field data or expert review
          </p>
        )}
        {target && (
          <p className="mt-3 text-caption text-muted">
            <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full bg-mars align-middle" />
            Your search · <span className="text-ink">{target.siteId ? zoneName(target.siteId) : target.label}</span>
            {target.siteId ? " is marked in the observation-support chart." : " is outside the research zones; this method has no record there."}
          </p>
        )}
      </header>

      {ev.isLoading && <div className="py-16"><Spinner label="Loading the research evidence" /></div>}
      {ev.isError && (
        <div className="py-16" role="alert">
          <div className="text-title text-ink"><span aria-hidden className="mr-1.5 text-bad">⊘</span>Evidence unavailable</div>
          <p className="mt-1 max-w-[60ch] text-body text-muted">The research evidence could not be loaded from the API. No figures are shown rather than stale or invented ones.</p>
          <p className="num mt-2 text-num-sm text-faint">{(ev.error as Error)?.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => ev.refetch()}>Retry</Button>
        </div>
      )}

      {model && <Body m={model} ds={ds.data} dsLoading={ds.isLoading} dsError={ds.isError} targetSite={target?.siteId ?? null} />}
    </article>
  );
}

function Body({ m, ds, dsLoading, dsError, targetSite }: { m: EvidenceModel; ds?: DatasetsResponse; dsLoading: boolean; dsError: boolean; targetSite: string | null }) {
  return (
    <>
      <KeyFigures m={m} />
      <Contents />

      <Section id="ev-process" kicker="Method" title="Four stages, one documented chain">
        <ProcessFigure m={m} />
        {m.method.operatorNote && (
          <p className="mt-8 max-w-[70ch] border-l-2 border-line-strong pl-4 text-body text-muted">
            <Term k="operator" />: {m.method.operatorNote}.
          </p>
        )}
      </Section>

      <Section id="ev-benchmark" kicker="Synthetic benchmark" title="Recovering a known twin" tag={<SyntheticTag />}>
        {m.synthetic.label && <p className="-mt-2 mb-8 max-w-[70ch] text-body text-muted">{m.synthetic.label}.</p>}
        <MethodChart m={m} />
        <Callout tone="warn">
          Twins were generated with the same modelled observation chain, so this measures the size of the bias and the benefit under a correct or
          near-correct operator — not real-world analog accuracy.
        </Callout>
      </Section>

      <Section id="ev-falsification" kicker="Falsification" title="The method can fail, and we show where" tag={<Tag tone="warn">⚠ Adverse result kept visible</Tag>}>
        <FalsificationChart m={m} />
        {m.falsificationHeadline && (
          <Callout tone="warn"><span className="text-ink">{m.falsificationHeadline}.</span> The deployed operator was selected from Mars-observable statistics, not from this benchmark.</Callout>
        )}
      </Section>

      <Section id="ev-selection" kicker="Operator choice" title="Why linear with a half-pixel shift">
        <InterpolatorChart m={m} />
      </Section>

      <Section id="ev-support" kicker="Observation support" title="Most of a MOLA grid is interpolated">
        <SupportStrip m={m} targetSite={targetSite} />
        <p className="mt-6 max-w-[70ch] text-body text-muted">
          Reported as metadata. It is never used as a confidence or a score weight.
          {m.retiredNote && <> {m.retiredNote}</>}
        </p>
      </Section>

      <Section id="ev-abstention" kicker="Abstention" title="Naming a leader only when it is stable">
        <AbstentionSplit m={m} />
        <div className="mt-8 grid gap-3 text-caption text-muted md:grid-cols-2">
          <p><span className="text-ink">Stable leader</span> — “{G5.leader}”.</p>
          <p><span className="text-ink">Tie</span> — “{G5.tied}”.</p>
        </div>
      </Section>

      <Section id="ev-controls" kicker="Controls" title="Known analogs and known non-analogs">
        <Controls m={m} />
      </Section>

      <Section id="ev-coverage" kicker="Coverage" title="What was actually searched">
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
          <Stat label="Global screen · land cells" value={fmtInt(m.coverage.tier1Cells)} sub={joinParts(`${m.coverage.tier1Km ?? "—"} km cells`, m.coverage.tier1Source ?? "source not given", "as measured")} />
          <Stat label="Research comparison · Earth windows" value={fmtInt(m.coverage.tier2Windows)} sub={joinParts(`${m.coverage.tier2Km ?? "—"} km windows`, m.coverage.tier2Source, m.coverage.tier2Scope)} />
          <Stat label="Mars targets with full evidence" value={fmtInt(m.coverage.marsTargets)} sub={m.coverage.marsScope ?? undefined} />
        </dl>
        <p className="mt-8 max-w-[70ch] text-body text-muted">{G5.scale}.</p>
        {m.novelty.wording && (
          <p className="mt-3 max-w-[70ch] text-caption text-faint">{m.novelty.wording} ({m.novelty.status}). {m.novelty.site}</p>
        )}
      </Section>

      <Section id="ev-limitations" kicker="Limitations" title="What this evidence does not show">
        <ol className="grid list-none gap-x-12 gap-y-5 p-0 md:grid-cols-2">
          {m.limitations.map((l, i) => (
            <li key={l.code || i} className="flex gap-3">
              <span className="num mt-[2px] w-5 shrink-0 text-num-sm text-faint">{String(i + 1).padStart(2, "0")}</span>
              <p className="m-0 text-body text-muted">{l.text}</p>
            </li>
          ))}
        </ol>
        {!m.limitations.length && <p className="text-caption text-bad">⊘ Limitations are missing from the evidence payload.</p>}
      </Section>

      <Section id="ev-provenance" kicker="Provenance" title="Datasets and integrity">
        <Provenance ds={ds} loading={dsLoading} error={dsError} />
      </Section>

      <p className="mt-16 max-w-[70ch] text-caption text-faint">
        Every number on this page is read from the research package served by <span className="num">/api/evidence</span> and <span className="num">/api/datasets</span>. Gate thresholds and verdict cut-offs are working hypotheses.
      </p>
    </>
  );
}

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p && !!p.trim()).join(" · ");

function SyntheticTag() {
  return <Tag tone="warn" className="kicker !text-warn !tracking-[0.08em]" title={G5.validation}>⚠ Synthetic</Tag>;
}

function KeyFigures({ m }: { m: EvidenceModel }) {
  const k = m.key;
  return (
    <section aria-labelledby="ev-key-title" className="mt-10 rounded-surface bg-surface/80 p-5 shadow-[inset_0_0_0_1px_rgb(255_255_255/.06)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ev-key-title" className="m-0 text-title text-ink">Key figures</h2>
        <SyntheticTag />
      </div>
      <p className="mt-1 text-caption text-muted">Exact-twin recovery on {fmtInt(m.synthetic.nTwins)} synthetic terrain twins — not real-world analog accuracy.</p>
      <dl className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        <KeyFig label="Twin ranked first" value={<>{fmtPct(k.directTop1)}<Arrow />{fmtPct(k.oomTop1)}</>} basis="Direct comparison → observation-operator matching" />
        <KeyFig label="Mean reciprocal rank" value={<>{fmtNum(k.directMrr, 2)}<Arrow />{fmtNum(k.oomMrr, 2)}</>} basis="1 = always ranked first" />
        <KeyFig label="Strongest alternative · ranked first" value={<>{fmtPct(k.alt?.top1 ?? null)}</>} basis={k.alt ? <>{k.alt.name} · MRR <span className="num">{fmtNum(k.alt.mrr)}</span></> : "Not in payload"} />
        <KeyFig label="Adverse result" warn
          value={k.adverse ? <>{fmtNum(k.adverse.oom, 2)}<span className="mx-1.5 text-muted">&lt;</span>{fmtNum(k.adverse.direct, 2)}</> : "—"}
          basis={k.adverse ? <>If the true chain were {k.adverse.chain.toLowerCase()}: deployed operator MRR below direct comparison</> : "No adverse row in payload"} />
      </dl>
      <p className="mt-6 border-t border-line pt-4 text-caption text-muted">{G5.validation}.</p>
    </section>
  );
}

const Arrow = () => <span aria-label="to" className="mx-1.5 text-faint">→</span>;

function KeyFig({ label, value, basis, warn }: { label: string; value: ReactNode; basis: ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={cx("text-caption", warn ? "text-warn" : "text-muted")}>{warn && <span aria-hidden className="mr-1">⚠</span>}{label}</dt>
      <dd className="num m-0 mt-1.5 whitespace-nowrap text-figure text-ink">{value}</dd>
      <dd className="m-0 mt-1.5 text-caption text-faint">{basis}</dd>
    </div>
  );
}

function Contents() {
  return (
    <nav aria-label="On this page" className="mt-8">
      <ul className="flex list-none flex-wrap gap-x-1 gap-y-1 p-0">
        {SECTIONS.map(([id, label]) => (
          <li key={id}>
            <button type="button" onClick={() => jumpTo(id)} className="hit rounded-control px-2 py-1.5 text-label text-muted hover:bg-elevated hover:text-ink">{label}</button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Section({ id, kicker, title, tag, children }: { id: string; kicker: string; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 pt-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 id={`${id}-h`} className="toponym m-0 mt-2 rounded-[4px] text-toponym text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-earth/70">{title}</h2>
        </div>
        {tag}
      </div>
      {children}
    </section>
  );
}

function Callout({ tone, children }: { tone: "warn"; children: ReactNode }) {
  return (
    <p className="mt-8 flex max-w-[72ch] gap-2.5 text-body text-muted">
      <span aria-hidden className={tone === "warn" ? "text-warn" : "text-muted"}>⚠</span>
      <span>{children}</span>
    </p>
  );
}

function Controls({ m }: { m: EvidenceModel }) {
  const c = m.controls;
  // The payload keys the middle column only as "M3"; it does not say which bias-correction variant
  // (constant or per-site) produced these ranks, so the label stays generic.
  const methodName: Record<string, ReactNode> = { M0: "Direct", M3: <><span className="sm:hidden">Bias corr. (M3)</span><span className="hidden sm:inline">Bias correction (M3)</span></>, OOM: "OOM" };
  const target = c.positive[0]?.target ?? null;
  const negSet = new Set(c.negNames);
  const negGate = c.gatePass.filter((g) => negSet.has(g.name));
  const oomRanks = c.positive.map((p) => p.ranks.find((r) => r.method === "OOM")?.rank).filter((r): r is number => typeof r === "number");
  const bestOom = oomRanks.length ? Math.min(...oomRanks) : null;
  return (
    <div className="grid gap-x-12 gap-y-12 md:grid-cols-2">
      <div>
        <h3 className="m-0 text-title text-ink">Positive controls{target && <> · {zoneName(target)}</>}</h3>
        <p className="mt-1 text-caption text-muted">Documented volcanic analogs, ranked among {c.poolSize ?? "the"} pool windows (1 = most similar).</p>
        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-faint">
              <th scope="col" className="py-1.5 font-normal">Control</th>
              {["M0", "M3", "OOM"].map((k) => <th key={k} scope="col" className="py-1.5 text-right font-normal">{methodName[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.positive.map((p) => (
              <tr key={p.control} className="border-t border-line">
                <th scope="row" className="py-2 text-label font-normal text-ink">{p.control}</th>
                {p.ranks.map((r) => (
                  <td key={r.method} className="num py-2 text-right text-num text-muted">{r.rank === null ? "—" : <>#{r.rank}<span className="text-faint">/{c.poolSize ?? "?"}</span></>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-caption text-muted">
          <span aria-hidden className="mr-1 text-warn">⚠</span>{bestOom !== null ? <>Best rank with OOM is <span className="num text-ink">#{bestOom}</span> of {c.poolSize ?? "?"}{m.coverage.tier2Km !== null ? <> at {m.coverage.tier2Km} km</> : null}. </> : null}Terrain geometry is not geology.
        </p>
      </div>
      <div>
        <h3 className="m-0 text-title text-ink">Negative controls · vegetated windows</h3>
        <p className="mt-1 text-caption text-muted">
          Terrain alone puts some vegetated controls in a flat target's top 10 (<span className="num text-ink">{fmtInt(c.negTop10Oom)}</span> of <span className="num text-ink">{fmtInt(c.negPairs)}</span> pairs with OOM).
          The land-cover filter is what removes them for field-test missions.
        </p>
        <ul className="mt-4 list-none p-0">
          {negGate.map((g) => (
            <li key={g.name} className="flex items-center justify-between gap-3 border-t border-line py-2 text-label">
              <span className="text-ink">{g.name}</span>
              <span className={g.pass ? "text-warn" : "text-muted"}>{g.pass ? "⚠ passes the filter" : "✓ removed by the filter"}</span>
            </li>
          ))}
        </ul>
        {c.negativePassingGate !== null && (
          <p className="mt-3 text-caption text-faint"><span className="num">{c.negativePassingGate}</span> of {negGate.length || c.negNames.length} negative controls pass the land-cover filter.</p>
        )}
        <Disclosure summary="All named controls and the filter" className="mt-4">
          <ul className="list-none p-0">
            {c.gatePass.map((g) => (
              <li key={g.name} className="flex justify-between gap-3 border-b border-line py-1.5 text-caption">
                <span className="text-muted">{g.name}</span>
                <span className={g.pass ? "text-ink" : "text-faint"}>{g.pass ? "✓ eligible" : "⊘ not cleared"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-faint">{G5.gate}.</p>
        </Disclosure>
      </div>
    </div>
  );
}

const STATUS: Record<string, { glyph: string; word: string; cls: string }> = {
  imported: { glyph: "✓", word: "Imported", cls: "text-ink" },
  partial: { glyph: "◐", word: "Partial", cls: "text-warn" },
  missing: { glyph: "⊘", word: "Missing", cls: "text-bad" },
  visualization_only: { glyph: "◌", word: "Visualization only", cls: "text-muted" },
};

function Provenance({ ds, loading, error }: { ds?: DatasetsResponse; loading: boolean; error: boolean }) {
  if (loading) return <Spinner label="Loading datasets" />;
  if (error || !ds) return <p className="text-body text-muted"><span aria-hidden className="mr-1 text-bad">⊘</span>Dataset provenance could not be loaded.</p>;
  const okN = ds.integrity_checks.filter((c) => c.ok).length;
  return (
    <div>
      <div className="scroll-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="region" aria-label="Datasets" tabIndex={0}>
        <table className="w-full min-w-[340px] border-collapse text-left">
          <thead>
            <tr className="text-caption text-faint">
              <th scope="col" className="py-2 pr-4 font-normal">Dataset</th>
              <th scope="col" className="hidden py-2 pr-4 font-normal md:table-cell">Role</th>
              <th scope="col" className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {ds.datasets.map((d) => {
              const st = STATUS[d.status] ?? { glyph: "·", word: d.status.replace(/_/g, " "), cls: "text-muted" };
              return (
                <tr key={d.id} className="border-t border-line align-top">
                  <td className="py-3 pr-4">
                    <div className="text-label text-ink">
                      {d.url ? <a className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink" href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}
                      <span className="ml-1.5 text-caption text-faint">· {d.planet === "mars" ? "Mars" : d.planet === "earth" ? "Earth" : d.planet}</span>
                    </div>
                    <div className="mt-0.5 text-caption text-muted md:hidden">{d.role}</div>
                    {d.native_resolution && <div className="num mt-1 text-num-sm text-faint">{d.native_resolution}</div>}
                    {d.coverage && <div className="mt-0.5 text-caption text-faint">{d.coverage}</div>}
                    {d.notes && <div className="mt-0.5 text-caption text-faint">{d.notes}</div>}
                  </td>
                  <td className="hidden py-3 pr-4 text-caption text-muted md:table-cell">{d.role}</td>
                  <td className={cx("whitespace-nowrap py-3 text-caption", st.cls)}><span aria-hidden className="mr-1.5">{st.glyph}</span>{st.word}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="m-0 text-title text-ink">Integrity checks <span className="num ml-1 text-num text-muted">{okN}/{ds.integrity_checks.length}</span></h3>
          <ul className="mt-3 list-none p-0">
            {ds.integrity_checks.map((c) => (
              <li key={c.name} className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 text-caption">
                <span className={c.ok ? "text-muted" : "text-bad"}><span aria-hidden className="mr-1.5">{c.ok ? "✓" : "⊘"}</span>{c.name.replace(/_/g, " ")}<span className="sr-only">{c.ok ? " passed" : " failed"}</span></span>
                <span className="num text-right text-num-sm text-faint">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {ds.research_import && (
            <>
              <h3 className="m-0 text-title text-ink">Research package</h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-caption">
                <dt className="text-faint">Package</dt><dd className="m-0 break-all text-muted">{ds.research_import.package}</dd>
                <dt className="text-faint">SHA-256</dt><dd className="num m-0 break-all text-num-sm text-muted">{ds.research_import.package_sha256}</dd>
                <dt className="text-faint">Imported</dt><dd className="num m-0 text-num-sm text-muted">{ds.research_import.imported_at}</dd>
                <dt className="text-faint">Files</dt><dd className="num m-0 text-num-sm text-muted">{ds.research_import.n_files}</dd>
              </dl>
            </>
          )}
          {ds.live_refinement && (
            <div className="mt-6">
              <h3 className="m-0 text-title text-ink">Live research comparison</h3>
              <p className="mt-1 text-caption text-muted">
                <span aria-hidden className="mr-1">{ds.live_refinement.status === "available" ? "✓" : "⊘"}</span>
                {ds.live_refinement.status === "available" ? "Available" : "Not available — research comparisons come from the published research record."}
              </p>
              {ds.live_refinement.missing_inputs.length > 0 && (
                <Disclosure summary="What it still needs" className="mt-1">
                  <ul className="list-none p-0">
                    {ds.live_refinement.missing_inputs.map((x) => <li key={x} className="border-t border-line py-1.5 text-caption text-muted">{x}</li>)}
                  </ul>
                </Disclosure>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
