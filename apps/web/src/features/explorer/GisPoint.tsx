import { useState, type ReactNode } from "react";
import { StatusMark } from "../../components/marks";
import { Disclosure } from "../../components/primitives";
import { cx } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { type MarsFeatureRecord, useContextPoint, useGridPoint, useMarsFeatures } from "../../services/gis";
import { descriptorLabel, descriptorUnit, formatValue, pctText } from "../analogs/discoveryModel";
import { baselineText, CONTEXT_LABELS, flagText, GRID_SUPPORT_KEYS, GRID_TERRAIN_KEYS } from "./gisRecord";

/**
 * GIS readouts for any Mars point (services/gis.ts, gis-contract-1.0): the feature record of the 50 km window
 * and its 200 km tier-1 record, the 1 km grid cell under the point and the context layers. Every figure comes
 * from the payload with its units; a missing one prints "—" or the payload's reason, never 0. Observation
 * support is metadata (never a weight or confidence) and context layers are context only (never a similarity
 * feature): both are said where they are shown.
 */

/** Hairline key/value rows: caps label, mono value with unit, an optional third column. */
function Rows({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return <dl aria-label={label} className={cx("divide-y divide-line border-y border-line", className)}>{children}</dl>;
}

function Row({ k, v, aside, title }: { k: ReactNode; v: ReactNode; aside?: ReactNode; title?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5" title={title}>
      <dt className="min-w-0 text-caption text-muted">{k}</dt>
      <dd className="num whitespace-nowrap text-right text-num-sm text-ink">
        {v}{aside !== undefined && <span className="ml-2 text-faint">{aside}</span>}
      </dd>
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-1.5 text-caption text-faint">
      <span aria-hidden className="h-2 w-2 animate-pulse bg-faint motion-reduce:animate-none" />Loading {what}…
    </p>
  );
}

function Failed({ what, error }: { what: string; error: unknown }) {
  return (
    <p className="flex items-baseline gap-2 py-1.5 text-caption text-muted">
      <StatusMark state="struck" className="translate-y-[-1px]" />
      <span>{what} is not available here: {(error as Error)?.message ?? "request failed"}. Nothing is substituted.</span>
    </p>
  );
}

/** The record's first note (grid spacing is not observation resolution), set beside the terrain numbers. */
function RecordNote({ r }: { r: MarsFeatureRecord }) {
  return r.notes[0] ? <p className="mt-2 border-l border-mars/60 pl-2.5 text-caption text-muted">{r.notes[0]}</p> : null;
}

/**
 * The GIS Mars feature record for a point outside the research zones: operator status, the eight 50 km
 * tier-2 descriptors with baselines, the tier-1 200 km record, observation support (metadata), quality flags
 * and the record's note.
 */
export function GisFeatureRecord({ lat, lon }: { lat: number; lon: number }) {
  const q = useMarsFeatures({ lat, lon });
  const r = q.data;
  if (q.isLoading) return <Loading what="the GIS terrain record" />;
  if (q.isError || !r) return <Failed what="The GIS terrain record" error={q.error} />;
  const opOk = r.operator.status === "ok";
  const keys = Object.keys(r.features);
  const t1 = r.tier1 ?? null;
  const os = r.observation_support as MarsFeatureRecord["observation_support"] & { use?: string; definition?: string };
  return (
    <div>
      <p className="flex items-baseline gap-2 text-caption text-ink/90">
        <StatusMark state={opOk ? "on" : "struck"} className="translate-y-[-1px]" />
        <span>
          MOLA observation model {opOk ? "available" : "unavailable"}
          {!opOk && r.operator.reason && <span className="text-muted"> · {r.operator.reason}</span>}
        </span>
      </p>
      {r.status !== "ok" && (
        <p className="mt-1.5 flex items-baseline gap-2 text-caption text-ink">
          <StatusMark state="caution" className="translate-y-[-1px]" />
          <span>Record status {r.status.replace(/_/g, " ")}{r.reasons.length ? `: ${r.reasons.join("; ")}` : ""}</span>
        </p>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="kicker !text-ink/80"><span className="num">{r.footprint_km}</span> km window · tier 2</span>
        <span className="kicker">Value · baseline</span>
      </div>
      <Rows label={`${r.footprint_km} km window descriptors`} className="mt-1.5">
        {keys.map((k) => {
          const unit = descriptorUnit(k, r.units);
          return <Row key={k} k={descriptorLabel(k)} v={formatValue(r.features[k], unit)} aside={baselineText(r.baselines_m?.[k])}
            title={r.feature_state?.[k] ? `State: ${r.feature_state[k]}` : undefined} />;
        })}
      </Rows>
      <RecordNote r={r} />

      {t1 && (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <span className="kicker !text-ink/80"><span className="num">{t1.footprint_km}</span> km · tier-1 record</span>
            <span className="kicker whitespace-nowrap">
              {typeof t1.n_cells === "number" ? <><span className="num">{t1.n_cells}</span> × </> : ""}<span className="num">{t1.cell_km}</span> km cells
            </span>
          </div>
          <Rows label={`${t1.footprint_km} km tier-1 record`} className="mt-1.5">
            {Object.keys(t1.features).map((k) => <Row key={k} k={descriptorLabel(k)} v={formatValue(t1.features[k], descriptorUnit(k))} />)}
          </Rows>
          {typeof t1.note === "string" && <p className="mt-1.5 text-caption text-faint">{t1.note}</p>}
        </>
      )}

      <div className="mt-4">
        <span className="kicker !text-ink/80">Observation support · metadata</span>
        <Rows label="Observation support, metadata only" className="mt-1.5">
          <Row k="Observed fraction · native MEGDR bins" v={os.available ? pctText(os.observed_fraction_native) : "—"} />
        </Rows>
        <p className="mt-1.5 text-caption text-faint">
          {os.available ? (os.use ? `${os.use.charAt(0).toUpperCase()}${os.use.slice(1)}.` : "Metadata only: never a weight or confidence.") : os.reason ?? "Not available for this point."}
        </p>
      </div>

      {r.quality_flags.length > 0 && (
        <ul aria-label="Quality flags" className="mt-3 space-y-1">
          {r.quality_flags.map((f) => (
            <li key={f} className="flex items-baseline gap-2 text-caption text-muted">
              <StatusMark state="caution" className="translate-y-[-1px]" />{flagText(f)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The ~1 km grid cell under the point: terrain values, then observation support as metadata. */
export function GridReadout({ lat, lon }: { lat: number; lon: number }) {
  const q = useGridPoint("mars", { lat, lon });
  const g = q.data;
  if (q.isLoading) return <Loading what="the 1 km grid" />;
  if (q.isError || !g) return <Failed what="The 1 km grid" error={q.error} />;
  const unit = (k: string) => descriptorUnit(k, Object.fromEntries(Object.entries(g.units).map(([a, b]) => [a, b.split(" ")[0]])));
  const val = (k: string) => {
    const v = g.values[k];
    return typeof v === "string" ? v : formatValue(v, unit(k));
  };
  const terrain = GRID_TERRAIN_KEYS.filter((k) => k in g.values);
  const support = GRID_SUPPORT_KEYS.filter((k) => k in g.values);
  return (
    <div>
      <p className="num text-num-sm text-muted">Cell {formatLat(g.cell.lat, 3)} {formatLon(g.cell.lon, 3)}</p>
      <Rows label="1 km grid values" className="mt-1.5">
        {terrain.map((k) => <Row key={k} k={descriptorLabel(k)} v={val(k)} title={g.units[k]} />)}
        {support.map((k) => (
          <Row key={k} k={<>{k === "obs_bins" ? "Observed bins (of 4)" : k === "window_observed_pct" ? "Window observed" : "Distance to observed"} <span className="text-faint">· metadata</span></>}
            v={k === "window_observed_pct" ? (typeof g.values[k] === "number" ? `${g.values[k]}%` : "—") : k === "obs_bins" ? (g.values[k] ?? "—") : val(k)} />
        ))}
      </Rows>
      {g.flags_set.length > 0 && (
        <p className="mt-1.5 flex items-baseline gap-2 text-caption text-muted">
          <StatusMark state="caution" className="translate-y-[-1px]" />{g.flags_set.join(" · ")}
        </p>
      )}
      {g.use_rules.length > 0 && (
        <Disclosure summary="Use rules" className="mt-1.5">
          <ul className="space-y-1.5">{g.use_rules.map((x) => <li key={x} className="text-caption text-muted">{x.charAt(0).toUpperCase() + x.slice(1)}.</li>)}</ul>
        </Disclosure>
      )}
    </div>
  );
}

/** Context layers at the point: value with units (or the payload's missing reason), native resolution, comparability on demand. */
export function ContextReadout({ lat, lon }: { lat: number; lon: number }) {
  const q = useContextPoint("mars", { lat, lon });
  const [open, setOpen] = useState<string | null>(null);
  const c = q.data;
  if (q.isLoading) return <Loading what="the context layers" />;
  if (q.isError || !c) return <Failed what="Context" error={q.error} />;
  const layers = Object.values(c.layers);
  return (
    <div>
      <ul aria-label="Context layers, not used in similarity" className="divide-y divide-line border-y border-line">
        {layers.map((l) => {
          const desc = (l as { unit_description?: string }).unit_description;
          const missing = l.value === null || l.feature_state === "missing";
          const shown = missing ? (l.missing_reason ?? "—") : typeof l.value === "number" ? formatValue(l.value, "", Math.abs(l.value) >= 10 ? 0 : 3) : String(l.value);
          const id = `ctx-${l.layer}`;
          return (
            <li key={l.layer} className="py-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                <span className="min-w-0 text-caption text-muted">{CONTEXT_LABELS[l.layer] ?? l.layer.replace(/_/g, " ")}</span>
                <span className={cx("text-right", missing ? "text-caption text-faint" : "num text-num-sm text-ink")}>
                  {shown}{!missing && l.units && !/^unit symbol$/.test(l.units) && <span className="text-faint"> {l.units.replace(/^1 \((.*)\)$/, "$1")}</span>}
                </span>
              </div>
              {desc && !missing && <p className="text-caption text-faint">{desc}</p>}
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-caption text-faint">{l.native_resolution ?? "Resolution not stated"}</span>
                {l.comparability && (
                  <button type="button" aria-expanded={open === l.layer} aria-controls={id} onClick={() => setOpen(open === l.layer ? null : l.layer)}
                    className="hit -mx-1 px-1 text-caption text-muted underline decoration-faint underline-offset-2 hover:text-ink">
                    Comparability
                  </button>
                )}
              </div>
              {open === l.layer && <p id={id} className="mt-1 text-caption text-ink/85">{l.comparability}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-caption text-faint">Context only: never a similarity feature, weight or confidence. Each value is its layer's native pixel.</p>
    </div>
  );
}
