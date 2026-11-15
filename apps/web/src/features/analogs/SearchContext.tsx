import { MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Chip, Eyebrow, fmt, Note, Section, Segmented } from "../../components/ui";
import { formatLat, formatLon, normLon } from "../../lib/geodesy";
import { API_BASE, useMissions } from "../../services/api";
import { useApp } from "../../store/app";

export function SearchContext() {
  const { search, selection, mission, knownFilter, set, go } = useApp();
  const missions = useMissions();
  const m = missions.data?.find((x) => x.id === (search?.request as { mission?: string } | undefined)?.mission) ?? missions.data?.find((x) => x.id === mission);
  const t1 = search?.tier1;
  const t2 = search?.tier2;

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <Section title="Mars target">
        <button onClick={() => go("mars")} className="group w-full text-left">
          <div className="text-[14px] font-medium text-mars group-hover:underline">{selection?.label ?? "—"}</div>
          {selection && <div className="num mt-0.5 font-mono text-[11px] text-muted">{formatLat(selection.lat, 2)} · {formatLon(selection.lon, 2)}</div>}
        </button>
        {m && (
          <div className="mt-3 space-y-1.5 text-[11.5px] text-muted">
            <div className="flex items-center justify-between"><span>Mission</span><span className="text-ink">{m.label}</span></div>
            <div className="flex items-center justify-between"><span>Land-cover gate</span>
              <Chip tone={m.gate_mode === "exclude" ? "warn" : "neutral"}>{m.gate_mode === "exclude" ? "exclude before ranking" : "report only"}</Chip></div>
            <p className="pt-1 text-[11px] leading-relaxed text-faint">Mission weights are research hypotheses (<span className="break-all font-mono text-[10px]">{m.tier1_weights_source}</span>). Changing mission requires a new search.</p>
          </div>
        )}
      </Section>

      <Section title="Search coverage">
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between"><span className="text-[12px] text-ink/90">Tier 1 · global coarse screen</span>
              <span className="num text-[12px]">{t1 ? t1.candidate_pool.n_cells_searched.toLocaleString() : "—"} cells</span></div>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">
              {t1 ? `~${t1.candidate_pool.cell_size_km} km land cells, lat ${t1.candidate_pool.lat_range.map((x) => x.toFixed(0)).join("…")}°. ${t1.candidate_pool.coverage_note}` : "Unavailable for this target."}
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between"><span className="text-[12px] text-ink/90">Tier 2 · OOM refinement</span>
              <span className="num text-[12px]">{t2?.candidate_pool ? `${t2.candidate_pool.n_windows} windows` : "—"}</span></div>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">
              {t2?.candidate_pool ? t2.candidate_pool.note : "No tier-2 refinement for this target."}
            </p>
          </div>
          {t2 && t2.live_refinement.status !== "available" && (
            <Note tone="warning">Live refinement of new tier-1 shortlists is not connected yet (needs MEGDR counts tiles, MOLA mosaic and GLO-90 extraction from the GIS service).</Note>
          )}
        </div>
      </Section>

      <Section title="Reference status">
        <Segmented ariaLabel="Known analog filter" size="sm" value={knownFilter} onChange={(v) => set({ knownFilter: v })}
          options={[{ value: "all", label: "All" }, { value: "not_in_reference_set", label: "Not in reference set" }, { value: "near_documented_analog", label: "Near known analog" }]} />
        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          Reference set = documented analogs in the research pool. Being outside it is not evidence of novelty; no site here is claimed to be newly discovered.
        </p>
      </Section>

      <EarthLookup />
    </div>
  );
}

/** Tier-1 descriptors at any Earth coordinate — demonstrates arbitrary-location support of the coarse index. */
function EarthLookup() {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [q, setQ] = useState<{ lat: number; lon: number } | null>(null);
  const r = useQuery({
    queryKey: ["earthRegion", q], enabled: !!q,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/earth/region?lat=${q!.lat}&lon=${q!.lon}`);
      if (!res.ok) throw new Error("lookup failed");
      return res.json() as Promise<{ region_id: string; lat: number; lon: number; features: Record<string, number | null>; quality_flags: { code: string; message: string }[] }>;
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const a = Number(lat), b = Number(lon);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90) setQ({ lat: a, lon: normLon(b) });
  };
  return (
    <Section title="Any Earth coordinate">
      <form onSubmit={submit} className="flex gap-2">
        <input aria-label="Earth latitude" placeholder="Lat °" value={lat} onChange={(e) => setLat(e.target.value)} className="num w-full min-w-0 rounded-md bg-space/70 px-2 py-1.5 text-[12px] ring-1 ring-line/70 outline-none placeholder:text-faint" />
        <input aria-label="Earth longitude" placeholder="Lon °E" value={lon} onChange={(e) => setLon(e.target.value)} className="num w-full min-w-0 rounded-md bg-space/70 px-2 py-1.5 text-[12px] ring-1 ring-line/70 outline-none placeholder:text-faint" />
        <Button type="submit" variant="outline" className="px-2.5" title="Look up tier-1 cell"><MapPin className="h-3.5 w-3.5" /></Button>
      </form>
      {r.data && (
        <div className="mt-3 space-y-1 text-[11.5px]">
          <Eyebrow>{r.data.region_id} · {r.data.lat.toFixed(2)}, {r.data.lon.toFixed(2)}</Eyebrow>
          {(["mean_slope_deg", "slope_p90_deg", "relative_relief_m", "elev_std_m", "mean_elev_m"] as const).map((k) => (
            <div key={k} className="flex justify-between text-muted"><span>{k.replace(/_/g, " ").replace(" deg", "").replace(" m", "")}</span>
              <span className="num text-ink">{fmt(r.data.features[k], k.endsWith("deg") ? "deg" : "m")}</span></div>
          ))}
          {r.data.quality_flags.map((f) => <Note key={f.code} tone="warning" className="pt-1">{f.message}</Note>)}
        </div>
      )}
      {r.isError && <Note tone="warning" className="mt-2">Lookup failed.</Note>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">Nearest 25 km cell of the global index.</p>
    </Section>
  );
}
