import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Disclosure, Measure, Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { figureDigits, legendNumber, pointSurface, pointTerrain, unitSuffix } from "../../components/datalayers/model";
import { type ContextPoint, type GridInfo, type GridPoint, useContextPoint, useGridInfo, useGridPoint } from "../../services/gis";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Tier1Candidate } from "../../types/contracts";
import { coord, T1_MEASURES } from "./candidates";
import { EarthRegion, getJson, innerBox, parseLatLon, regionPath } from "./earthApi";
import { useEarthLocal } from "./earthLocal";
import { AnalogMark, CAPS, NEAR_ANALOG, Readout, Readouts, StatusMark } from "./instruments";
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

  const grid = useGridPoint("earth", q);
  const context = useContextPoint("earth", q);
  const gridInfo = useGridInfo("earth", !!q);
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

  useEffect(() => {
    if (!grid.data) return;
    const s = pointSurface(grid.data.values, grid.data.surface_class_label, gridInfo.data);
    useApp.getState().announce(`1 km grid at the point: ${s.label ?? "surface class not stated"}.`);
  }, [grid.data, gridInfo.data]);

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
              {data.region.known_analog.status === "near_documented_analog"
                ? <span className="inline-flex flex-wrap items-center gap-x-1.5"><AnalogMark />{NEAR_ANALOG}{data.region.known_analog.name && <> · <span className="text-ink">{data.region.known_analog.name}</span></>}</span>
                : "Not in the reference set — not a claim of novelty."}
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
      {q && <GridAtPoint q={grid} info={gridInfo.data} />}
      {q && <ContextAtPoint q={context} />}
    </Disclosure>
  );
}

const fig = (v: number, unit: string) => legendNumber(v, figureDigits(unit, v));

/** Status line for a GIS query: loading, or why it failed (a 503 says the grid is not connected on this server). */
function QueryState({ q, what }: { q: { isPending: boolean; isError: boolean; error: unknown }; what: string }) {
  if (q.isError) {
    return <p className="flex items-baseline gap-2 px-3 py-2.5 text-caption text-ink"><StatusMark state="struck" className="translate-y-[-1px]" />{what} not available: {(q.error as Error).message}</p>;
  }
  return q.isPending ? <p className="px-3 py-2.5 text-caption text-muted">Reading the {what.toLowerCase()}…</p> : null;
}

/**
 * The ~1 km grid cell under the typed point (/api/gis/grid/earth/point): its surface class, then (land only)
 * the terrain descriptors with their units, the land shares and the flags the grid set. An ocean cell shows its
 * class, never the elevation of 0 the grid stores for it.
 */
function GridAtPoint({ q, info }: { q: ReturnType<typeof useGridPoint>; info: GridInfo | undefined }) {
  const d: GridPoint | undefined = q.data;
  const surface = d ? pointSurface(d.values, d.surface_class_label, info) : null;
  const terrain = d && surface?.land ? pointTerrain(d.values, d.units, info) : [];
  const share = (k: string) => (d && typeof d.values[k] === "number" ? (d.values[k] as number) : null);
  const flagText = (f: string) => {
    const bit = Number(f);
    return Number.isFinite(bit) && info?.flags?.[String(bit)] ? info.flags[String(bit)] : f;
  };
  const footprints = (d as { footprints?: { local?: string; window?: string } } | undefined)?.footprints;
  return (
    <section aria-label="1 km grid at this point" className="mt-3 border border-line-strong">
      <div className="flex items-baseline justify-between gap-3 bg-white/[0.035] px-3 py-2">
        <span className="kicker !text-ink/85">1 km grid at this point</span>
        {d && <span className="num text-num-sm text-ink">{coord(d.cell.lat, d.cell.lon, 3)}</span>}
      </div>
      <QueryState q={q} what="1 km grid" />
      {d && surface && (
        <>
          <Readouts className="border-b-0" label="Grid cell">
            <Readout className="px-3" label="Surface">
              <span className="text-ink">{surface.label ?? "—"}</span>
              {!surface.land && surface.label && <span className="text-muted"> · no land terrain value at this cell</span>}
            </Readout>
            <Readout className="px-3" label="Land share">
              <Measure value={share("land_frac_pct")} unit="%" digits={0} className="text-ink" /> <span className="text-muted">of the cell</span>
              {share("window_valid_pct") !== null && <span className="text-muted"> · <Measure value={share("window_valid_pct")} unit="%" digits={0} className="text-ink" /> valid land in the 25 km window</span>}
            </Readout>
          </Readouts>
          {terrain.length > 0 && (
            <dl aria-label="Grid terrain descriptors" className="grid grid-cols-2 border-t border-line">
              {terrain.map((t, i) => (
                <div key={t.key} className={cx("min-w-0 px-3 py-2", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line")}>
                  <dt className={cx(CAPS, "truncate")} title={t.units ? `${t.label} · ${t.units}` : t.label}>{t.label}</dt>
                  <dd className="num mt-1 text-num text-ink">{t.value === null ? "—" : <>{fig(t.value, t.unit)}{t.unit && <span className="text-num-sm text-muted"> {t.unit}</span>}</>}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="space-y-1.5 border-t border-line px-3 py-2.5">
            {d.flags_set.length > 0
              ? d.flags_set.map((f) => <p key={f} className="flex items-baseline gap-2 text-caption text-ink"><StatusMark state="caution" className="translate-y-[-1px]" />{flagText(f)}</p>)
              : <p className="text-caption text-faint">No cell flags set.</p>}
            {footprints?.local && <p className="text-caption text-faint">Cell: {footprints.local}{footprints.window && <> · window descriptors: {footprints.window}</>}.</p>}
          </div>
        </>
      )}
    </section>
  );
}

const CONTEXT_LABEL: Record<string, string> = {
  aridity_index: "Aridity index",
  koppen_geiger_1991_2020: "Köppen–Geiger class, 1991–2020",
  permafrost_probability: "Permafrost probability",
};
const contextLabel = (k: string) => CONTEXT_LABEL[k] ?? k.replace(/_/g, " ");

/**
 * Climate context at the typed point (/api/gis/context/earth/point). Context only: never a similarity feature,
 * weight or confidence. Each value with its units, or the payload's reason it is missing; native resolution and
 * comparability on demand.
 */
function ContextAtPoint({ q }: { q: ReturnType<typeof useContextPoint> }) {
  const d: ContextPoint | undefined = q.data;
  return (
    <section aria-label="Context, not used in similarity" className="mt-3 border border-line-strong">
      <div className="flex items-baseline justify-between gap-3 bg-white/[0.035] px-3 py-2">
        <span className="kicker !text-ink/85">Context · not used in similarity</span>
      </div>
      <QueryState q={q} what="Context" />
      {d && (
        <>
          <Readouts className="border-b-0" label="Context layers">
            {Object.entries(d.layers).map(([k, l]) => {
              const desc = (l as { class_description?: string | null }).class_description;
              const unit = unitSuffix(l.units);
              return (
                <Readout key={k} className="px-3" label={contextLabel(k)}>
                  {l.value === null || l.value === undefined
                    ? <span className="text-muted">— · {l.missing_reason ?? "no value"}</span>
                    : typeof l.value === "number"
                      ? <><span className="num text-ink">{fig(l.value, unit)}</span><span className="text-muted"> {l.units}</span></>
                      : <><span className="num text-ink">{l.value}</span>{desc && <span className="text-muted"> · {desc}</span>}</>}
                  <span className="text-faint"> · {l.feature_state}</span>
                </Readout>
              );
            })}
          </Readouts>
          <div className="border-t border-line px-3 py-2.5">
            {(d.rules ?? []).map((r) => <p key={r} className="text-caption text-faint">{r.charAt(0).toUpperCase() + r.slice(1)}.</p>)}
            <Disclosure summary="Resolution and comparability" className="mt-1.5">
              <dl className="space-y-2 text-caption">
                {Object.entries(d.layers).map(([k, l]) => (
                  <div key={k}>
                    <dt className="text-ink/85">{contextLabel(k)}</dt>
                    <dd className="text-muted">Native resolution: <span className="text-ink/85">{l.native_resolution ?? "not stated"}</span></dd>
                    {l.comparability && <dd className="text-muted">{l.comparability}</dd>}
                  </div>
                ))}
              </dl>
            </Disclosure>
          </div>
        </>
      )}
    </section>
  );
}
