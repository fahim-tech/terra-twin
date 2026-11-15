import { ArrowRight } from "lucide-react";
import { Disclosure, Kicker } from "../../components/primitives";
import { Button } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { nearestSite } from "../../lib/instruments";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { KmFigure } from "../explorer/OutsideZone";
import type { SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";

/** "USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)" → plain name + env name in mono. */
function MissingInput({ text }: { text: string }) {
  // Env names and function names are technical details: set them in mono after the plain name.
  const m = /^(.*?)\s*\(([A-Z0-9_]+)\)\s*$/.exec(text) ?? /^(.*?)\s*([a-z_]+\(\))\s*$/.exec(text);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-caption text-ink">
      <span aria-hidden className="text-faint">○</span>
      <span>{m ? m[1] : text}</span>
      {m && <code className="font-mono text-num-sm text-muted">{m[2]}</code>}
    </li>
  );
}

/** Missing inputs, de-duplicated across the Mars record and the research operator (same items, different wording). */
export function missingInputs(search: AnalogSearch): string[] {
  const all = [
    ...(search.tier2.operator as { missing_inputs?: string[] }).missing_inputs ?? [],
    ...search.tier2.live_refinement.missing_inputs,
    ...search.mars.unavailable?.missing_inputs ?? [],
  ];
  const seen = new Set<string>();
  const key = (s: string) => s.replace(/\(.*\)/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return all.filter((s) => { const k = key(s); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** No Earth comparison is possible for this target: say so plainly and offer the next step. */
export function NoResult({ search, target }: { search: AnalogSearch; target: SearchTarget }) {
  const sites = useSites();
  const near = nearestSite(sites.data, target.lat, target.lon);
  const reason = (search.tier2.operator as { reason?: string }).reason ?? search.mars.unavailable?.reason ?? search.tier2.decision.label;
  const missing = missingInputs(search);
  const owner = search.mars.unavailable?.owner ?? (search.tier2.live_refinement as { owner?: string }).owner;
  const offZone = !search.mars.site;

  const goNearest = () => {
    if (!near) return;
    const app = useApp.getState();
    app.select({ lat: near.site.lat, lon: near.site.lon, siteId: near.site.id, label: zoneName(near.site.id) });
    app.go("mars");
    app.announce(`Moved to ${zoneName(near.site.id)}, the nearest research zone.`);
  };

  return (
    <section aria-labelledby="no-result-title" className="pb-2 pt-2">
      <Kicker>Not enough evidence</Kicker>
      <h3 id="no-result-title" className="mt-2 text-title text-ink">No Earth comparison for this point</h3>
      <p className="mt-2 text-body text-muted">
        {offZone
          ? "TerraTwin measures Mars terrain only inside 39 research zones for now, so there is nothing here to compare Earth against. Your point is kept."
          : "The research data for this target cannot support a comparison, so no similarity score is shown."}
      </p>
      <div className="mt-4">
        {near ? (
          <Button variant="primary-mars" className="w-full justify-between" onClick={goNearest}>
            <span>Go to nearest research zone</span>
            <span className="flex items-center gap-2 font-normal">
              {zoneName(near.site.id)} · <KmFigure km={near.km} /><ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </Button>
        ) : (
          <Button variant="primary-mars" className="w-full" onClick={() => useApp.getState().go("mars")} disabled={sites.isLoading}>
            {sites.isLoading ? "Finding the nearest research zone…" : "Back to Mars"}
          </Button>
        )}
      </div>
      <Disclosure className="mt-4" summary="What's missing">
        {reason && <p className="mb-2 text-caption text-muted">{reason}</p>}
        {missing.length > 0 && <ul aria-label="Missing inputs">{missing.map((x) => <MissingInput key={x} text={x} />)}</ul>}
        {owner && <p className="mt-2 text-caption text-faint">Owner: {owner}. No comparison is substituted in the meantime.</p>}
      </Disclosure>
    </section>
  );
}
