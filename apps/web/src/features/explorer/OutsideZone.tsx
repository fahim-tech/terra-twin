import { ArrowRight } from "lucide-react";
import { Disclosure } from "../../components/primitives";
import { Button } from "../../components/ui";
import { useSites } from "../../services/api";
import { useApp, type Selection } from "../../store/app";
import type { MarsAnalysis } from "../../types/contracts";
import { distanceKm, R_MARS_M } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useExplorer } from "./explorerStore";
import { OutcomeGlyph } from "./MarsSearch";
import { useSiteOutcomes } from "./outcomes";
import { formatCoord, formatKm, readZone, zoneSelection } from "./zones";

/** Body of the inspector for a point outside the 39 research zones: one sentence, then the gaps on demand. */
export function OutsideBody({ a }: { a: MarsAnalysis | undefined }) {
  const u = a?.unavailable;
  const kept = useExplorer((s) => s.kept);
  const selection = useApp((s) => s.selection);
  const isKept = !!kept && !!selection && kept.lat === selection.lat && kept.lon === selection.lon;
  return (
    <div className="py-3">
      <p className="text-body text-ink">TerraTwin measures Mars terrain only inside 39 research zones for now.</p>
      <p className="mt-1.5 text-caption text-muted">
        No terrain values are shown for this point and no Earth comparison can be run from it — nothing here is estimated or borrowed from a nearby zone.
      </p>
      <NearbyZones lat={a?.coordinate.lat ?? selection?.lat} lon={a?.coordinate.lon ?? selection?.lon} />
      {isKept && (
        <p role="status" className="mt-3 text-caption text-muted">
          ✓ Point kept. Its marker stays on the globe; pick a research zone from search whenever you are ready.
        </p>
      )}
      <Disclosure summary="What would be needed" className="mt-3">
        {u?.reason && <p className="text-caption text-muted">{u.reason}</p>}
        {u?.missing_inputs.length ? (
          <ul className="mt-2 space-y-1">
            {u.missing_inputs.map((x) => (
              <li key={x} className="flex gap-2 text-caption text-ink"><span aria-hidden className="text-faint">—</span><span className={/[()_]/.test(x) ? "font-mono text-[11.5px]" : undefined}>{x}</span></li>
            ))}
          </ul>
        ) : !u ? <p className="text-caption text-faint">Loading the list of missing datasets…</p> : null}
        {u?.owner && <p className="mt-2 text-caption text-faint">Owner: {u.owner}</p>}
        {a && a.unavailable_factors.length > 0 && (
          <p className="mt-2 text-caption text-faint">Also not connected anywhere yet: {a.unavailable_factors.map((f) => f.label.toLowerCase()).join(", ")}.</p>
        )}
      </Disclosure>
    </div>
  );
}

/** The three nearest research zones, as quiet rows: a guided way back to measured ground. */
function NearbyZones({ lat, lon }: { lat?: number; lon?: number }) {
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
    <div className="mt-5">
      <h3 className="text-label text-ink">Nearest research zones</h3>
      <ul className="mt-1.5">
        {near.map(({ s, km }) => (
          <li key={s.id} className="border-b border-line last:border-b-0">
            <button type="button" onClick={() => { if (selection) useExplorer.getState().set({ origin: selection, kept: null }); select(zoneSelection(s)); }}
              className="hit flex w-full items-center justify-between gap-3 rounded-control py-2 text-left hover:bg-elevated/60">
              <span className="flex min-w-0 items-center gap-2.5">
                <OutcomeGlyph type={bySite[s.id]?.type} />
                <span className="truncate text-label text-ink">{zoneName(s.id)}</span>
              </span>
              <span className="shrink-0 text-caption text-muted"><KmFigure km={km} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Distance with a mono figure and a text-face unit; the number is the great-circle distance to the zone centre. */
export function KmFigure({ km }: { km: number }) {
  const [v, u] = formatKm(km).split(" ");
  return <span title="Great-circle distance to the zone centre"><span className="num">{v}</span> {u}</span>;
}

/** Actions for an off-zone point: go to the nearest zone (keeping this point marked) or keep this point. */
export function OutsideActions({ selection }: { selection: Selection }) {
  const sites = useSites();
  const select = useApp((s) => s.select);
  const { kept, set } = useExplorer();
  const near = readZone(sites.data, selection.lat, selection.lon);
  const isKept = !!kept && kept.lat === selection.lat && kept.lon === selection.lon;
  const go = () => {
    if (!near) return;
    set({ origin: selection, kept: null });
    select(zoneSelection(near.site));
    useApp.getState().announce(`Moved to the nearest research zone, ${near.name}, ${formatKm(near.km ?? 0)} away. Your point ${formatCoord(selection.lat, selection.lon)} stays marked.`);
  };
  return (
    <div className="space-y-1.5">
      <Button variant="primary-mars" className="w-full py-2.5" onClick={go} disabled={!near}>
        {near ? <>Go to nearest zone · {near.name} · <KmFigure km={near.km ?? 0} /></> : "Loading research zones…"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      {!isKept && (
        <Button variant="ghost" className="w-full" onClick={() => { set({ kept: selection }); useApp.getState().announce("Point kept. Measurements are not available here."); }}>
          Keep this point
        </Button>
      )}
    </div>
  );
}
