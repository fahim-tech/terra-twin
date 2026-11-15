import { ArrowRight, CornerUpLeft } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Block, Kicker, PanelBody, PanelFooter, PanelHeader, Term, Toponym } from "../../components/primitives";
import { Button, cx, Note, Segmented } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useMarsAnalysis, useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import type { MarsAnalysis, MissionProfile } from "../../types/contracts";
import { Availability } from "./Availability";
import { useExplorer } from "./explorerStore";
import { OutsideActions, OutsideBody } from "./OutsideZone";
import { Terrain, TerrainSkeleton } from "./Terrain";
import { useRunSearch } from "./useRunSearch";
import { formatCoord, FOOTPRINTS } from "./zones";

/**
 * Inspector for the selected Mars point. Order: place → mission → terrain → footprint → evidence →
 * Find Earth Analogs. Outside the research zones it says so in one sentence and offers the nearest
 * zone instead of an analysis it cannot run.
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
  const root = useRef<HTMLDivElement>(null);
  const inSheet = useSheetFit(root, !!selection);
  useContentSizedSurface(root, !!selection && !inSheet);

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
    <div ref={root} className={cx("group/insp flex min-h-0 flex-col overflow-clip", inSheet ? "h-full" : "surface pointer-events-auto max-h-full rounded-surface")}>
      <PanelHeader onClose={() => select(null)} className={cx("pr-14", inSheet && "pb-2 pt-1!")}>
        <Kicker tone={outside ? undefined : "mars"}>{outside ? "Outside research zones" : "Research zone"}</Kicker>
        <Toponym data-stage-heading="mars" tabIndex={-1} style={{ outline: "none" }} className="mt-1.5">{name}</Toponym>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted">
          <span className="num text-num">{formatLat(selection.lat, 3)} {formatLon(selection.lon, 3)}</span>
          {!outside && !centred && <span>picked point · zone measures describe the whole zone</span>}
          {fromOrigin && (
            <button type="button" onClick={() => { useExplorer.getState().set({ origin: null }); select(fromOrigin); }}
              aria-label={`Back to your point, ${formatCoord(fromOrigin.lat, fromOrigin.lon)}`}
              className="hit -mx-1 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5 text-caption text-muted hover:text-ink [@media(pointer:coarse)]:-my-3">
              <CornerUpLeft className="h-3.5 w-3.5" aria-hidden /> Back to your point
            </button>
          )}
        </div>
      </PanelHeader>

      <PanelBody className={cx("pb-4", inSheet && "pt-0")}>
        {q.isError && (
          <Note tone="critical" className="py-3">
            Measurements could not be loaded: {(q.error as Error).message}{" "}
            <button type="button" className="hit underline hover:text-ink" onClick={() => q.refetch()}>Retry</button>
          </Note>
        )}
        {outside ? <OutsideBody a={a} /> : (
          <>
            <MissionRow />
            <Block title="Terrain" className="pt-2">
              <div aria-busy={q.isLoading}>
                {a ? <Terrain tier1={a.tier1_features} zone={a.ez_features} flags={a.quality_flags} /> : q.isLoading ? <TerrainSkeleton /> : <p className="text-caption text-faint">Not loaded.</p>}
              </div>
            </Block>
            <Block title="Footprint">
              <Segmented ariaLabel="Requested footprint" accent="mars" value={footprintKm}
                onChange={(v) => useApp.getState().set({ footprintKm: v })}
                options={FOOTPRINTS.map((k) => ({ value: k, label: <span className="num">{k} km</span> }))} />
              <p className="mt-2 text-caption text-faint">
                Analyses run on 25 km cells and <Term k="scale">50 km windows</Term>, whatever footprint you draw.
              </p>
            </Block>
            <Block title="Evidence availability">
              {a ? <Availability a={a} /> : q.isLoading ? <div aria-hidden className="h-4 w-56 animate-pulse rounded-control bg-elevated motion-reduce:animate-none" /> : <p className="text-caption text-faint">Not loaded.</p>}
            </Block>
          </>
        )}
      </PanelBody>

      {/* In the phone sheet the footer is hidden at the peek detent, where it would cover the header. */}
      <PanelFooter className={cx(inSheet && "pt-2 group-data-[peek=true]/insp:hidden")}>
        {outside ? <OutsideActions selection={selection} /> : <ZoneActions a={!!a} pending={search.pending} error={search.error} onRun={() => search.run(selection)} />}
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

function ZoneActions({ a, pending, error, onRun }: { a: boolean; pending: boolean; error: Error | null; onRun: () => void }) {
  const mission = useApp((s) => s.mission);
  const missions = useMissions();
  const m = missions.data?.find((x) => x.id === mission);
  const blocked = m && !m.available;
  return (
    <>
      {blocked && <Note tone="warning" className="mb-2.5">{m.label}: {m.reason_unavailable ?? "not available yet"}</Note>}
      {error && <Note tone="critical" className="mb-2.5">Search failed: {error.message}</Note>}
      <Button variant="primary-mars" className="w-full py-2.5" onClick={onRun} disabled={!a || pending || !!blocked}>
        {pending ? <span role="status">Searching Earth…</span> : <>Find Earth Analogs <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </Button>
      <p className="mt-2 text-center text-caption text-faint">
        <Term k="globalScreen" /> + <Term k="researchComparison">research comparison</Term>
      </p>
    </>
  );
}

/** One sentence on what the chosen mission changes. Built from the API's own mission profile. */
function missionEffect(m: MissionProfile | undefined): ReactNode {
  if (!m) return null;
  if (!m.available) return m.reason_unavailable ?? "Not available yet.";
  const desc = m.description.trim();
  if (m.gate_mode === "report") {
    const rest = desc.split(/(?<=\.)\s+/).slice(1).join(" ");
    return rest || "Land cover is reported, never used to exclude.";
  }
  const weights = desc.includes(":") ? desc.slice(desc.indexOf(":") + 1).trim().replace(/\.$/, "") : null;
  return (
    <>
      {weights ? `${weights[0].toUpperCase()}${weights.slice(1)}; ` : ""}
      <Term k="landCover">{weights ? "vegetated ground" : "Vegetated ground"}</Term> is removed before ranking.
    </>
  );
}

function MissionRow() {
  const mission = useApp((s) => s.mission);
  const missions = useMissions();
  const m = missions.data?.find((x) => x.id === mission);
  return (
    <section className="pb-2.5 pt-1" aria-label="Mission">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="mars-mission" className="text-label text-ink">Mission</label>
        <select id="mars-mission" value={mission} onChange={(e) => useApp.getState().set({ mission: e.target.value })}
          className="hit h-9 min-w-0 max-w-[230px] flex-1 cursor-pointer rounded-control bg-elevated px-2.5 text-label text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none">
          {(missions.data ?? [{ id: mission, label: "Loading…", available: true } as MissionProfile]).map((x) => (
            <option key={x.id} value={x.id} disabled={!x.available}>{x.label}{x.available ? "" : " — not available yet"}</option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-caption text-muted">{missionEffect(m)}</p>
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
    const sheet = el?.closest<HTMLElement>('section[aria-label="Selected location"]');
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

/**
 * Desktop/tablet: the shared context surface is full stage height. The inspector should be sized to
 * its content (spec 17(b)1), so the host keeps its full-height box (globe framing is unchanged) but
 * drops its own surface paint and pointer events, and the inspector draws the surface itself at its
 * content height, capped at the stage. Restored on unmount.
 * (Shared-file request: ContextSurface should size to content with max-height = stage.)
 */
function useContentSizedSurface(root: React.RefObject<HTMLDivElement>, active: boolean) {
  useLayoutEffect(() => {
    const host = active ? root.current?.closest<HTMLElement>("aside[data-occludes]") : null;
    if (!host) return;
    const off: Record<string, string> = {
      background: "transparent", "box-shadow": "none", "backdrop-filter": "none", "-webkit-backdrop-filter": "none",
      "pointer-events": "none", overflow: "visible",
    };
    const prev = Object.keys(off).map((k) => [k, host.style.getPropertyValue(k)] as const);
    for (const [k, v] of Object.entries(off)) host.style.setProperty(k, v);
    return () => { for (const [k, v] of prev) { if (v) host.style.setProperty(k, v); else host.style.removeProperty(k); } };
  }, [root, active]);
}
