import { ArrowRight, CornerUpLeft } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Block, Kicker, PanelBody, PanelFooter, PanelHeader, Term, Toponym } from "../../components/primitives";
import { Button, cx, Note, Segmented } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useMarsAnalysis, useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import type { MissionProfile } from "../../types/contracts";
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
  const footerHost = useSheetFooterHost(root);

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
  const centred = !!selection.siteId && a?.site_centre ? Math.abs((a.site_centre as { lat: number }).lat - selection.lat) < 1e-6 : true;
  const fromOrigin = origin && !(origin.lat === selection.lat && origin.lon === selection.lon) ? origin : null;

  const footer = (
    <PanelFooter className={cx(footerHost && "pointer-events-auto absolute inset-x-0 bottom-0 z-30 bg-surface shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.06)]")}>
      {outside ? <OutsideActions selection={selection} /> : <ZoneActions a={!!a} pending={search.pending} error={search.error} onRun={() => search.run(selection)} />}
    </PanelFooter>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col">
      <PanelHeader onClose={() => select(null)} className="pr-14">
        <Kicker tone={outside ? undefined : "mars"}>{outside ? "Outside research zones" : "Research zone"}</Kicker>
        <Toponym data-stage-heading="mars" tabIndex={-1} style={{ outline: "none" }} className="mt-1.5">{name}</Toponym>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-muted">
          <span className="num text-num">{formatLat(selection.lat, 3)} {formatLon(selection.lon, 3)}</span>
          {!outside && !centred && <span>picked point · zone measures describe the whole zone</span>}
        </p>
        {fromOrigin && (
          <button type="button" onClick={() => { useExplorer.getState().set({ origin: null }); select(fromOrigin); }}
            className="hit -mx-1 mt-1.5 inline-flex items-center gap-1.5 rounded-control px-1 py-0.5 text-caption text-muted hover:text-ink">
            <CornerUpLeft className="h-3.5 w-3.5" aria-hidden /> Back to your point <span className="num text-num-sm">{formatCoord(fromOrigin.lat, fromOrigin.lon)}</span>
          </button>
        )}
      </PanelHeader>

      <PanelBody className="pb-4">
        {q.isError && (
          <Note tone="critical" className="py-3">
            Measurements could not be loaded: {(q.error as Error).message}{" "}
            <button type="button" className="underline hover:text-ink" onClick={() => q.refetch()}>Retry</button>
          </Note>
        )}
        {outside ? <OutsideBody a={a} /> : (
          <>
            <MissionRow />
            <Block title="Terrain" className="pt-2">
              <div aria-busy={q.isLoading}>
                {a ? <Terrain tier1={a.tier1_features} zone={a.ez_features} flags={a.quality_flags} /> : q.isLoading ? <TerrainSkeleton /> : null}
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
              {a ? <Availability a={a} /> : <div aria-hidden className="h-4 w-56 animate-pulse rounded-control bg-elevated motion-reduce:animate-none" />}
            </Block>
          </>
        )}
        {footerHost && <div aria-hidden style={{ height: outside ? 176 : 132 }} />}
      </PanelBody>

      {footerHost ? (footerHost.visible ? createPortal(footer, footerHost.el) : null) : footer}
    </div>
  );
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
export function missionEffect(m: MissionProfile | undefined): ReactNode {
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
 * Workaround for the phone sheet: its content is laid out at full height and slid down, so a footer at
 * the foot of the column sits off-screen at the half detent. When this inspector is inside the sheet,
 * the footer is portalled to the sheet's host and pinned to the bottom of the visible stage; it hides
 * at the peek detent, where it would cover the header. (Shared-file request: Sheet should expose a
 * footer slot.)
 */
function useSheetFooterHost(root: React.RefObject<HTMLDivElement>): { el: HTMLElement; visible: boolean } | null {
  const [host, setHost] = useState<{ el: HTMLElement; visible: boolean } | null>(null);
  useLayoutEffect(() => {
    const sheet = root.current?.closest<HTMLElement>("section[aria-label]");
    const el = sheet?.parentElement;
    if (!sheet || !el || el.tagName === "MAIN") { setHost(null); return; }
    let visible = true;
    const measure = () => {
      const top = sheet.getBoundingClientRect().top;
      const bottom = el.getBoundingClientRect().bottom;
      const v = bottom - top > 260;
      if (v !== visible) { visible = v; setHost({ el, visible: v }); }
    };
    setHost({ el, visible: true });
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(sheet, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", measure);
    return () => { mo.disconnect(); window.removeEventListener("resize", measure); };
  }, [root]);
  return host;
}
