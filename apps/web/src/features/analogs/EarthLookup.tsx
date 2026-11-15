import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Disclosure, Measure, Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Tier1Candidate } from "../../types/contracts";
import { coord, measuresOf, T1_MEASURES } from "./candidates";
import { EarthRegion, getJson, innerBox, parseLatLon, regionPath } from "./earthApi";
import { useEarthLocal } from "./earthLocal";
import { chooseCandidate } from "./tierMemory";
import { mergeByRank, tier1InView } from "./viewQuery";

const inputCls = "num h-9 w-full min-w-0 rounded-control bg-elevated px-2.5 text-num text-ink ring-1 ring-inset ring-line-strong outline-none placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-earth/70";

const DESCRIPTORS: { key: string; label: string; unit: string; digits: number }[] = [
  { key: "mean_slope_deg", label: "Mean slope", unit: "deg", digits: 1 },
  { key: "slope_p90_deg", label: "90th-pct slope", unit: "deg", digits: 1 },
  { key: "relative_relief_m", label: "Relief", unit: "m", digits: 0 },
  { key: "elev_std_m", label: "RMS height", unit: "m", digits: 0 },
];

/**
 * "Inspect an Earth point": the nearest 25 km global-screen cell to any typed coordinate (/api/earth/region),
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
  const km = t1?.candidate_pool.cell_size_km ?? 25;

  return (
    <Disclosure summary="Inspect an Earth point">
      <p className="text-caption text-muted">Any coordinate → the nearest {km} km cell of the <Term k="globalScreen">global screen</Term>, Earth as measured.</p>
      <form onSubmit={submit} noValidate className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label htmlFor={ids.lat} className="text-caption text-muted">Latitude
          <input id={ids.lat} inputMode="decimal" autoComplete="off" placeholder="−24.10" value={lat} onChange={(e) => setLat(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? ids.err : undefined} className={cx(inputCls, "mt-1")} />
        </label>
        <label htmlFor={ids.lon} className="text-caption text-muted">Longitude
          <input id={ids.lon} inputMode="decimal" autoComplete="off" placeholder="−70.00" value={lon} onChange={(e) => setLon(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? ids.err : undefined} className={cx(inputCls, "mt-1")} />
        </label>
        <Button type="submit" variant="outline" className="h-9" disabled={r.isFetching}>{r.isFetching ? "Looking…" : "Look up"}</Button>
      </form>
      {error && <p id={ids.err} className="mt-1.5 text-caption text-ink"><span aria-hidden className="mr-1 text-warn">⚠</span>{error}</p>}
      {r.isError && <p className="mt-2 text-caption text-ink"><span aria-hidden className="mr-1 text-bad">⊘</span>Lookup failed: {(r.error as Error).message}</p>}

      {data && (
        <div className="mt-3 rounded-control bg-elevated px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-muted">Nearest cell</span>
            <span className="num text-num-sm text-ink">{coord(data.region.lat, data.region.lon)}</span>
          </div>
          {data.region.describes_requested_point
            ? <p className="mt-0.5 text-caption text-faint"><span className="num text-num-sm">{data.region.distance_km.toFixed(1)}</span> km from <span className="num text-num-sm">{coord(data.region.requested.lat, data.region.requested.lon)}</span></p>
            : <p className="mt-1 text-caption text-ink"><span aria-hidden className="mr-1 text-warn">⚠</span>
                {coord(data.region.requested.lat, data.region.requested.lon)} is not covered by a screened land cell. The nearest one is <span className="num text-num-sm">{data.region.distance_km.toFixed(0)}</span> km away.</p>}

          {cell ? (
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-caption text-muted">Rank <span className="num text-num-sm text-ink">{cell.rank.toLocaleString()}</span> of <span className="num text-num-sm">{t1!.candidate_pool.n_cells_searched.toLocaleString()}</span> for {target.label}</div>
                <div className="text-caption text-faint">{km} km cell · as measured</div>
              </div>
              <span className="num shrink-0 text-num text-ink">S {cell.similarity === null ? "—" : cell.similarity.toFixed(3)} <span className="text-faint">· {measuresOf(cell.coverage, T1_MEASURES) ?? "—"}/{T1_MEASURES}</span></span>
            </div>
          ) : (
            <p className="mt-2 text-caption text-muted">{t1 ? `Not ranked for ${target.label}: the global screen leaves out cells with too few valid measures.` : "The global screen did not run for this target, so the cell has no rank or similarity."}</p>
          )}

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {DESCRIPTORS.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-2">
                <dt className="text-caption text-muted">{d.label}</dt>
                <dd><Measure value={data.region.features[d.key] ?? null} unit={d.unit} digits={d.digits} className="text-num-sm text-ink" /></dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-caption text-muted">
            {data.region.known_analog.status === "near_documented_analog" ? <>◆ Near documented analog {data.region.known_analog.name}</> : "Not in the reference set — not a claim of novelty."}
          </p>
          {data.region.quality_flags.filter((f) => f.severity !== "info").map((f) => (
            <p key={f.code} className="mt-1 text-caption text-ink"><span aria-hidden className="mr-1 text-warn">⚠</span>{f.message}</p>
          ))}
          {cell && (
            <Button variant="outline" className="mt-2.5 w-full" disabled={on} onClick={() => select(cell)}>{on ? "Selected — compare from the footer" : "Select this cell"}</Button>
          )}
        </div>
      )}
    </Disclosure>
  );
}
