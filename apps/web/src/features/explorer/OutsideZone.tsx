import { ArrowRight } from "lucide-react";
import { decisionWord, OutcomeMark, outcomeKind } from "../../components/marks";
import { Disclosure } from "../../components/primitives";
import { Button } from "../../components/ui";
import { useSites } from "../../services/api";
import { useGisStatus } from "../../services/gis";
import { useApp, type Selection } from "../../store/app";
import type { MarsAnalysis } from "../../types/contracts";
import { distanceKm, R_MARS_M } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { DiscoveryAction } from "../analogs/DiscoveryAction";
import { useExplorer } from "./explorerStore";
import { ContextReadout, FACTOR_CONTEXT_LAYERS, GisFeatureRecord, GridReadout } from "./GisPoint";
import { useSiteOutcomes } from "./outcomes";
import { KmFigure, Mark, Section } from "./parts";
import { useRunSearch } from "./useRunSearch";
import { useScales } from "./useScales";
import { formatCoord, formatKm, readZone, zoneSelection } from "./zones";
import { FactorsPanel } from "../factors/FactorsPanel";

/** True when the GIS library answers for any Mars point (/api/gis/status). */
export function useGisAvailable(): boolean {
  const gis = useGisStatus();
  return gis.data?.status === "available";
}

/**
 * Body of the inspector for a point outside the research zones. There is no research record here, said once.
 * With the GIS library connected, the point is not a dead end: its GIS terrain record, the 1 km grid cell and
 * the context layers follow, all computed for this point (nothing borrowed from a zone). Without it, today's
 * honest state: nothing is measured here, and the nearest zones are the way back.
 */
export function OutsideBody({ a }: { a: MarsAnalysis | undefined }) {
  const u = a?.unavailable;
  const kept = useExplorer((s) => s.kept);
  const selection = useApp((s) => s.selection);
  const gis = useGisAvailable();
  const { zones } = useScales();
  const isKept = !!kept && !!selection && kept.lat === selection.lat && kept.lon === selection.lon;
  const lat = a?.coordinate.lat ?? selection?.lat;
  const lon = a?.coordinate.lon ?? selection?.lon;
  const zonesText = zones !== null ? <><span className="num">{zones}</span> research zones</> : "research zones";

  if (gis && lat !== undefined && lon !== undefined) {
    return (
      <div className="pt-1">
        <p className="py-2 text-body text-ink">
          Outside the {zonesText}: no research record here. The GIS record below is computed for this point from the global MOLA grid.
        </p>
        <Section n={1} title="GIS terrain record" aside="this point">
          <GisFeatureRecord lat={lat} lon={lon} />
        </Section>
        <Section n={2} title="Planetary context · not in the score">
          <FactorsPanel lat={lat} lon={lon} open />
        </Section>
        <Section n={3} title="1 km grid at this point">
          <GridReadout lat={lat} lon={lon} />
        </Section>
        <Section n={4} title="Other context layers">
          <ContextReadout lat={lat} lon={lon} exclude={FACTOR_CONTEXT_LAYERS} />
        </Section>
        <NearbyZones n={5} lat={lat} lon={lon} />
      </div>
    );
  }

  return (
    <div className="pt-1">
      <p className="py-2 text-body text-ink">
        TerraTwin measures Mars terrain only inside {zones !== null ? <>its <span className="num">{zones}</span> research zones</> : "its research zones"} for now.
      </p>
      {/* The nearby zones come first so they are visible in a half-open phone sheet. */}
      <NearbyZones n={1} lat={lat} lon={lon} />
      <Section n={2} title="Not measured here">
        <p className="text-caption text-muted">
          No terrain values are shown for this point and no Earth comparison can be run from it — nothing here is estimated or borrowed from a nearby zone.
        </p>
        {isKept && (
          <p role="status" className="mt-3 flex items-center gap-2 text-caption text-muted">
            <Mark on /> Point kept. Its marker stays on the globe; pick a research zone from search whenever you are ready.
          </p>
        )}
        <Disclosure summary="What would be needed" className="mt-2.5">
          {u?.reason && <p className="text-caption text-muted">{u.reason}</p>}
          {u?.missing_inputs.length ? (
            <ul className="mt-2 space-y-1.5">
              {u.missing_inputs.map((x) => (
                <li key={x} className="flex gap-2.5 text-caption text-ink">
                  <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 bg-faint" />
                  <span className={/[()_]/.test(x) ? "font-mono text-[11.5px]" : undefined}>{x}</span>
                </li>
              ))}
            </ul>
          ) : !u ? <p className="text-caption text-faint">Loading the list of missing datasets…</p> : null}
          {u?.owner && <p className="mt-2 text-caption text-faint">Owner: {u.owner}</p>}
          {a && a.unavailable_factors.length > 0 && (
            <p className="mt-2 text-caption text-faint">Also not connected anywhere yet: {a.unavailable_factors.map((f) => f.label.toLowerCase()).join(", ")}.</p>
          )}
        </Disclosure>
      </Section>
    </div>
  );
}

/**
 * The three nearest research zones as command rows: a guided way back to the research record. Each row says
 * its zone's own outcome in words beside the mark ("Noachis · stable leader"), so no detached legend can read
 * as this point's outcome.
 */
function NearbyZones({ n, lat, lon }: { n: number; lat?: number; lon?: number }) {
  const sites = useSites();
  const select = useApp((s) => s.select);
  const selection = useApp((s) => s.selection);
  const { bySite } = useSiteOutcomes();
  if (lat === undefined || lon === undefined || !sites.data) return null;
  const near = sites.data
    .map((s) => ({ s, km: distanceKm(lat, lon, s.lat, s.lon, R_MARS_M) }))
    .sort((x, y) => x.km - y.km)
    .slice(0, 3);
  return (
    <Section n={n} title="Nearest research zones" aside="to zone centre">
      <ul className="border-y border-line">
        {near.map(({ s, km }) => {
          const type = bySite[s.id]?.type;
          const word = type ? decisionWord(type).toLowerCase() : null;
          return (
            <li key={s.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => { if (selection) useExplorer.getState().set({ origin: selection, kept: null }); select(zoneSelection(s)); }}
                className="hit group relative -mx-2 flex w-[calc(100%+16px)] items-center gap-3 px-2 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.04] active:bg-white/[0.08] active:duration-0">
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span className="inline-grid w-4 shrink-0 place-items-center"><OutcomeMark kind={outcomeKind(type)} /></span>
                <span className="min-w-0 flex-1 truncate text-label text-ink">
                  {zoneName(s.id)}
                  <span className="text-caption text-muted"> · {word ? `research: ${word}` : "outcome not loaded"}</span>
                </span>
                <span className="shrink-0 text-caption text-muted"><KmFigure km={km} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Kept here too for views that already import it from this module (the Earth no-result view). */
export { KmFigure };

/**
 * Actions for an off-zone point. With the GIS library: run a global discovery for this point (primary), or
 * screen Earth for it (the global screen) / go to the nearest zone. Without it: go to the nearest zone
 * (keeping this point marked) or keep this point.
 */
export function OutsideActions({ selection, compact }: { selection: Selection; compact?: boolean }) {
  const sites = useSites();
  const select = useApp((s) => s.select);
  const { kept, set } = useExplorer();
  const gis = useGisAvailable();
  const search = useRunSearch();
  const near = readZone(sites.data, selection.lat, selection.lon);
  const isKept = !!kept && kept.lat === selection.lat && kept.lon === selection.lon;
  const go = () => {
    if (!near) return;
    set({ origin: selection, kept: null });
    select(zoneSelection(near.site));
    useApp.getState().announce(`Moved to the nearest research zone, ${near.name}${typeof near.km === "number" ? `, ${formatKm(near.km)} away` : ""}. Your point ${formatCoord(selection.lat, selection.lon)} stays marked.`);
  };
  if (gis) {
    return (
      <div className="space-y-2">
        <DiscoveryAction selection={selection} caption={!compact} />
        {search.error && <p className="text-caption text-bad">Search failed: {search.error.message}</p>}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button variant="outline" className="h-10 min-w-0 py-0" onClick={() => search.run(selection)} disabled={search.pending}>
            <span className="truncate">{search.pending ? "Searching Earth…" : "Find Earth analogs"}</span>
          </Button>
          <Button variant="ghost" className="h-10 py-0" onClick={go} disabled={!near} title={near ? `${near.name}${typeof near.km === "number" ? `, ${formatKm(near.km)}` : ""}` : undefined}>
            Nearest zone
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Button variant="primary-mars" className="w-full justify-start! py-2.5 text-left" onClick={go} disabled={!near}>
        {near ? (
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span>Go to nearest zone</span>
            <span className="truncate text-[13px] font-medium normal-case tracking-normal text-space/70">
              {near.name}
              {typeof near.km === "number" && <> · <KmFigure km={near.km} /><span className="sr-only"> to its centre</span></>}
            </span>
          </span>
        ) : <span className="flex-1">Loading research zones…</span>}
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
      </Button>
      {!isKept && (
        <Button variant="ghost" className="w-full" onClick={() => { set({ kept: selection }); useApp.getState().announce("Point kept. Measurements are not available here."); }}>
          Keep this point
        </Button>
      )}
    </div>
  );
}
