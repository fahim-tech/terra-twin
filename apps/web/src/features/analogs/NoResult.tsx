import { ArrowRight } from "lucide-react";
import { Disclosure, PanelFooter } from "../../components/primitives";
import { Button } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { nearestSite } from "../../lib/instruments";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { KmFigure } from "../explorer/OutsideZone";
import type { SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { Readout, Readouts, SectionHead, StatusMark } from "./instruments";
import { DecisionHead } from "./Verdict";

/** "USGS MOLA 463 m mosaic (TERRATWIN_MOLA_MOSAIC)" → plain name + env name in mono, marked not connected. */
function MissingInput({ text }: { text: string }) {
  // Env names and function names are technical details: set them in mono after the plain name.
  const m = /^(.*?)\s*\(([A-Z0-9_]+)\)\s*$/.exec(text) ?? /^(.*?)\s*([a-z_]+\(\))\s*$/.exec(text);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 py-2">
      <StatusMark state="off" className="translate-y-[-1px]" />
      <span className="min-w-0">
        <span className="block text-caption text-ink">{m ? m[1] : text}<span className="sr-only"> — not connected</span></span>
        {m && <code className="mt-0.5 block break-all font-mono text-num-sm text-muted">{m[2]}</code>}
      </span>
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

/**
 * The research zone nearest to an off-zone target. A target inside a zone has no "nearest zone" to go to
 * (it would be itself), so only off-zone targets get one.
 */
function useNearestZone(search: AnalogSearch, target: SearchTarget) {
  const sites = useSites();
  const offZone = !search.mars.site;
  return { sites, offZone, near: offZone ? nearestSite(sites.data, target.lat, target.lon) : null };
}

/** No Earth comparison is possible for this target: say so plainly; the next step is the footer action. */
export function NoResult({ search, target }: { search: AnalogSearch; target: SearchTarget }) {
  const { sites, offZone, near } = useNearestZone(search, target);
  const reason = (search.tier2.operator as { reason?: string }).reason ?? search.mars.unavailable?.reason ?? search.tier2.decision.label;
  const missing = missingInputs(search);
  const owner = search.mars.unavailable?.owner ?? (search.tier2.live_refinement as { owner?: string }).owner;
  // The zone count comes from the zone list itself; until it loads the sentence names no number.
  const nZones = sites.data?.length;

  return (
    <section aria-labelledby="no-result-title" className="pb-2">
      {/* Phones hide the section rules (kept for screen readers) so the status and the nearest zone fit at half height. */}
      <SectionHead index="01" className="max-md:sr-only">Status</SectionHead>
      {/* The annunciator names the decision the record actually made (glossary term on demand), never a fixed label. */}
      <div className="mt-2.5 border border-line-strong max-md:mt-0">
        <DecisionHead t2={search.tier2} as="div" />
        <div className="border-t border-line px-3 py-3">
          <h4 id="no-result-title" className="text-title text-ink">No Earth comparison for this point</h4>
          <p className="mt-1.5 text-caption text-muted">
            {offZone
              ? `TerraTwin measures Mars terrain only inside ${nZones ? `the ${nZones}` : "its"} research zones for now, so there is nothing here to compare Earth against. Your point is kept.`
              : "The research data for this target cannot support a comparison, so no similarity score is shown."}
          </p>
        </div>
      </div>

      {near && (
        <>
          <SectionHead index="02" className="mt-6 max-md:sr-only">Next step</SectionHead>
          <Readouts className="mt-2.5 max-md:mt-3" label="Nearest research zone">
            <Readout label="Nearest zone">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="toponym text-[15px] tracking-[0.04em] text-ink">{zoneName(near.site.id)}</span>
                <span className="text-caption text-muted"><KmFigure km={near.km} /> to its centre</span>
              </span>
            </Readout>
          </Readouts>
        </>
      )}

      <Disclosure className="mt-5" summary="What's missing">
        {reason && <p className="text-caption text-muted">{reason}</p>}
        {missing.length > 0 && (
          <ul aria-label="Missing inputs, not connected" className="mt-2 divide-y divide-line border-y border-line">
            {missing.map((x) => <MissingInput key={x} text={x} />)}
          </ul>
        )}
        {owner && <p className="mt-2 text-caption text-faint">Owner: {owner}. No comparison is substituted in the meantime.</p>}
      </Disclosure>
    </section>
  );
}

/** The sticky footer action of the no-result state: go to the nearest research zone, else back to Mars. */
export function NoResultFooter({ search, target }: { search: AnalogSearch; target: SearchTarget }) {
  const { sites, offZone, near } = useNearestZone(search, target);

  const goNearest = () => {
    if (!near) return;
    const app = useApp.getState();
    app.select({ lat: near.site.lat, lon: near.site.lon, siteId: near.site.id, label: zoneName(near.site.id) });
    app.go("mars");
    app.announce(`Moved to ${zoneName(near.site.id)}, the nearest research zone.`);
  };

  return (
    <PanelFooter className="border-t border-line">
      {near ? (
        <Button variant="primary-mars" className="w-full" onClick={goNearest}>
          Go to nearest research zone <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : (
        <Button variant="primary-mars" className="w-full" onClick={() => useApp.getState().go("mars")} disabled={offZone && sites.isLoading}>
          {offZone && sites.isLoading ? "Finding the nearest research zone…" : "Back to Mars"}
        </Button>
      )}
    </PanelFooter>
  );
}
