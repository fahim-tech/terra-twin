import type { StatusKind } from "../../components/marks";
import type { GisStatus } from "../../services/gis";

/** One row of the Evidence page's GIS integration readout. Every value is read from /api/gis/status or
 *  /api/datasets; a field the payload does not carry is shown as not reported, never as "0" or "off". */
export interface GisRow { key: string; label: string; value: string; state: StatusKind; detail?: string }

type DatasetLite = { id: string; status: string; native_resolution?: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const DATASET_ROWS: { id: string; label: string }[] = [
  { id: "mola_mosaic", label: "MOLA 463 m mosaic" },
  { id: "mola_counts_tiles", label: "MEGDR observation counts" },
];

/** Builds the GIS integration rows: contract, grids, context layers, discovery worker and the two MOLA
 *  inputs live discovery needs. `status` undefined means the GIS status was not loaded. */
export function gisRows(status: GisStatus | undefined, datasets: DatasetLite[] | undefined): GisRow[] {
  const rows: GisRow[] = [];
  if (status) {
    const s = status as GisStatus & Record<string, unknown>;
    const versions = [str(s.processing_version), str(s.method_version)].filter(Boolean).join(" · ");
    rows.push({
      key: "contract", label: "Data contract", value: status.contract_version ?? "not reported",
      state: status.status === "available" ? "on" : "struck", detail: versions || undefined,
    });
    for (const planet of ["mars", "earth"] as const) {
      const g = status.grids[planet];
      rows.push({
        key: `grid-${planet}`, label: `${planet === "mars" ? "Mars" : "Earth"} grid`,
        value: !g ? "not reported" : g.available ? "Live" : "Not available",
        state: !g ? "off" : g.available ? "on" : "struck",
        detail: g ? (g.available ? g.product : g.reason) ?? undefined : undefined,
      });
    }
    const ctx = (s.context ?? null) as { available?: unknown; reason?: unknown } | null;
    const ctxOn = ctx && typeof ctx.available === "boolean" ? ctx.available : null;
    rows.push({
      key: "context", label: "Context layers", value: ctxOn === null ? "not reported" : ctxOn ? "Live" : "Not available",
      state: ctxOn === null ? "off" : ctxOn ? "on" : "struck",
      detail: ctxOn === false ? str(ctx?.reason) ?? undefined : "Context only, never a similarity feature",
    });
    const d = status.discovery;
    const w = (d.worker ?? null) as { alive?: unknown; age_s?: unknown } | null;
    const alive = w && typeof w.alive === "boolean" ? w.alive : null;
    const age = numOrNull(w?.age_s);
    const active = numOrNull(d.active_runs);
    const max = numOrNull(d.max_active_runs);
    const parts = [
      alive === null ? null : alive ? `worker alive${age !== null ? ` (heartbeat ${Math.round(age)} s ago)` : ""}` : "worker not responding",
      active !== null ? `active runs ${active}${max !== null ? ` of ${max}` : ""}` : null,
      numOrNull(d.window_km) !== null ? `${d.window_km} km windows` : null,
    ].filter(Boolean);
    rows.push({
      key: "discovery", label: "Live discovery", value: d.status === "available" ? "Available" : "Not available",
      state: d.status === "available" && alive !== false ? "on" : "struck",
      detail: d.status === "available" ? parts.join(" · ") || undefined : d.reason ?? (d.missing_inputs.join(" · ") || undefined),
    });
  }
  for (const { id, label } of DATASET_ROWS) {
    const ds = datasets?.find((x) => x.id === id);
    if (!ds) continue;
    const on = ds.status === "connected" || ds.status === "imported";
    rows.push({
      key: id, label, value: on ? "Connected" : ds.status === "missing" ? "Not connected" : ds.status.replace(/_/g, " "),
      state: on ? "on" : ds.status === "missing" ? "struck" : "off", detail: ds.native_resolution ?? undefined,
    });
  }
  return rows;
}

/** The sentence under "Live research comparison": research comparisons are published records, and live
 *  discovery runs only through the GIS worker when the GIS status says so. */
export function liveSentence(status: GisStatus | undefined): string {
  const base = "Research comparisons shown in Compare and the report are published research records.";
  if (!status) return `${base} Live discovery status could not be read.`;
  const d = status.discovery;
  const alive = (d.worker as { alive?: unknown } | undefined)?.alive;
  if (d.status === "available" && alive !== false) return `${base} Live discovery runs through the GIS worker for a chosen Mars window.`;
  return `${base} Live discovery is not available${d.reason ? `: ${d.reason}` : ""}.`;
}
