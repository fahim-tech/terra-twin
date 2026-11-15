import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Disclosure, Measure, Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Tier1Candidate } from "../../types/contracts";
import { coord, T1_MEASURES } from "./candidates";
import { EarthRegion, getJson, innerBox, parseLatLon, regionPath } from "./earthApi";
import { useEarthLocal } from "./earthLocal";
import { CAPS, Readout, Readouts, StatusMark } from "./instruments";
import { measuresText, sText } from "./readout";
import { chooseCandidate } from "./tierMemory";
import { mergeByRank, tier1InView } from "./viewQuery";

const inputCls = "num h-9 w-full min-w-0 bg-space/70 px-2.5 text-num text-ink ring-1 ring-inset ring-line-strong outline-none transition-shadow placeholder:text-faint hover:ring-ink/40 focus-visible:outline-none focus-visible:ring-earth/80";

const DESCRIPTORS: { key: string; label: string; unit: string; digits: number }[] = [
  { key: "mean_slope_deg", label: "Mean slope", unit: "deg", digits: 1 },
  { key: "slope_p90_deg", label: "90th-pct slope", unit: "deg", digits: 1 },
  { key: "relative_relief_m", label: "Relief", unit: "m", digits: 0 },
  { key: "elev_std_m", label: "RMS height", unit: "m", digits: 0 },
];

/**
 * "Inspect an Earth point": the nearest global-screen cell to any typed coordinate (/api/earth/region),
 * with its rank and similarity for this search's Mars target when the screen ranked it. Selecting it makes
 * it the active cell, so it can be compared like any listed cell.
 */
export function EarthLookup({ search }: { search: AnalogSearch }) {
  const target = searchTarget(search)!;
  const site = search.mars.site;
  const t1 = search.tier1;
  const ids = { lat: useId(), lon: useId(), err: useId() };
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState<{ lat: number; lon: number } | null>(null);
  const candidateId = useApp((s) => s.candidateId);

  const r = useQuery({
    queryKey: ["earthLookup", q, site, target.mission, !!t1],
    enabled: !!q,
    staleTime: Infinity,
    queryFn: async () => {
      const region = await getJson(regionPath(q!), EarthRegion);
      let ranked: Tier1Candidate | null = null;
      if (site && t1) {
        const res = await tier1InView(site, target.mission, innerBox(region.footprint.bbox), 5);
        ranked = res.candidates.find((c) => c.region_id === region.region_id) ?? null;
      }
      return { region, ranked };
    },
  });

  useEffect(() => {
    if (r.data) {
      const { region, ranked } = r.data;
      useApp.getState().announce(`Nearest cell ${coord(region.lat, region.lon)}, ${region.distance_km.toFixed(0)} km from the point.` +
        (ranked ? ` Rank ${ranked.rank.toLocaleString()}, similarity ${ranked.similarity === null ? "not available" : ranked.similarity.toFixed(3)}.` : " Not ranked for this target."));
    }
    if (r.isError) useApp.getState().announce(`Lookup failed: ${(r.error as Error).message}`, true);
  }, [r.data, r.isError, r.error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseLatLon(lat, lon);
    if (!p) { setError("Enter a latitude between −90 and 90 and a longitude, e.g. −24.1 and −70.0 (or 24.1 S, 70.0 W)."); return; }
    setError(null);
    setQ(p);
  };

  const select = (cell: Tier1Candidate) => {
    const cur = useApp.getState().search;
    if (cur?.id !== search.id || !cur.tier1) return;
    useApp.getState().set({ search: { ...cur, tier1: { ...cur.tier1, candidates: mergeByRank(cur.tier1.candidates, [cell]) } } });
    useEarthLocal.setState({ intent: "select" });
    chooseCandidate(`t1:${cell.region_id}`);
  };

  const data = r.data;
  const cell = data?.ranked ?? null;
  const on = cell ? candidateId === `t1:${cell.region_id}` : false;
  const km = t1?.candidate_pool.cell_size_km ?? null;

  return (
    <Disclosure summary="Inspect an Earth point">
      <p className="text-caption text-muted">Any coordinate → the nearest {km !== null ? `${km} km ` : ""}cell of the <Term k="globalScreen">global screen</Term>, Earth as measured.</p>
      <form onSubmit={submit} noValidate className="mt-2.5 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label htmlFor={ids.lat} className="kicker">Latitude
          <input id={ids.lat} inputMode="decimal" autoComplete="off" placeholder="−24.10" value={lat} onChange={(e) => setLat(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? ids.err : undefined} className={cx(inputCls, "mt-1.5 normal-case tracking-normal")} />
        </label>
        <label htmlFor={ids.lon} className="kicker">Longitude
          <input id={ids.lon} inputMode="decimal" autoComplete="off" placeholder="−70.00" value={lon} onChange={(e) => setLon(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? ids.err : undefined} className={cx(inputCls, "mt-1.5 normal-case tracking-normal")} />
        </label>
        <Button type="submit" variant="outline" className="h-9" disabled={r.isFetching}>{r.isFetching ? "Looking…" : "Look up"}</Button>
      </form>
      {error && <p id={ids.err} className="mt-2 flex items-baseline gap-2 text-caption text-ink"><StatusMark state="caution" className="translate-y-[-1px]" />{error}</p>}
      {r.isError && <p className="mt-2 flex items-baseline gap-2 text-caption text-ink"><StatusMark state="fault" className="translate-y-[-1px]" />Lookup failed: {(r.error as Error).message}</p>}

      {data && (
        <div className="mt-3 border border-line-strong">
          <div className="flex items-baseline justify-between gap-3 bg-white/[0.035] px-3 py-2">
            <span className="kicker !text-ink/85">Nearest cell</span>
            <span className={cx("num text-num-sm", on ? "text-earth" : "text-ink")}>{coord(data.region.lat, data.region.lon)}</span>
          </div>
          <Readouts className="border-b-0" label="Nearest screened cell">
            <Readout className="px-3" label="Distance">
              {data.region.describes_requested_point
                ? <><span className="num">{data.region.distance_km.toFixed(1)}</span> km from <span className="num">{coord(data.region.requested.lat, data.region.requested.lon)}</span></>
                : <span className="flex items-baseline gap-2"><StatusMark state="caution" className="translate-y-[-1px]" />
                    <span>{coord(data.region.requested.lat, data.region.requested.lon)} is not covered by a screened land cell. The nearest one is <span className="num">{data.region.distance_km.toFixed(0)}</span> km away.</span></span>}
            </Readout>
            {cell ? (
              <>
                <Readout className="px-3" label="Rank">
                  <span className="num text-ink">{cell.rank.toLocaleString("en-US")}</span> of <span className="num">{t1!.candidate_pool.n_cells_searched.toLocaleString("en-US")}</span> for {target.label}
                </Readout>
                <Readout className="px-3" label={<Term k="similarity">S</Term>}>
                  <span className="num text-num text-ink">{sText(cell.similarity)}</span>
                  <span className="num text-num-sm text-faint"> · {measuresText(cell.coverage, T1_MEASURES)}</span>
                  <span className="text-muted"> · {km !== null ? `${km} km ` : ""}cell, as measured</span>
                </Readout>
              </>
            ) : (
              <Readout className="px-3" label="Rank"><span className="text-muted">{t1 ? `Not ranked for ${target.label}: the global screen leaves out cells with too few valid measures.` : "The global screen did not run for this target, so the cell has no rank or similarity."}</span></Readout>
            )}
          </Readouts>

          <dl aria-label="Terrain descriptors" className="grid grid-cols-2 border-t border-line">
            {DESCRIPTORS.map((d, i) => (
              <div key={d.key} className={cx("px-3 py-2", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line")}>
                <dt className={CAPS}>{d.label}</dt>
                <dd className="mt-1"><Measure value={data.region.features[d.key] ?? null} unit={d.unit} digits={d.digits} className="text-num text-ink" /></dd>
              </div>
            ))}
          </dl>
          <div className="space-y-1.5 border-t border-line px-3 py-2.5">
            <p className="text-caption text-muted">
              {data.region.known_analog.status === "near_documented_analog" ? <><span aria-hidden className="mr-1.5 text-muted">◆</span>Near documented analog {data.region.known_analog.name}</> : "Not in the reference set — not a claim of novelty."}
            </p>
            {data.region.quality_flags.filter((f) => f.severity !== "info").map((f) => (
              <p key={f.code} className="flex items-baseline gap-2 text-caption text-ink"><StatusMark state="caution" className="translate-y-[-1px]" />{f.message}</p>
            ))}
          </div>
          {cell && (
            <div className="border-t border-line p-2">
              <Button variant="outline" className="w-full" disabled={on} onClick={() => select(cell)}>{on ? "Selected — compare from the footer" : "Select this cell"}</Button>
            </div>
          )}
        </div>
      )}
    </Disclosure>
  );
}
