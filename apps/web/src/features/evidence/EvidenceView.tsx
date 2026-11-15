import { motion } from "motion/react";
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Disclosure, Kicker, SPRING, Tag, Term, Toponym } from "../../components/primitives";
import { PlanetMark, StatusMark, type StatusKind } from "../../components/marks";
import { Button, cx, Spinner } from "../../components/ui";
import { G5, zoneName } from "../../lib/glossary";
import { useDatasets, useEvidence, type DatasetsResponse } from "../../services/api";
import { useGisStatus } from "../../services/gis";
import { useApp } from "../../store/app";
import { gisRows, liveSentence } from "./gisRows";
import { searchTarget } from "../../store/searchTarget";
import { AbstentionSplit, FalsificationChart, InterpolatorChart, MethodChart, Stat, SupportStrip } from "./charts";
import { MiniScale } from "./chartKit";
import { buildModel, fmtInt, fmtNum, fmtPct, fmtStamp, type EvidenceModel } from "./model";
import { jumpTo } from "./jump";
import { ProcessFigure } from "./ProcessFigure";
import { useScrollSpy } from "./scrollSpy";
import { SECTION_IDS, SECTIONS, sectionLabel, sectionNo, type SectionId } from "./sections";

export default function EvidenceView() {
  const ev = useEvidence();
  const ds = useDatasets();
  const search = useApp((s) => s.search);
  const target = searchTarget(search);
  const announce = useApp((s) => s.announce);
  const model = useMemo(() => (ev.data ? buildModel(ev.data) : null), [ev.data]);
  const root = useRef<HTMLElement>(null);
  const active = useScrollSpy(SECTION_IDS, root, !!model);

  // The shell focuses the stage heading shortly after navigation; if this lazily loaded page was not
  // mounted yet, take focus here so keyboard and screen-reader users still land on the heading.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>('[data-stage-heading="evidence"]');
      const activeEl = document.activeElement;
      if (h && (!activeEl || activeEl === document.body)) h.focus({ preventScroll: true });
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
    <article ref={root} className="mx-auto w-full max-w-[1480px] px-4 pb-28 pt-8 sm:px-8 md:pt-12 xl:px-10">
      <header className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-end lg:gap-x-16">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StatusMark state="caution" />
            <Kicker className="!text-muted">Research method · synthetic validation only</Kicker>
          </div>
          <Toponym as="h1" size="lg" data-stage-heading="evidence" tabIndex={-1} style={{ outline: "none" }}
            className="mt-5 !text-[38px] !leading-[0.98] !tracking-[0.02em] sm:!text-[52px] xl:!text-[60px]">
            Observation-operator matching
          </Toponym>
          {model?.method.summary && <p className="mt-6 max-w-[64ch] text-body text-muted sm:text-lead">{model.method.summary}</p>}
          {target && (
            <p className="mt-5 flex items-baseline gap-2.5 text-caption text-muted">
              <PlanetMark planet="mars" className="relative top-[-1px]" />
              <span>
                <span className="label-caps mr-2 text-[10.5px] text-faint">Your search</span>
                <span className="text-ink">{target.siteId ? zoneName(target.siteId) : target.label}</span>
                {target.siteId ? " is marked in the observation-support chart." : " is outside the research zones; this method has no record there."}
              </span>
            </p>
          )}
        </div>
        {model && <DocControl m={model} pkg={ds.data?.research_import} pkgState={ds.isLoading ? "loading" : ds.isError ? "error" : "ready"} />}
      </header>

      {ev.isLoading && <div className="py-16"><Spinner label="Loading the research evidence" /></div>}
      {ev.isError && (
        <div className="frame mt-12 max-w-[720px] bg-surface px-5 py-5" role="alert">
          <div className="label-caps flex items-center gap-2 text-ink"><StatusMark state="fault" />Evidence unavailable</div>
          <p className="mt-2 max-w-[60ch] text-body text-muted">The research evidence could not be loaded from the API. No figures are shown rather than stale or invented ones.</p>
          <p className="num mt-2 text-num-sm text-faint">{(ev.error as Error)?.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => ev.refetch()}>Retry</Button>
        </div>
      )}

      {model && (
        <div className="mt-12 xl:mt-14 xl:grid xl:grid-cols-[192px_minmax(0,1fr)] xl:gap-x-14">
          <div className="xl:col-start-2 xl:row-start-1"><KeyFigures m={model} /></div>
          <IndexBar active={active} />
          <IndexRail active={active} />
          <div className="xl:col-start-2 xl:row-start-2">
            <Body m={model} ds={ds.data} dsLoading={ds.isLoading} dsError={ds.isError} targetSite={target?.siteId ?? null} />
          </div>
        </div>
      )}
    </article>
  );
}

/* ---- header ------------------------------------------------------------------------------------ */

/** Document control block, like the title block of an engineering drawing. Every value is from the API. */
function DocControl({ m, pkg, pkgState }: { m: EvidenceModel; pkg: DatasetsResponse["research_import"] | undefined; pkgState: "loading" | "error" | "ready" }) {
  const rows: [string, ReactNode][] = [
    ["Method", m.method.name ?? <span className="text-faint">Not in payload</span>],
    ["Version", <span className="num text-ink">{m.method.version ?? "—"}</span>],
    ["Used for", <Term k="researchComparison" />],
    ["Validation", <><Term k="synthetic">Synthetic twins only</Term> · not validated against field data or expert review</>],
    ["Package", pkg
      ? <><span className="num text-ink" title={pkg.package_sha256}>{pkg.package_sha256.slice(0, 16)}…</span> <span className="text-faint">SHA-256</span></>
      : <span className="text-faint">{pkgState === "loading" ? "—" : "Not available"}</span>],
    ["Imported", pkg ? <span className="num" title={pkg.imported_at}>{fmtStamp(pkg.imported_at)}</span> : <span className="text-faint">—</span>],
  ];
  return (
    <dl className="frame mt-10 grid grid-cols-[5.75rem_minmax(0,1fr)] bg-surface/70 px-4 py-1.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/.05)] lg:mt-0">
      {rows.map(([k, v], i) => (
        <Fragment key={k}>
          <dt className={cx("py-2.5 text-[10.5px] font-semibold uppercase leading-[1.5] tracking-[0.12em] text-faint", i > 0 && "border-t border-line")}>{k}</dt>
          <dd className={cx("m-0 min-w-0 py-2.5 text-caption text-muted", i > 0 && "border-t border-line")}>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SyntheticTag() {
  return <Tag tone="warn" title={G5.validation}><StatusMark state="caution" size={6} />Synthetic</Tag>;
}

/* ---- key figures ------------------------------------------------------------------------------- */

function KeyFigures({ m }: { m: EvidenceModel }) {
  const k = m.key;
  return (
    <section aria-labelledby="ev-key-title" className="frame bg-surface shadow-[inset_0_0_0_1px_rgb(255_255_255/.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h2 id="ev-key-title" className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">Key figures</h2>
          <span className="num text-[11px] text-faint">n = {fmtInt(m.synthetic.nTwins)}</span>
        </div>
        <SyntheticTag />
      </div>
      <p className="px-5 text-caption text-muted sm:px-6">Exact-twin recovery on {fmtInt(m.synthetic.nTwins)} synthetic terrain twins — not real-world analog accuracy.</p>
      <dl className="mt-4 grid gap-px border-y border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <KeyFig label="Twin ranked first" basis="Direct comparison → observation-operator matching"
          value={<>{fmtPct(k.directTop1)}<To />{fmtPct(k.oomTop1)}</>}
          scale={<MiniScale ends={["0%", "100%"]} link={[k.directTop1, k.oomTop1]} marks={[{ v: k.directTop1, kind: "hollow" }, { v: k.oomTop1, kind: "solid" }]} />} />
        <KeyFig label="Mean reciprocal rank" basis="1 = always ranked first"
          value={<>{fmtNum(k.directMrr, 2)}<To />{fmtNum(k.oomMrr, 2)}</>}
          scale={<MiniScale link={[k.directMrr, k.oomMrr]} marks={[{ v: k.directMrr, kind: "hollow" }, { v: k.oomMrr, kind: "solid" }]} />} />
        <KeyFig label="Strongest alternative"
          value={fmtPct(k.alt?.top1 ?? null)}
          basis={k.alt ? <>{k.alt.name}: twin ranked first · MRR <span className="num">{fmtNum(k.alt.mrr)}</span></> : "Not in payload"}
          scale={<MiniScale ends={["0%", "100%"]} marks={[{ v: k.alt?.top1 ?? null, kind: "alt" }]} />} />
        <KeyFig label="Adverse result" warn
          value={k.adverse ? <>{fmtNum(k.adverse.oom, 2)}<span className="mx-2 text-muted" aria-hidden>&lt;</span><span className="sr-only"> is below </span>{fmtNum(k.adverse.direct, 2)}</> : "—"}
          basis={k.adverse ? <>If the true chain were {k.adverse.chain.toLowerCase()}: deployed operator MRR below direct comparison</> : "No adverse row in payload"}
          scale={k.adverse ? <MiniScale link={[k.adverse.oom, k.adverse.direct]} linkClass="bg-warn/80" marks={[{ v: k.adverse.direct, kind: "hollow" }, { v: k.adverse.oom, kind: "warn" }]} /> : null} />
      </dl>
      <p className="px-5 py-3.5 text-caption text-muted sm:px-6">{G5.validation}.</p>
    </section>
  );
}

const To = () => <><span aria-hidden className="mx-2 text-faint">→</span><span className="sr-only"> to </span></>;

function KeyFig({ label, value, basis, scale, warn }: { label: string; value: ReactNode; basis: ReactNode; scale?: ReactNode; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col bg-surface px-5 py-5 sm:px-6">
      <dt className={cx("text-[10.5px] font-semibold uppercase leading-snug tracking-[0.12em]", warn ? "text-warn" : "text-muted")}>
        {warn && <StatusMark state="caution" className="mr-1.5 -translate-y-px" />}{label}
      </dt>
      <dd className="num m-0 mt-3 whitespace-nowrap text-[28px] leading-none text-ink">{value}</dd>
      {scale && <dd className="m-0 mt-4">{scale}</dd>}
      <dd className="m-0 mt-3 text-caption text-faint">{basis}</dd>
    </div>
  );
}

/* ---- section index ----------------------------------------------------------------------------- */

/** Phones and tablets: a sticky row of numbered entries; the one being read is underlined and kept in view. */
function IndexBar({ active }: { active: SectionId | null }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = list.current;
    const el = active ? ol?.querySelector<HTMLElement>(`[data-section="${active}"]`) : null;
    if (!ol || !el) return;
    const o = ol.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 24;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (r.left < o.left + pad) ol.scrollBy({ left: r.left - o.left - pad, behavior: reduce ? "auto" : "smooth" });
    else if (r.right > o.right - pad) ol.scrollBy({ left: r.right - o.right + pad, behavior: reduce ? "auto" : "smooth" });
  }, [active]);
  return (
    <nav aria-label="Sections" className="no-print sticky top-0 z-20 -mx-4 mt-10 bg-space sm:-mx-8 xl:hidden">
      {/* Both scroll edges fade, so entries scrolled past either side dissolve instead of showing cut glyphs. The
          left fade ends before the first entry's text, so nothing is faded at rest. */}
      <ol ref={list} className="flex list-none overflow-x-auto border-b border-line px-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-32px),transparent)]">
        {SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} data-section={s.id} className="shrink-0">
              {/* The scrolling row clips anything drawn outside a button, so the focus ring is drawn inside it. (The
                  global :focus-visible rule is unlayered, so only an important utility can move its offset.) */}
              <button type="button" onClick={() => jumpTo(s.id)} aria-current={on ? "location" : undefined}
                className={cx("hit relative flex items-baseline gap-2 whitespace-nowrap px-2.5 py-3.5 transition-colors duration-150 focus-visible:outline-offset-[-4px]! active:text-ink active:duration-0", on ? "text-ink" : "text-muted hover:text-ink")}>
                <span className={cx("num text-[10.5px] leading-none", on ? "text-ink" : "text-faint")}>{sectionNo(s.id)}</span>
                <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.12em]">{s.label}</span>
                {/* Inside the button: the row scrolls, so anything below it would be clipped. */}
                {on && <motion.span layoutId="ev-index-bar" transition={SPRING} className="absolute inset-x-2.5 bottom-0 h-[2px] bg-ink" />}
              </button>
            </li>
          );
        })}
      </ol>
      {/* Scroll-edge fade: text leaving under the bar dissolves instead of being cut. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-space to-transparent" />
    </nav>
  );
}

/** Desktop: a sticky rail beside the brief with the section being read marked, and the validation basis always in view. */
function IndexRail({ active }: { active: SectionId | null }) {
  return (
    // z-10: sticky makes the rail its own stacking context; its glossary popover must paint over the brief.
    <nav aria-label="Sections" className="no-print hidden xl:sticky xl:top-10 xl:z-10 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:block xl:self-start">
      <div className="flex items-baseline justify-between border-b border-line-strong pb-2.5">
        <span className="kicker">Index</span>
        <span className="num text-[11px] text-faint" aria-hidden>{active ? sectionNo(active) : "––"}/{String(SECTIONS.length).padStart(2, "0")}</span>
      </div>
      <ol className="mt-2 list-none p-0">
        {SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => jumpTo(s.id)} aria-current={on ? "location" : undefined}
                className={cx("hit group relative flex w-full items-center gap-3 py-[7px] pl-3.5 text-left transition-colors duration-150 active:text-ink active:duration-0", on ? "text-ink" : "text-muted hover:text-ink")}>
                {on && <motion.span layoutId="ev-index-rail" transition={SPRING} className="absolute left-0 top-[calc(50%-6px)] h-3 w-[2px] bg-ink" />}
                <span className={cx("num text-[10.5px] leading-none", on ? "text-ink" : "text-faint group-hover:text-muted")}>{sectionNo(s.id)}</span>
                <span className="text-[11px] font-semibold uppercase leading-[1.25] tracking-[0.12em]">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 border-t border-line pt-3.5">
        <div className="flex items-center gap-2">
          <StatusMark state="caution" />
          <span className="kicker !text-warn">Validation</span>
        </div>
        <p className="mt-2 text-caption text-muted"><Term k="synthetic">Synthetic twins only</Term>. Not validated against field data or expert review.</p>
      </div>
      <div className="mt-4 border-t border-line pt-3.5">
        <span className="kicker">Source</span>
        <p className="num mt-1.5 text-num-sm leading-relaxed text-muted">/api/evidence<br />/api/datasets<br />/api/gis/status</p>
      </div>
    </nav>
  );
}

/* ---- body -------------------------------------------------------------------------------------- */

function Body({ m, ds, dsLoading, dsError, targetSite }: { m: EvidenceModel; ds?: DatasetsResponse; dsLoading: boolean; dsError: boolean; targetSite: string | null }) {
  return (
    <>
      <Section id="ev-process" title="Four stages, one documented chain">
        <ProcessFigure m={m} fig={sectionNo("ev-process")} />
        {m.method.operatorNote && (
          <Note label="Operator">
            <Term k="operator" />: {m.method.operatorNote}.
          </Note>
        )}
      </Section>

      <Section id="ev-benchmark" title="Recovering a known twin" tag={<SyntheticTag />}>
        {m.synthetic.label && <p className="-mt-2 mb-10 max-w-[72ch] text-body text-muted">{m.synthetic.label}.</p>}
        <MethodChart m={m} fig={sectionNo("ev-benchmark")} />
        <Note label="Caveat" tone="warn">
          Twins were generated with the same modelled observation chain, so this measures the size of the bias and the benefit under a correct or
          near-correct operator — not real-world analog accuracy.
        </Note>
      </Section>

      <Section id="ev-falsification" title="The method can fail, and we show where" tag={<Tag tone="warn"><StatusMark state="caution" size={6} />Adverse result kept visible</Tag>}>
        <FalsificationChart m={m} fig={sectionNo("ev-falsification")} />
        {m.falsificationHeadline && (
          <Note label="Adverse" tone="warn"><span className="text-ink">{m.falsificationHeadline}.</span> The deployed operator was selected from Mars-observable statistics, not from this benchmark.</Note>
        )}
      </Section>

      <Section id="ev-selection" title="Why linear with a half-pixel shift">
        <InterpolatorChart m={m} fig={sectionNo("ev-selection")} />
      </Section>

      <Section id="ev-support" title="Most of a MOLA grid is interpolated">
        <SupportStrip m={m} targetSite={targetSite} fig={sectionNo("ev-support")} />
        <Note label="Role">
          Reported as metadata. It is never used as a confidence or a score weight.
          {m.retiredNote && <> {m.retiredNote}</>}
        </Note>
      </Section>

      <Section id="ev-abstention" title="Naming a leader only when it is stable">
        <AbstentionSplit m={m} fig={sectionNo("ev-abstention")} />
        <dl className="mt-12 grid gap-px border border-line bg-line md:grid-cols-2">
          <div className="bg-space px-4 py-3.5">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink">Stable leader</dt>
            <dd className="m-0 mt-1.5 text-caption text-muted">“{G5.leader}”.</dd>
          </div>
          <div className="bg-space px-4 py-3.5">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink">Tie</dt>
            <dd className="m-0 mt-1.5 text-caption text-muted">“{G5.tied}”.</dd>
          </div>
        </dl>
      </Section>

      <Section id="ev-controls" title="Known analogs and known non-analogs">
        <Controls m={m} />
      </Section>

      <Section id="ev-coverage" title="What was actually searched">
        <dl className="grid gap-px border border-line bg-line sm:grid-cols-3">
          <Stat cell label="Global screen · land cells" value={fmtInt(m.coverage.tier1Cells)} sub={joinParts(m.coverage.tier1Km !== null ? `${m.coverage.tier1Km} km cells` : "cell size not given", m.coverage.tier1Source ?? "source not given", "as measured")} />
          <Stat cell label="Research comparison · Earth windows" value={fmtInt(m.coverage.tier2Windows)} sub={joinParts(m.coverage.tier2Km !== null ? `${m.coverage.tier2Km} km windows` : "window size not given", m.coverage.tier2Source, m.coverage.tier2Scope)} />
          <Stat cell label="Mars research zones measured · terrain + observation support" value={fmtInt(m.coverage.marsTargets)} sub={m.coverage.marsScope ?? undefined} />
        </dl>
        <Note label="Scale">{G5.scale}.</Note>
        {m.novelty.wording && (
          <Note label="Novelty">{m.novelty.wording} <span className="text-faint">({m.novelty.status})</span>. {m.novelty.site}</Note>
        )}
      </Section>

      <Section id="ev-limitations" title="What this evidence does not show">
        <ol className="grid list-none gap-x-12 p-0 md:grid-cols-2">
          {m.limitations.map((l, i) => (
            <li key={l.code || i} className="flex gap-4 border-t border-line py-4">
              <span className="num mt-[3px] w-6 shrink-0 text-num-sm text-faint">{String(i + 1).padStart(2, "0")}</span>
              <p className="m-0 text-body text-muted">{l.text}</p>
            </li>
          ))}
        </ol>
        {!m.limitations.length && <p className="flex items-baseline gap-2 text-caption text-ink"><StatusMark state="fault" className="-translate-y-px" />Limitations are missing from the evidence payload.</p>}
      </Section>

      <Section id="ev-provenance" title="Datasets and integrity">
        <Provenance ds={ds} loading={dsLoading} error={dsError} />
      </Section>

      <p className="mt-20 max-w-[78ch] border-t border-line pt-5 text-caption text-faint">
        {/* "Measured value", not "number": section and figure numbers are document structure, and FIG 01 is a drawing. */}
        Every measured value on this page is read from the research package served by <span className="num text-muted">/api/evidence</span> and <span className="num text-muted">/api/datasets</span>, and the GIS integration from <span className="num text-muted">/api/gis/status</span>; the FIG {sectionNo("ev-process")} drawings are schematic. Gate thresholds and verdict cut-offs are working assumptions.
      </p>
    </>
  );
}

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p && !!p.trim()).join(" · ");

/** Long hashes wrap at fixed-width groups instead of mid-group (the groups copy back without spaces). */
const chunks = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

/** "01  METHOD ───────── [tag]" over the section title. The section box starts at this rule, so jumps and the index line up with it. */
function Section({ id, title, tag, children }: { id: SectionId; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    // Section spacing is a brief's rhythm, not a landing page's: tighter on phones, where every screen counts.
    <section id={id} aria-labelledby={`${id}-h`} className="mt-16 scroll-mt-[76px] first:mt-14 sm:mt-20 sm:first:mt-16 xl:mt-24 xl:scroll-mt-10 xl:first:mt-20">
      {/* Wraps on phones so a long tag drops below the rule instead of running off the page. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <span aria-hidden className="num text-[12px] leading-none text-faint">{sectionNo(id)}</span>
        <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-muted">{sectionLabel(id)}</span>
        <span aria-hidden className="h-px min-w-6 flex-1 bg-line-strong" />
        {tag}
      </div>
      {/* w-fit: a keyboard jump focuses the heading, and its focus outline should hug the words, not the row. */}
      <h2 id={`${id}-h`} className="toponym m-0 mt-4 w-fit text-[26px] leading-[1.04] tracking-[0.03em] text-ink sm:text-[34px]">{title}</h2>
      <div className="mt-9">{children}</div>
    </section>
  );
}

/** Margin-note: caps label left, text right (stacked on phones). Warnings carry a warn rule and glyph. */
function Note({ label, tone, children }: { label: string; tone?: "warn"; children: ReactNode }) {
  return (
    <div className="mt-10 grid max-w-[980px] gap-x-6 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <div className={cx("border-t pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]", tone === "warn" ? "border-warn/70 text-warn" : "border-line-strong text-faint")}>
        {tone === "warn" && <StatusMark state="caution" className="mr-1.5 -translate-y-px" />}{label}
      </div>
      <p className="m-0 max-w-[76ch] border-line pt-2 text-body text-muted sm:border-t sm:pt-2.5">{children}</p>
    </div>
  );
}

/* ---- controls ---------------------------------------------------------------------------------- */

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
  const th = "py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint";
  return (
    <div className="grid gap-x-14 gap-y-14 lg:grid-cols-2">
      <div>
        <h3 className="m-0 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Positive controls{target && <span className="text-muted"> · {zoneName(target)}</span>}</h3>
        <p className="mt-3 text-caption text-muted">Documented volcanic analogs, ranked among {c.poolSize ?? "the"} pool windows (1 = most similar).</p>
        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className={th}>Control</th>
              {["M0", "M3", "OOM"].map((k) => <th key={k} scope="col" className={cx(th, "pl-3 text-right")}>{methodName[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.positive.map((p) => (
              <tr key={p.control} className="border-t border-line first:border-t-0">
                <th scope="row" className="py-2.5 text-label font-normal text-ink">{p.control}</th>
                {p.ranks.map((r) => (
                  <td key={r.method} className={cx("num whitespace-nowrap py-2.5 pl-3 text-right text-num", r.method === "OOM" ? "text-ink" : "text-muted")}>{r.rank === null ? "—" : <>#{r.rank}<span className="text-faint">/{c.poolSize ?? "?"}</span></>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-caption text-muted">
          <StatusMark state="caution" className="mr-1.5 -translate-y-px" />{bestOom !== null ? <>Best rank with OOM is <span className="num text-ink">#{bestOom}</span> of {c.poolSize ?? "?"}{m.coverage.tier2Km !== null ? <> at {m.coverage.tier2Km} km</> : null}. </> : null}Terrain geometry is not geology.
        </p>
      </div>
      <div>
        <h3 className="m-0 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Negative controls<span className="text-muted"> · vegetated windows</span></h3>
        <p className="mt-3 text-caption text-muted">
          Terrain alone puts some vegetated controls in a flat target's top 10 (<span className="num text-ink">{fmtInt(c.negTop10Oom)}</span> of <span className="num text-ink">{fmtInt(c.negPairs)}</span> pairs with OOM).
          The land-cover filter is what removes them for field-test missions.
        </p>
        <ul className="mt-4 list-none border-b border-line p-0">
          {negGate.map((g) => (
            <li key={g.name} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-label">
              <span className="text-ink">{g.name}</span>
              {/* A negative control that passes the filter is a caution; one the filter removes is simply off. */}
              <span className={cx("inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em]", g.pass ? "text-warn" : "text-muted")}>
                <StatusMark state={g.pass ? "caution" : "off"} />
                {g.pass ? "Passes the filter" : "Removed by the filter"}
              </span>
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
                <span className={cx("inline-flex items-center gap-2", g.pass ? "text-ink" : "text-faint")}>
                  <StatusMark state={g.pass ? "on" : "off"} />
                  {g.pass ? "eligible" : "not cleared"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-faint">{G5.gate}.</p>
        </Disclosure>
      </div>
    </div>
  );
}

/* ---- provenance -------------------------------------------------------------------------------- */

/**
 * Dataset status with the shared status marks plus the word, never colour alone: filled = imported (or a GIS
 * raster connected on the API server), half =
 * partial, outlined = visualization only (never measured), struck = missing (not in this package). A
 * missing dataset is a gap in the inputs, not a fault, so it is not drawn red.
 */
const STATUS: Record<string, { word: string; cls: string; mark: StatusKind }> = {
  imported: { word: "Imported", cls: "text-ink", mark: "on" },
  connected: { word: "Connected", cls: "text-ink", mark: "on" },
  partial: { word: "Partial", cls: "text-ink", mark: "partial" },
  missing: { word: "Missing", cls: "text-muted", mark: "struck" },
  visualization_only: { word: "Visualization only", cls: "text-muted", mark: "off" },
};

function Provenance({ ds, loading, error }: { ds?: DatasetsResponse; loading: boolean; error: boolean }) {
  if (loading) return <Spinner label="Loading datasets" />;
  if (error || !ds) return <p className="flex items-baseline gap-2 text-body text-muted"><StatusMark state="fault" className="-translate-y-px" />Dataset provenance could not be loaded.</p>;
  const okN = ds.integrity_checks.filter((c) => c.ok).length;
  const th = "py-2 pr-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint";
  return (
    <div>
      {/* The scroller clips at its padding edge, so it keeps a few pixels of room for the links' focus rings. */}
      <div className="scroll-thin -mx-4 overflow-x-auto px-4 sm:-mx-1 sm:px-1" role="region" aria-label="Datasets" tabIndex={0}>
        <table className="w-full min-w-[340px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className={th}>Dataset</th>
              <th scope="col" className={cx(th, "hidden md:table-cell")}>Role</th>
              <th scope="col" className={cx(th, "pr-0")}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ds.datasets.map((d) => {
              const st = STATUS[d.status] ?? { word: d.status.replace(/_/g, " "), cls: "text-muted", mark: "off" as StatusKind };
              return (
                <tr key={d.id} className="border-t border-line align-top first:border-t-0">
                  <td className="py-3.5 pr-4">
                    <div className="text-label text-ink">
                      {d.url
                        ? <a className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink" href={d.url} target="_blank" rel="noreferrer">
                            {d.title}<span aria-hidden className="ml-1 inline-block font-mono text-[10.5px] text-faint">↗</span><span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        : d.title}
                      <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">{d.planet === "mars" ? "Mars" : d.planet === "earth" ? "Earth" : d.planet}</span>
                    </div>
                    <div className="mt-0.5 text-caption text-muted md:hidden">{d.role}</div>
                    {d.native_resolution && <div className="num mt-1 text-num-sm text-faint">{d.native_resolution}</div>}
                    {d.coverage && <div className="mt-0.5 text-caption text-faint">{d.coverage}</div>}
                    {d.notes && <div className="mt-0.5 text-caption text-faint">{d.notes}</div>}
                  </td>
                  <td className="hidden py-3.5 pr-4 text-caption text-muted md:table-cell">{d.role}</td>
                  <td className={cx("whitespace-nowrap py-3.5 text-caption", st.cls)}>
                    <span className="inline-flex items-center gap-2"><StatusMark state={st.mark} />{st.word}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        {/* A container query, not the viewport: the list is half width beside the package from lg up. The detail
            gets its own right-aligned column only when the column is wide enough; otherwise it sits under the name. */}
        <div className="@container">
          <h3 className="m-0 flex items-baseline justify-between gap-3 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">
            Integrity checks <span className="num text-num font-normal normal-case tracking-normal text-muted">{okN}/{ds.integrity_checks.length} pass</span>
          </h3>
          <ul className="mt-1 list-none p-0">
            {ds.integrity_checks.map((c) => (
              <li key={c.name} className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2 text-caption first:border-t-0 @lg:grid-cols-[3rem_minmax(0,1fr)_auto]">
                <span className={cx("inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase", c.ok ? "text-ink" : "text-bad")}>
                  <StatusMark state={c.ok ? "on" : "fault"} />{c.ok ? "Pass" : "Fail"}
                </span>
                <span className={c.ok ? "text-muted" : "text-bad"}>{c.name.replace(/_/g, " ")}</span>
                <span className="num col-start-2 min-w-0 break-words text-num-sm text-faint @lg:col-start-auto @lg:text-right">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {ds.research_import && (
            <>
              <h3 className="m-0 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Research package</h3>
              <dl className="mt-1 grid grid-cols-[5.5rem_minmax(0,1fr)] text-caption">
                {([
                  ["Package", <span className="break-all text-muted">{ds.research_import.package}</span>],
                  ["SHA-256", <span className="num text-num-sm text-muted">{chunks(ds.research_import.package_sha256, 16).map((c, j) => <span key={j} className="mr-[1ch] inline-block last:mr-0">{c}</span>)}</span>],
                  ["Imported", <span className="num text-num-sm text-muted" title={ds.research_import.imported_at}>{fmtStamp(ds.research_import.imported_at)}</span>],
                  ["Files", <span className="num text-num-sm text-muted">{ds.research_import.n_files}</span>],
                ] as [string, ReactNode][]).map(([k, v], i) => (
                  <Fragment key={k}>
                    <dt className={cx("py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint", i > 0 && "border-t border-line")}>{k}</dt>
                    <dd className={cx("m-0 min-w-0 py-2", i > 0 && "border-t border-line")}>{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </>
          )}
          <GisIntegration ds={ds} />
        </div>
      </div>
    </div>
  );
}

/** GIS integration readout: what the GIS workstream serves right now (contract, grids, context layers,
 *  live discovery worker) and whether the two MOLA inputs are connected. All values come from
 *  /api/gis/status and /api/datasets; nothing here is a similarity input. */
function GisIntegration({ ds }: { ds: DatasetsResponse }) {
  const gis = useGisStatus();
  const rows = gisRows(gis.data, ds.datasets);
  return (
    <div className="mt-8">
      <h3 className="m-0 flex items-baseline justify-between gap-3 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">
        GIS integration
        <span className="num text-num-sm font-normal normal-case tracking-normal text-faint">/api/gis/status</span>
      </h3>
      {gis.isLoading && <div className="py-3"><Spinner label="Loading GIS status" /></div>}
      {gis.isError && (
        <p className="mt-3 flex items-baseline gap-2 text-caption text-muted"><StatusMark state="fault" className="-translate-y-px" />GIS status could not be loaded.</p>
      )}
      {rows.length > 0 && (
        <dl className="mt-1 grid grid-cols-[minmax(7.5rem,auto)_minmax(0,1fr)] text-caption">
          {rows.map((r, i) => (
            <Fragment key={r.key}>
              <dt className={cx("py-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint", i > 0 && "border-t border-line")}>{r.label}</dt>
              <dd className={cx("m-0 min-w-0 py-2", i > 0 && "border-t border-line")}>
                <span className={cx("inline-flex items-baseline gap-2", r.state === "on" ? "text-ink" : "text-muted")}>
                  <StatusMark state={r.state} className="relative top-[-1px]" />{r.value}
                </span>
                {r.detail && <span className="num mt-0.5 block break-words text-num-sm text-faint">{r.detail}</span>}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <h3 className="m-0 mt-8 border-b border-line pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">Live research comparison</h3>
      <p className="mt-3 text-caption text-muted">{liveSentence(gis.data)}</p>
    </div>
  );
}
