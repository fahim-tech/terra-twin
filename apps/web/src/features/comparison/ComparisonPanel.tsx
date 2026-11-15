import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconButton, Measure, SPRING } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { useLayout } from "../../app/useLayout";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, researchWindowKm, screenCellKm, selectedCandidate } from "../analogs/candidates";
import { ComparePlates } from "./ComparePlates";
import { EvidenceMode } from "./EvidenceMode";
import { StageProbe, useCompareStage, whyDrawerWidth } from "./layout";
import { NO_RING, SectionRule } from "./marks";
import { basisFor, compareTargets, verdictFor } from "./model";
import { type CompareMode, visibleModes } from "./modes";
import { MODE_PANEL_ID, ModeSwitch, modeTabId } from "./ModeSwitch";
import { PairLink } from "./PairLink";
import { PhoneScale } from "./PhoneScale";
import { RatioChart } from "./RatioChart";
import { BackToResults, CompactReadout, PhoneReadout, TelemetryReadout, WhyButton } from "./Readout";
import { RelevanceMode } from "./RelevanceMode";
import { ReliefViewer } from "./relief";
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

/**
 * Comparison stage, as a mission-control telemetry strip docked over the split globes: a title bar
 * (back, what is compared, the square mode switch), the readout cells (Mars | Earth pair, score with its
 * basis, the decision) and the scope line; a mode other than Spatial expands the strip. Plates and
 * dimension lines label each footprint on its globe; the Why drawer is the technical brief. All result
 * text is bound to searchTarget(search), never to the live Mars selection.
 */
export function ComparisonPanel() {
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const whyOpen = useApp((s) => s.whyOpen);
  const set = useApp((s) => s.set);
  const layout = useLayout();
  const phone = layout === "phone";
  const modes = useMemo(() => visibleModes({ relief: ReliefViewer !== null }), []);
  const [modeState, setModeState] = useState<CompareMode>("spatial");
  const mode: CompareMode = modes.some((m) => m.value === modeState) ? modeState : "spatial";
  const stripRef = useRef<HTMLElement>(null);
  // Keep keyboard focus on the chosen tab when the strip re-lays out (and when Escape collapses a mode).
  const setMode = useCallback((m: CompareMode) => {
    setModeState(m);
    requestAnimationFrame(() => stripRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  }, []);
  const c = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  const targets = useMemo(() => (search && c ? compareTargets(search, c) : null), [search, c]);
  const t1 = useMemo(() => (search && c ? tier1Rows(search, c) : null), [search, c]);
  const rows = useMemo(() => (t1 ? t1.rows.map((r) => ratioRow(r.key, r.mars, r.earth, r.s, r.label, r.unit)) : []), [t1]);
  const verdict = useMemo(() => (search && c ? verdictFor(search, c) : null), [search, c]);
  const expanded = mode !== "spatial";
  const stageW = useCompareStage((s) => s.w);

  useEffect(() => {
    if (!targets || !verdict || !c) return;
    useApp.getState().announce(`Comparing ${targets.mars.name} on Mars with ${targets.earth.name} on Earth. ${verdict.headline}. Similarity ${c.score === null ? "not available" : c.score.toFixed(3)}, ${basisFor(c, search)}.`);
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

  // Height of the strip, so a narrowed strip can still mark the full bottom band as covered (below).
  const [stripH, setStripH] = useState(0);
  const hasStrip = !!(search && c && targets && verdict);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStripH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasStrip, phone]);

  if (!search || !c || !targets || !verdict) return <NoCandidate hasSearch={!!search} phone={phone} />;

  const cellKm = screenCellKm(search);
  const winKm = researchWindowKm(search, c.t2);
  const basis = basisFor(c, search);
  const onWhy = () => set({ whyOpen: true });
  // With the Why drawer open, the strip reflows into the width the drawer leaves free (so the G5 scope
  // line is never hidden under it), as long as that leaves a usable strip; otherwise the modal covers it.
  const drawerW = whyDrawerWidth(stageW);
  const stripRight = whyOpen && !phone && stageW - drawerW - 36 >= 520 ? drawerW + 24 : null;
  const narrow = stripRight !== null;
  const modeIndex = modes.findIndex((m) => m.value === mode) + 1;
  const modeSpec = modes.find((m) => m.value === mode)!;
  const readout = { c, basis, targets, verdict, onWhy };

  const panel = expanded && (
    <div role="tabpanel" id={MODE_PANEL_ID} aria-labelledby={modeTabId(mode)} className="relative flex min-h-0 flex-1 flex-col border-t border-line">
      <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
        className="scroll-thin fade-edges min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 max-md:px-4">
        {mode === "measurements" && (
          <>
            <ModeHeader index={modeIndex} title={modeSpec.title} basis={`Global-screen descriptors${cellKm !== null ? `, ${cellKm} km` : ""}, as measured — context, not the research score`}>
              {t1 && <>Global-screen S <Measure value={t1.S} digits={3} className="text-num" /> for this pair{c.tier === 2 ? ` (the ${cellKm !== null ? `${cellKm} km ` : "screening "}cell under the window centre)` : ""}. Mars: median of the zone&rsquo;s {cellKm !== null ? `${cellKm} km ` : "screening "}cells from the 463 m MOLA grid; Earth: GMTED2010.</>}
            </ModeHeader>
            {rows.length ? <RatioChart rows={rows} compact={!phone} /> : <p className="text-body text-muted">Global-screen descriptors are not available for this candidate.</p>}
          </>
        )}
        {mode === "evidence" && (
          <>
            <ModeHeader index={modeIndex} title={modeSpec.title} basis={c.tier === 2 ? `Research comparison${winKm !== null ? ` · ${winKm} km windows` : ""} · research record` : `Global screen${cellKm !== null ? ` · ${cellKm} km cell` : ""} · Earth as measured`} />
            <EvidenceMode search={search} c={c} />
          </>
        )}
        {mode === "relevance" && (
          <>
            <ModeHeader index={modeIndex} title={modeSpec.title} basis="What the comparison does and does not cover" />
            <RelevanceMode c={c} gate={search.tier2.landcover_gate} />
          </>
        )}
        {mode === "relief" && ReliefViewer && (
          <>
            <ModeHeader index={modeIndex} title={modeSpec.title} />
            <ReliefViewer search={search} c={c} targets={targets} phone={phone} />
          </>
        )}
      </motion.div>
    </div>
  );

  return (
    <>
      <StageProbe />
      {!phone && <ComparePlates targets={targets} planets={["mars", "earth"]} whyOpen={whyOpen} compact={expanded} />}
      {!phone && !whyOpen && <PairLink c={c} />}
      {phone && !expanded && <PhoneScale />}
      {/* Phones: the shell's Mars|Earth switch sits over the top of the frame; mark that band as covered
          so the globe frames the compared window below it (the switch itself is not an occluder). */}
      {phone && <div aria-hidden data-occludes="both" className="pointer-events-none absolute inset-x-0 top-0 h-[64px]" />}
      {/* A strip narrowed by the Why drawer no longer spans most of the Earth half, so the inset model
          would stop treating it as a bottom cover and the Earth window would sit lower than the Mars one.
          Mark the full-width band it occupies so both globes keep the same free area and baseline. */}
      {narrow && stripH > 0 && <div aria-hidden data-occludes="both" className="pointer-events-none absolute inset-x-3 bottom-3" style={{ height: stripH }} />}
      <motion.section ref={stripRef} aria-label="Mars–Earth comparison" data-occludes="both"
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING}
        style={{ ...(expanded ? { height: phone ? "70%" : "56%" } : null), ...(narrow ? { right: stripRight } : null) }}
        className={cx("surface frame @container no-print absolute z-20 flex flex-col overflow-hidden",
          phone ? "inset-x-0 bottom-0 [padding-bottom:env(safe-area-inset-bottom)]" : "inset-x-3 bottom-3 rounded-surface")}>
        {/* The title bar is drawn first but follows the readout in the DOM: the shell focuses the stage heading
            (the pair, in the readout), and Tab then reaches the summary, the controls and the open mode in turn. */}
        {phone ? (
          <>
            <PhoneReadout {...readout} expanded={expanded} />
            <div className="order-first flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line py-1.5 pl-4 pr-1.5">
              <BackToResults />
              <WhyButton onWhy={onWhy} className="!px-3 !py-2" />
            </div>
            {panel}
            <div className="shrink-0 overflow-x-auto border-t border-line px-2 py-2 scroll-thin">
              <ModeSwitch modes={modes} value={mode} expanded={expanded} onChange={setMode} fill />
            </div>
          </>
        ) : (
          <>
            {expanded ? <CompactReadout {...readout} narrow={narrow} /> : <TelemetryReadout {...readout} narrow={narrow} />}
            <div className="order-first flex min-h-11 shrink-0 items-center gap-3 border-b border-line py-1.5 pl-4 pr-2">
              <BackToResults />
              <span aria-hidden className="h-4 w-px shrink-0 bg-line-strong" />
              <span className="kicker hidden min-w-0 truncate @min-[760px]:block">Comparison · {targets.footprintLabel}s</span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <ModeSwitch modes={modes} value={mode} expanded={expanded} onChange={setMode} />
                {expanded && (
                  <span className="ml-1 hidden @min-[600px]:block">
                    <IconButton label="Collapse to spatial view" onClick={() => setMode("spatial")}><ChevronDown className="h-4 w-4" strokeWidth={1.75} /></IconButton>
                  </span>
                )}
              </div>
            </div>
            {panel}
          </>
        )}
      </motion.section>
      <AnimatePresence>
        {whyOpen && <WhyDrawer key="why" search={search} c={c} rows={rows} phone={phone} onClose={() => set({ whyOpen: false })} />}
      </AnimatePresence>
    </>
  );
}

function ModeHeader({ index, title, basis, children }: { index: number; title: string; basis?: string; children?: ReactNode }) {
  return (
    <header className="mb-4">
      <SectionRule index={index} title={title} />
      {basis && <p className="mt-2 text-caption text-ink/85">{basis}</p>}
      {children && <p className="mt-0.5 text-caption text-muted">{children}</p>}
    </header>
  );
}

function NoCandidate({ hasSearch, phone }: { hasSearch: boolean; phone: boolean }) {
  const go = useApp((s) => s.go);
  return (
    <section aria-label="Mars–Earth comparison" data-occludes="both"
      className={cx("surface frame no-print absolute z-20", phone ? "inset-x-0 bottom-0 [padding-bottom:env(safe-area-inset-bottom)]" : "inset-x-3 bottom-3 rounded-surface")}>
      <div className="flex min-h-11 items-center border-b border-line px-4">
        <span className="kicker">Comparison</span>
      </div>
      <div className="px-4 pb-4 pt-3">
        <h2 data-stage-heading="compare" tabIndex={-1} style={NO_RING} className="toponym text-toponym-sm text-ink">No Earth candidate selected</h2>
        <p className="mt-1.5 max-w-[640px] text-body text-muted">{hasSearch ? "Choose a research window or a screening cell in the Earth results to compare it with the Mars target." : "Run Find Earth Analogs on a Mars research zone first."}</p>
        <Button variant={hasSearch ? "primary-earth" : "primary-mars"} className="mt-3" onClick={() => go(hasSearch ? "earth" : "mars")}>
          {hasSearch ? "Back to Earth results" : "Back to Mars"}
        </Button>
      </div>
    </section>
  );
}
