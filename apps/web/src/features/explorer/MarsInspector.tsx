import { ArrowRight, ChevronDown, CornerUpLeft } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DECISION_WORDS, type DecisionType, OutcomeMark, outcomeKind } from "../../components/marks";
import { Kicker, PanelBody, PanelFooter, PanelHeader, radioGroupKeys, Term, Toponym } from "../../components/primitives";
import { Button, cx, Note, Segmented } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { type GlossaryKey, zoneName } from "../../lib/glossary";
import { useMarsAnalysis, useMissions, useSites } from "../../services/api";
import { useApp } from "../../store/app";
import type { MarsAnalysis, MissionProfile } from "../../types/contracts";
import { Availability } from "./Availability";
import { Locator } from "./Locator";
import { useExplorer } from "./explorerStore";
import { useSiteOutcomes } from "./outcomes";
import { ContextReadout, GridReadout } from "./GisPoint";
import { OutsideActions, OutsideBody, useGisAvailable } from "./OutsideZone";
import { Mark, Readout, Section, SectionTitle } from "./parts";
import type { Scales } from "./readouts";
import { Terrain, TerrainSkeleton } from "./Terrain";
import { useRunSearch } from "./useRunSearch";
import { useScales } from "./useScales";
import { formatCoord, FOOTPRINTS } from "./zones";
import { DiscoveryAction } from "../analogs/DiscoveryAction";

/**
 * Inspector for the selected Mars point, laid out like a telemetry panel: the target (name and
 * coordinates), then numbered sections — mission, terrain, footprint, evidence — and the docked
 * Find Earth Analogs command. Outside the research zones it says so in one sentence and offers the
 * nearest zone instead of an analysis it cannot run.
 */
export function MarsInspector() {
  const selection = useApp((s) => s.selection);
  const footprintKm = useApp((s) => s.footprintKm);
  const mission = useApp((s) => s.mission);
  const select = useApp((s) => s.select);
  const origin = useExplorer((s) => s.origin);
  const params = selection ? { lat: selection.lat, lon: selection.lon, footprint_km: footprintKm, mission } : null;
  const q = useMarsAnalysis(params);
  const a = q.data;
  const search = useRunSearch();
  const scales = useScales();
  const sites = useSites();
  const root = useRef<HTMLDivElement>(null);
  const inSheet = useSheetFit(root, !!selection);
  const gis = useGisAvailable();
  // Closing unmounts the Close button; keep keyboard users in place by moving focus to the search field.
  const close = () => {
    select(null);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("input[role=combobox]")?.focus());
  };

  // Announce when the measurements for a new selection arrive (or fail).
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!selection || !a) return;
    const k = `${selection.lat}:${selection.lon}`;
    if (announced.current === k) return;
    announced.current = k;
    useApp.getState().announce(a.status === "available"
      ? `${selection.label}: terrain measures loaded.`
      : `${formatCoord(selection.lat, selection.lon)} is outside the research zones. Terrain measurements are not available here.`);
  }, [a, selection]);
  useEffect(() => { if (q.isError) useApp.getState().announce(`Measurements failed to load: ${(q.error as Error).message}`, true); }, [q.isError, q.error]);

  if (!selection) return null;
  const outside = a ? a.status === "unavailable" : !selection.siteId;
  const name = a?.site ? zoneName(a.site) : selection.siteId ? zoneName(selection.siteId) : "Selected point";
  const centre = a ? siteCentre(a) : null;
  const centred = !selection.siteId || !centre || (Math.abs(centre.lat - selection.lat) < 1e-6 && Math.abs(centre.lon - selection.lon) < 1e-6);
  const fromOrigin = origin && !(origin.lat === selection.lat && origin.lon === selection.lon) ? origin : null;

  return (
    <div ref={root} className={cx("group/insp flex min-h-0 flex-col overflow-clip", inSheet && "h-full")}>
      <PanelHeader onClose={close} className={cx(inSheet ? "pb-2 pr-14 pt-1!" : "pr-[76px]")}>
        {/* Where on Mars (panel only; the phone sheet keeps its header compact). */}
        {!inSheet && <div className="absolute right-4 top-[54px]"><Locator lat={selection.lat} lon={selection.lon} zones={sites.data} /></div>}
        <div className="flex items-center gap-2">
          <Mark on={!outside} tone={outside ? "faint" : "mars"} />
          <Kicker tone={outside ? undefined : "mars"}>{outside ? "Outside research zones" : "Research zone"}</Kicker>
        </div>
        <Toponym data-stage-heading="mars" tabIndex={-1} style={{ outline: "none" }} className="mt-2">{name}</Toponym>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Readout label="Lat">{formatLat(selection.lat, 3)}</Readout>
          <Readout label="Lon">{formatLon(selection.lon, 3)}</Readout>
        </div>
        {((!outside && !centred) || fromOrigin) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted">
            {!outside && !centred && <span>Picked point · zone measures describe the whole zone</span>}
            {fromOrigin && (
              <button type="button" onClick={() => { useExplorer.getState().set({ origin: null }); select(fromOrigin); }}
                aria-label={`Back to your point, ${formatCoord(fromOrigin.lat, fromOrigin.lon)}`}
                className="hit -mx-1 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5 text-caption text-muted hover:text-ink [@media(pointer:coarse)]:-my-3">
                <CornerUpLeft className="h-3.5 w-3.5" aria-hidden /> Back to your point
              </button>
            )}
          </div>
        )}
      </PanelHeader>

      <PanelBody className={cx("pb-6", inSheet && "pt-0")}>
        {q.isError && (
          <Note tone="critical" className="py-3">
            Measurements could not be loaded: {(q.error as Error).message}{" "}
            <button type="button" className="hit underline hover:text-ink" onClick={() => q.refetch()}>Retry</button>
          </Note>
        )}
        {outside ? <OutsideBody a={a} /> : (
          <>
            <MissionRow compact={inSheet} siteId={a?.site ?? selection.siteId} />
            <Section n={2} title="Terrain" className={inSheet ? "pb-2.5! pt-1.5!" : undefined}>
              <div aria-busy={q.isLoading}>
                {a ? <Terrain tier1={a.tier1_features} zone={a.ez_features} flags={a.quality_flags} cellKm={scales.cellKm} />
                  : q.isLoading ? <TerrainSkeleton /> : <p className="text-caption text-faint">Not loaded.</p>}
              </div>
            </Section>
            <Section n={3} title="Footprint">
              {/* The selector spans the panel like the grid above it: equal cells, one per footprint. Arrow keys
                  and Home/End move the selection, as in every radio group (the shared Segmented has no keys). */}
              <div className="[&>[role=radiogroup]]:flex [&>[role=radiogroup]]:w-full [&_[role=radio]]:flex-1"
                onKeyDown={radioGroupKeys<number>(FOOTPRINTS, footprintKm, (v) => useApp.getState().set({ footprintKm: v }))}>
                <Segmented ariaLabel="Requested footprint" accent="mars" value={footprintKm}
                  onChange={(v) => useApp.getState().set({ footprintKm: v })}
                  options={FOOTPRINTS.map((k) => ({ value: k, label: <span className="num">{k} km</span> }))} />
              </div>
              <p className="mt-2.5 text-caption text-faint"><FootprintNote scales={scales} /></p>
            </Section>
            <Section n={4} title="Evidence availability">
              {a ? <Availability a={a} /> : q.isLoading ? <div aria-hidden className="h-4 w-56 animate-pulse rounded-control bg-elevated motion-reduce:animate-none" /> : <p className="text-caption text-faint">Not loaded.</p>}
            </Section>
            {/* Point facts from the GIS grids: they describe the picked point, not the zone's research record above. */}
            {gis && (
              <>
                <Section n={5} title="1 km grid at this point">
                  <GridReadout lat={selection.lat} lon={selection.lon} />
                </Section>
                <Section n={6} title="Context · not used in similarity">
                  <ContextReadout lat={selection.lat} lon={selection.lon} />
                </Section>
                {/* In the phone sheet the discovery command lives here, so the docked footer stays one row high. */}
                {inSheet && (
                  <Section n={7} title="Global discovery">
                    <DiscoveryAction selection={selection} variant="outline" />
                  </Section>
                )}
              </>
            )}
          </>
        )}
      </PanelBody>

      {/* Docked command. In the phone sheet it is hidden at the peek detent, where it would cover the header. */}
      <PanelFooter className={cx("border-t border-line", inSheet ? "pt-2.5! group-data-[peek=true]/insp:hidden" : "pt-4!")}>
        {outside ? <OutsideActions selection={selection} compact={inSheet} />
          : (
            <>
              <ZoneActions a={!!a} pending={search.pending} error={search.error} onRun={() => search.run(selection)} compact={inSheet} />
              {gis && !inSheet && <DiscoveryAction selection={selection} variant="outline" caption={false} className="mt-2" />}
            </>
          )}
      </PanelFooter>
    </div>
  );
}

/** The analysis echoes the zone centre (not in the shared schema yet); read it defensively. */
function siteCentre(a: MarsAnalysis): { lat: number; lon: number } | null {
  const c = (a as { site_centre?: unknown }).site_centre;
  if (!c || typeof c !== "object") return null;
  const { lat, lon } = c as { lat?: unknown; lon?: unknown };
  return typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
}

/** "Analyses run on 25 km cells and 50 km windows…" — both sizes from the API, never assumed. */
function FootprintNote({ scales }: { scales: Scales }) {
  const { cellKm, windowKm } = scales;
  return (
    <>
      Analyses run on {cellKm !== null ? <><span className="num">{cellKm}</span> km cells</> : "fixed screening cells"} and{" "}
      <Term k="scale">{windowKm !== null ? `${windowKm} km windows` : "research windows"}</Term>, whatever footprint you draw.
    </>
  );
}

/**
 * The docked command. In the phone sheet (`compact`) the caption under it is left out, so the first row of
 * terrain figures still shows at the half detent.
 */
function ZoneActions({ a, pending, error, onRun, compact }: { a: boolean; pending: boolean; error: Error | null; onRun: () => void; compact?: boolean }) {
  const mission = useApp((s) => s.mission);
  const missions = useMissions();
  const m = missions.data?.find((x) => x.id === mission);
  const blocked = m && !m.available;
  return (
    <>
      {/* The reason is already the mission row's sentence; here only what it means for the command. */}
      {blocked && <Note tone="warning" className="mb-2.5">{m.label} is not available yet, so no search can run.</Note>}
      {error && <Note tone="critical" className="mb-2.5">Search failed: {error.message}</Note>}
      <Button variant="primary-mars" className="h-11 w-full justify-start! py-0" onClick={onRun} disabled={!a || pending || !!blocked}>
        {pending ? (
          <span role="status" className="flex flex-1 items-center justify-between">
            Searching Earth…
            <span aria-hidden className="relative h-2.5 w-2.5 border border-space/45"><span className="absolute inset-[2px] animate-pulse bg-space/80 motion-reduce:animate-none" /></span>
          </span>
        ) : <>Find Earth Analogs <ArrowRight className="ml-auto h-4 w-4" aria-hidden /></>}
      </Button>
      {!compact && (
        <p className="mt-2.5 text-caption text-faint">
          <Term k="globalScreen" /> + <Term k="researchComparison">research comparison</Term>
        </p>
      )}
    </>
  );
}

/**
 * One sentence on what the chosen mission changes, built from the API's own mission profile: its weighting
 * (the part after "Purpose:", or the whole description when it has no purpose prefix) and the land-cover rule.
 */
function missionEffect(m: MissionProfile | undefined): ReactNode {
  if (!m) return null;
  if (!m.available) return m.reason_unavailable ?? "Not available yet.";
  const desc = m.description.trim();
  // The mission weights only the global screen; the research comparison uses equal weights, and the mission
  // only sets its land-cover filter. Say each stage's part, so the outcome below never reads as mission-weighted.
  if (m.gate_mode === "report") {
    const rest = desc.split(/(?<=\.)\s+/).slice(1).join(" ").trim();
    return <>Both stages: {rest ? `${rest[0].toLowerCase()}${rest.slice(1)}` : "equal weights; land cover reported, never used to exclude."}</>;
  }
  const weights = (desc.includes(":") ? desc.slice(desc.indexOf(":") + 1) : desc).trim().replace(/\.$/, "") || null;
  return (
    <>
      {weights && <>Global screen: {weights}. </>}
      Research comparison: equal weights; windows that are <Term k="landCover">vegetated or lack exposed ground</Term> are removed before ranking.
    </>
  );
}

const OUTCOME_TERM: Partial<Record<DecisionType, GlossaryKey>> = { named_leader: "stableLeader", tied_set: "tie", insufficient_evidence: "notEnough" };

/**
 * The zone's published research outcome for the chosen mission (/api/research/summary), with the outcome
 * mark every view uses. It says what Find Earth Analogs will show; nothing here is computed. `compact` (the
 * phone sheet) sets it tighter, so the first row of terrain figures still shows at the half detent.
 */
function ZoneOutcome({ siteId, compact = false }: { siteId: string | null; compact?: boolean }) {
  const { bySite, loading, gateMode } = useSiteOutcomes();
  const missions = useMissions();
  const o = siteId ? bySite[siteId] : undefined;
  const term = o ? OUTCOME_TERM[o.type] : undefined;
  const value = o ? (
    <span className="inline-flex min-w-0 items-baseline gap-2 text-ink">
      <OutcomeMark kind={outcomeKind(o.type)} />
      <span>
        {term ? <Term k={term}>{DECISION_WORDS[o.type]}</Term> : DECISION_WORDS[o.type]}
        {o.type === "tied_set" && <span className="text-muted"> · <span className="num">{o.members.length}</span> equivalent windows</span>}
      </span>
    </span>
  ) : (
    <span className="inline-flex items-baseline gap-2 text-faint">
      <OutcomeMark kind="not_loaded" />
      {loading ? "Loading…" : !gateMode && missions.data ? "None for this mission" : "Not in the research record"}
    </span>
  );
  return (
    <div className={cx("flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption", compact ? "mt-1" : "mt-2.5")}>
      <span className="kicker shrink-0">Research outcome</span>
      {value}
    </div>
  );
}

/** Mission as a parameter row — "01  MISSION  [LANDING SITE ⌄]" — with one sentence on what it changes. */
function MissionRow({ compact, siteId }: { compact?: boolean; siteId: string | null }) {
  const mission = useApp((s) => s.mission);
  const missions = useMissions();
  const m = missions.data?.find((x) => x.id === mission);
  return (
    <section aria-labelledby="mars-mission-title" className={compact ? "pb-1 pt-1" : "pb-3.5 pt-2"}>
      <div className="flex items-center gap-4">
        <h3 id="mars-mission-title" className="kicker shrink-0 !text-ink/80">
          <SectionTitle n={1}><label htmlFor="mars-mission" className="cursor-pointer">Mission</label></SectionTitle>
        </h3>
        {/* Native select for its accessibility and phone pickers, drawn as a square instrument field with our own chevron. */}
        <span className="relative min-w-0 flex-1">
          <select id="mars-mission" value={mission} onChange={(e) => useApp.getState().set({ mission: e.target.value })}
            className="hit h-9 w-full cursor-pointer appearance-none truncate rounded-control bg-white/[0.025] py-0 pl-3 pr-9 toponym text-[14px] tracking-[0.08em] text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-[box-shadow,background-color] duration-150 hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgb(242_244_245/0.4)]">
            {(missions.data ?? [{ id: mission, label: "Loading…", available: true } as MissionProfile]).map((x) => (
              <option key={x.id} value={x.id} disabled={!x.available}>{x.label}{x.available ? "" : " — not available yet"}</option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        </span>
      </div>
      <p className={cx("text-caption text-muted", compact ? "mt-1.5" : "mt-2")}>{missionEffect(m)}</p>
      <ZoneOutcome siteId={siteId} compact={compact} />
    </section>
  );
}

/**
 * Phone sheet fit. The Sheet lays its content out at full height and slides it down, so a footer at
 * the foot of the column would sit below the screen at the half detent, and focus moving to a control
 * below the visible part would scroll the stage. Instead, the inspector's own height is kept equal to
 * the visible part of the sheet (updated as the sheet moves): the footer stays in the flow at the
 * screen's foot, the body scrolls inside, and nothing outside the body ever needs to scroll. As a
 * guard, any scroll of the stage or the sheet's scroller is undone. Returns true inside the sheet.
 * (Shared-file request: Sheet should expose a footer slot and size its scroller to the detent.)
 */
function useSheetFit(root: React.RefObject<HTMLDivElement>, mounted: boolean): boolean {
  const [inSheet, setInSheet] = useState(false);
  useLayoutEffect(() => {
    const el = root.current;
    const sheet = el?.closest<HTMLElement>("[data-sheet]");
    const host = sheet?.parentElement;
    if (!el || !sheet || !host) { setInSheet(false); return; }
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && scroller !== sheet && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller || scroller === sheet) { setInSheet(false); return; }
    const sc = scroller;
    const stage = sheet.closest("main");
    setInSheet(true);
    let raf = 0;
    const fit = () => {
      const top = sc.getBoundingClientRect().top;
      const bottom = Math.min(host.getBoundingClientRect().bottom, window.innerHeight);
      const cap = parseFloat(sc.style.maxHeight) || Infinity;
      const h = Math.max(0, Math.min(cap, Math.floor(bottom - top)));
      el.style.height = `${h}px`;
      el.dataset.peek = String(h < 260);
    };
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    const unscroll = (e: Event) => { const t = e.currentTarget as HTMLElement; if (t.scrollTop !== 0) t.scrollTop = 0; };
    fit();
    const mo = new MutationObserver(measure);
    mo.observe(sheet, { attributes: true, attributeFilter: ["style"] });
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener("resize", measure);
    sc.addEventListener("scroll", unscroll);
    stage?.addEventListener("scroll", unscroll);
    return () => {
      cancelAnimationFrame(raf); mo.disconnect(); ro.disconnect();
      window.removeEventListener("resize", measure);
      sc.removeEventListener("scroll", unscroll);
      stage?.removeEventListener("scroll", unscroll);
      el.style.height = "";
    };
  }, [root, mounted]);
  return inSheet;
}
