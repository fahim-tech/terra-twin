import { ArrowLeft, ChevronDown, MessageCircleQuestion } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconButton, Kicker, Measure, Tabs } from "../../components/primitives";
import { CompareTerm as Term } from "./CompareTerm";
import { Button, cx } from "../../components/ui";
import { useLayout } from "../../app/useLayout";
import { G5 } from "../../lib/glossary";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, selectedCandidate } from "../analogs/candidates";
import { ComparePlates } from "./ComparePlates";
import { EvidenceMode } from "./EvidenceMode";
import { StageProbe, useCompareStage, whyDrawerWidth } from "./layout";
import { basisFor, compareTargets, verdictFor, type Verdict } from "./model";
import { RatioChart } from "./RatioChart";
import { RelevanceMode } from "./RelevanceMode";
import { ratioRow, TIER1_SPECS } from "./science";
import { WhyDrawer } from "./WhyDrawer";

// Kept for the report package, which imports these from here.
export { DIMENSIONS } from "./RelevanceMode";

export interface CompareRow { key: string; label: string; unit: string; mars: number | null; earth: number | null; s: number | null }

/** Global-screen (tier-1, 25 km, as measured) descriptors for the pair — context, not the research score. */
export function tier1Rows(search: AnalogSearch, c: CandidateView): { rows: CompareRow[]; S: number | null; coverage: number | null; regionId: string } | null {
  const marsT1 = Object.fromEntries(search.mars.tier1_features.map((f) => [f.key, f.value]));
  if (c.t1) {
    return {
      regionId: c.t1.region_id, S: c.t1.similarity, coverage: c.t1.coverage,
      rows: Object.keys(TIER1_SPECS).map((k) => ({ key: k, label: TIER1_SPECS[k].label, unit: TIER1_SPECS[k].unit, mars: marsT1[k] ?? null, earth: c.t1!.features[k] ?? null, s: c.t1!.per_feature[k] ?? null })),
    };
  }
  const ctx = c.t2?.tier1_context;
  if (!ctx) return null;
  return {
    regionId: ctx.region_id, S: ctx.similarity, coverage: ctx.coverage,
    rows: ctx.rows.map((r) => ({ ...r, label: TIER1_SPECS[r.key]?.label ?? r.key })),
  };
}

type Mode = "spatial" | "measurements" | "evidence" | "relevance";
const PANEL_ID = "compare-mode-panel";
const tabId = (m: Mode) => `compare-mode-tab-${m}`;
const MODES: { value: Mode; label: string }[] = [
  { value: "spatial", label: "Spatial" },
  { value: "measurements", label: "Measurements" },
  { value: "evidence", label: "Evidence" },
  { value: "relevance", label: "Relevance" },
];

/**
 * Comparison stage: a summary strip over the split globes (pair, verdict, score with its basis and
 * scope) whose modes expand it; plates name each footprint; the Why drawer explains the pair. All
 * result text is bound to searchTarget(search), never to the live Mars selection.
 */
export function ComparisonPanel() {
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const whyOpen = useApp((s) => s.whyOpen);
  const set = useApp((s) => s.set);
  const layout = useLayout();
  const phone = layout === "phone";
  const [mode, setModeState] = useState<Mode>("spatial");
  const stripRef = useRef<HTMLElement>(null);
  // The summary re-lays out between collapsed and expanded, so keep keyboard focus on the chosen tab.
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    requestAnimationFrame(() => stripRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  }, []);
  const c = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  const targets = useMemo(() => (search && c ? compareTargets(search, c) : null), [search, c]);
  const t1 = useMemo(() => (search && c ? tier1Rows(search, c) : null), [search, c]);
  const rows = useMemo(() => (t1 ? t1.rows.map((r) => ratioRow(r.key, r.mars, r.earth, r.s, r.label, r.unit)) : []), [t1]);
  const verdict = useMemo(() => (search && c ? verdictFor(search, c) : null), [search, c]);
  const expanded = mode !== "spatial";

  useEffect(() => {
    if (!targets || !verdict || !c) return;
    useApp.getState().announce(`Comparing ${targets.mars.name} on Mars with ${targets.earth.name} on Earth. ${verdict.headline}. Similarity ${c.score === null ? "not available" : c.score.toFixed(3)}, ${basisFor(c)}.`);
  }, [targets, verdict, c]);

  // Escape collapses an expanded mode before it leaves the comparison. The shell routes Escape from
  // the page and from a focused globe through closeTopmost(), so the collapse step is layered onto
  // it while a mode is open (Why drawer first, then the mode, then the shell's own order). An open
  // term popover consumes Escape itself (CompareTerm), so one press never closes two layers.
  useEffect(() => {
    if (!expanded) return;
    const shell = useApp.getState().closeTopmost;
    const closeTopmost = () => {
      const s = useApp.getState();
      if (s.whyOpen || s.stage !== "compare") return shell();
      setMode("spatial");
      return true;
    };
    useApp.setState({ closeTopmost });
    return () => { if (useApp.getState().closeTopmost === closeTopmost) useApp.setState({ closeTopmost: shell }); };
  }, [expanded, setMode]);

  // The shared Tabs primitive has no roving focus or tab/panel ids yet; add both here.
  useLayoutEffect(() => {
    const tabs = stripRef.current?.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Comparison mode"] [role="tab"]');
    tabs?.forEach((t, i) => {
      const m = MODES[i]?.value;
      if (!m) return;
      const on = m === mode;
      t.id = tabId(m);
      t.tabIndex = on ? 0 : -1;
      if (on && expanded) t.setAttribute("aria-controls", PANEL_ID); else t.removeAttribute("aria-controls");
    });
  });
  const onTabKeys = useCallback((e: React.KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key) || (e.target as HTMLElement).getAttribute("role") !== "tab") return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.value === mode);
    const n = MODES.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    setMode(MODES[next].value);
  }, [mode, setMode]);

  // Height of the strip, so a narrowed strip can still mark the full bottom band as covered (below).
  const [stripH, setStripH] = useState(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStripH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });

  if (!search || !c || !targets || !verdict) return <NoCandidate hasSearch={!!search} phone={phone} />;

  // With the Why drawer open, the strip reflows into the width the drawer leaves free (so the G5 scope
  // line is never hidden under it), as long as that leaves a usable strip; otherwise the modal covers it.
  const stageW = useCompareStage((s) => s.w);
  const drawerW = whyDrawerWidth(stageW);
  const stripRight = whyOpen && !phone && stageW - drawerW - 36 >= 520 ? drawerW + 24 : null;
  return (
    <>
      <StageProbe />
      {!phone && <ComparePlates targets={targets} planets={["mars", "earth"]} whyOpen={whyOpen} />}
      {/* Phones: the shell's Mars|Earth switch sits over the top of the frame; mark that band as covered
          so the globe frames the compared window below it (the switch itself is not an occluder). */}
      {phone && <div aria-hidden data-occludes="both" className="pointer-events-none absolute inset-x-0 top-0 h-[64px]" />}
      {/* A strip narrowed by the Why drawer no longer spans most of the Earth half, so the inset model
          would stop treating it as a bottom cover and the Earth window would sit lower than the Mars one.
          Mark the full-width band it occupies so both globes keep the same free area and baseline. */}
      {stripRight !== null && stripH > 0 && <div aria-hidden data-occludes="both" className="pointer-events-none absolute inset-x-3 bottom-3" style={{ height: stripH }} />}
      <motion.section ref={stripRef} aria-label="Mars–Earth comparison" data-occludes="both"
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        style={{ ...(expanded ? { height: phone ? "70%" : "56%" } : null), ...(stripRight !== null ? { right: stripRight } : null) }}
        className={cx("surface no-print absolute z-20 flex flex-col overflow-hidden",
          phone ? "inset-x-0 bottom-0 rounded-t-surface [padding-bottom:env(safe-area-inset-bottom)]" : "inset-x-3 bottom-3 rounded-surface")}>
        <Summary c={c} targets={targets} verdict={verdict} mode={mode} setMode={setMode} onTabKeys={onTabKeys} phone={phone} narrow={stripRight !== null} onWhy={() => set({ whyOpen: true })} />
        {expanded && (
          <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(mode)} className="relative flex min-h-0 flex-1 flex-col">
            <div className="mx-6 h-px shrink-0 bg-line/70 max-md:mx-4" aria-hidden />
            <IconButton label="Collapse to spatial view" onClick={() => setMode("spatial")} className="absolute right-3 top-1.5 z-10"><ChevronDown className="h-4 w-4" /></IconButton>
            <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              className="scroll-thin fade-edges min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-3 max-md:px-4">
              {mode === "measurements" && (
                <>
                  <ModeHeader title="Terrain measurements" basis="Global-screen descriptors, 25 km, as measured — context, not the research score">
                    {t1 && <>Global-screen S <Measure value={t1.S} digits={3} className="text-num" /> for this pair{c.tier === 2 ? " (the 25 km cell under the window centre)" : ""}. Mars: median of the zone's 25 km cells from the 463 m MOLA grid; Earth: GMTED2010.</>}
                  </ModeHeader>
                  {rows.length ? <RatioChart rows={rows} compact={!phone} /> : <p className="text-body text-muted">Global-screen descriptors are not available for this candidate.</p>}
                </>
              )}
              {mode === "evidence" && (
                <>
                  <ModeHeader title="Scientific evidence" basis={c.tier === 2 ? `Research comparison · ${c.t2?.window_km ?? search.tier2.target.window_km} km windows · research record` : "Global screen · 25 km cell · Earth as measured"} />
                  <EvidenceMode search={search} c={c} />
                </>
              )}
              {mode === "relevance" && (
                <>
                  <ModeHeader title="Exploration relevance" basis="What the comparison does and does not cover" />
                  <RelevanceMode c={c} gate={search.tier2.landcover_gate} />
                </>
              )}
            </motion.div>
          </div>
        )}
      </motion.section>
      <AnimatePresence>
        {whyOpen && <WhyDrawer key="why" search={search} c={c} rows={rows} phone={phone} onClose={() => set({ whyOpen: false })} />}
      </AnimatePresence>
    </>
  );
}

function Summary({ c, targets, verdict, mode, setMode, onTabKeys, phone, narrow = false, onWhy }: {
  c: CandidateView; targets: NonNullable<ReturnType<typeof compareTargets>>; verdict: Verdict;
  mode: Mode; setMode: (m: Mode) => void; onTabKeys: (e: React.KeyboardEvent) => void; phone: boolean;
  /** The strip shares the width with the open Why drawer: two columns, modes below, no second Why button. */
  narrow?: boolean; onWhy: () => void;
}) {
  const go = useApp((s) => s.go);
  const verdictTerm = verdict.kind === "leader" ? "stableLeader" : verdict.kind === "tie_member" ? "tie" : verdict.kind === "insufficient" ? "notEnough" : null;
  const back = (
    <button type="button" onClick={() => go("earth")} className="hit -ml-1 inline-flex items-center gap-1 rounded-control px-1 text-caption text-muted hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Results
    </button>
  );
  const heading = (
    <h2 data-stage-heading="compare" tabIndex={-1} style={{ outline: "none" }} className={cx("toponym text-ink", phone ? "mt-0.5 text-toponym-sm" : "mt-1 text-toponym")}>
      <span className="sr-only">Comparing </span>
      <span>{targets.mars.name}</span>
      <span className="mx-2 text-muted" aria-label="with">↔</span>
      <span>{targets.earth.name}</span>
    </h2>
  );
  const verdictLine = (
    <p className="text-label text-ink">
      <span aria-hidden className="mr-1.5">{verdict.glyph}</span>
      {verdictTerm ? <Term k={verdictTerm}>{verdict.headline}</Term> : verdict.headline}
    </p>
  );
  const figure = <Measure value={c.score} digits={3} className="text-figure text-ink" missing="no score" />;
  const why = (
    <Button variant="primary-earth" onClick={onWhy} className={cx(phone && "px-3 py-1.5")}>
      <MessageCircleQuestion className="h-4 w-4" aria-hidden /> Why this analog?
    </Button>
  );
  const tabs = <div onKeyDown={onTabKeys}><Tabs ariaLabel="Comparison mode" value={mode} onChange={setMode} options={MODES} className={phone ? "gap-4" : undefined} /></div>;

  if (phone) {
    // Phone: one column, the G5 verdict label and scope one tap away (Term popovers).
    return (
      <div className="shrink-0 px-4 pb-3 pt-2">
        <div className="flex items-center justify-between gap-3">{back}{why}</div>
        {heading}
        <div className="mt-1 flex items-baseline justify-between gap-3">
          {verdictLine}
          <span className="flex items-baseline gap-1.5"><span className="text-caption text-muted"><Term k="similarity">S</Term></span>{figure}</span>
        </div>
        <p className="mt-1 text-caption text-ink/90">{basisFor(c)}</p>
        <p className="mt-0.5 text-caption text-muted">
          <Term k="scope" />{c.tier === 2 && <> · validated on <Term k="synthetic" /></>}
        </p>
        <div className="-mx-4 mt-1 overflow-x-auto px-4 scroll-thin">{tabs}</div>
      </div>
    );
  }

  if (mode !== "spatial") {
    // Expanded: the same facts on two lines so the mode gets the room; G5 strings stay one click away.
    return (
      <div className="shrink-0 px-6 pb-2.5 pt-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {back}
          <h2 data-stage-heading="compare" tabIndex={-1} style={{ outline: "none" }} className="toponym text-toponym-sm text-ink">
            <span className="sr-only">Comparing </span>{targets.mars.name}<span className="mx-1.5 text-muted" aria-label="with">↔</span>{targets.earth.name}
          </h2>
          {verdictLine}
          <span className="flex items-baseline gap-1.5"><span className="text-caption text-muted"><Term k="similarity">S</Term></span><Measure value={c.score} digits={3} className="text-title font-normal text-ink" missing="no score" /></span>
          <div className="ml-auto flex items-center gap-5">{tabs}{why}</div>
        </div>
        <p className="mt-0.5 text-caption text-muted">
          <span className="text-ink/90">{basisFor(c)}</span> · <Term k="scope" />{c.tier === 2 && <> · validated on <Term k="synthetic" /></>} · <span className="text-faint">{verdict.detail}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={cx("grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-x-8 gap-y-2 px-6 pb-3 pt-4", !narrow && "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_auto]")}>
      {/* Pair and verdict */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {back}
          <span className="text-faint" aria-hidden>·</span>
          <Kicker>Comparison · {targets.footprintLabel}s</Kicker>
        </div>
        {heading}
        <div className="mt-1.5">{verdictLine}</div>
        <p className="mt-0.5 text-caption text-muted">{verdict.detail}</p>
      </div>

      {/* Score, basis, scope */}
      <div className="min-w-0 pt-1">
        <div className="flex items-baseline gap-3">
          <span className="text-caption text-muted"><Term k="similarity" /></span>
          {figure}
        </div>
        <p className="mt-1 text-caption text-ink/90">{basisFor(c)}</p>
        <p className="mt-0.5 text-caption text-muted">{G5.scope}</p>
        {c.tier === 2 && <p className="mt-0.5 text-caption text-faint">Validated on <Term k="synthetic" /></p>}
      </div>

      {/* Modes */}
      <div className={cx("col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2", !narrow && "xl:col-span-1 xl:flex-col xl:items-end xl:justify-start")}>
        {tabs}
        {!narrow && why}
      </div>
    </div>
  );
}

function ModeHeader({ title, basis, children }: { title: string; basis: string; children?: React.ReactNode }) {
  return (
    <header className="mb-3 pr-10">
      <h3 className="text-title text-ink">{title}</h3>
      <p className="mt-0.5 text-caption text-ink/90">{basis}</p>
      {children && <p className="mt-0.5 text-caption text-muted">{children}</p>}
    </header>
  );
}

function NoCandidate({ hasSearch, phone }: { hasSearch: boolean; phone: boolean }) {
  const go = useApp((s) => s.go);
  return (
    <section aria-label="Mars–Earth comparison" data-occludes="both"
      className={cx("surface no-print absolute z-20 px-6 py-5", phone ? "inset-x-0 bottom-0 rounded-t-surface" : "inset-x-3 bottom-3 rounded-surface")}>
      <Kicker>Comparison</Kicker>
      <h2 data-stage-heading="compare" tabIndex={-1} className="toponym mt-1 text-toponym-sm text-ink outline-none">No Earth candidate selected</h2>
      <p className="mt-1 text-body text-muted">{hasSearch ? "Choose a research window or a screening cell in the Earth results to compare it with the Mars target." : "Run Find Earth Analogs on a Mars research zone first."}</p>
      <Button variant={hasSearch ? "primary-earth" : "primary-mars"} className="mt-3" onClick={() => go(hasSearch ? "earth" : "mars")}>
        {hasSearch ? "Back to Earth results" : "Back to Mars"}
      </Button>
    </section>
  );
}
