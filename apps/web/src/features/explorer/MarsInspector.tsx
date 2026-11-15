import { ArrowRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Bar, Button, Chip, cx, Flags, fmt, Note, pct, Section, Spinner } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useFindAnalogs, useMarsAnalysis, useMissions } from "../../services/api";
import { useApp } from "../../store/app";
import type { FeatureValue } from "../../types/contracts";

const STATE_TONE: Record<FeatureValue["state"], "ok" | "earth" | "warn" | "neutral" | "bad"> = {
  measured: "ok", derived: "earth", modelled: "warn", proxy: "warn", unavailable: "neutral", insufficient_resolution: "bad",
};

export function FeatureRow({ f }: { f: FeatureValue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/40 last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 py-2 text-left">
        <span className={cx("text-[12.5px]", f.value === null ? "text-faint" : "text-ink/90")}>{f.label}</span>
        <span className="flex items-baseline gap-2">
          <span className={cx("num text-[13px]", f.value === null ? "text-faint" : "text-ink")}>{f.value === null ? "Unavailable" : fmt(f.value, f.unit)}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 pb-3 text-[11.5px] leading-relaxed text-muted">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone={STATE_TONE[f.state]}>{f.state.replace("_", " ")}</Chip>
            {f.native_resolution_m ? <Chip>grid {fmt(f.native_resolution_m, "m", 0)}</Chip> : null}
            {f.baseline_m ? <Chip>baseline {fmt(f.baseline_m, "m", 0)}</Chip> : null}
          </div>
          {f.explanation && <p>{f.explanation}</p>}
          {f.footprint && <p><span className="text-faint">Support:</span> {f.footprint}</p>}
          {f.source_id && <p><span className="text-faint">Source:</span> {f.source_id}</p>}
          {f.method && <p><span className="text-faint">Method:</span> <span className="font-mono text-[10.5px]">{f.method}</span></p>}
          {f.reason && <p className="text-warn/90">{f.reason}</p>}
        </div>
      )}
    </div>
  );
}

export function MarsInspector() {
  const { selection, footprintKm, mission, set, go } = useApp();
  const missions = useMissions();
  const params = selection ? { lat: selection.lat, lon: selection.lon, footprint_km: footprintKm, mission } : null;
  const q = useMarsAnalysis(params);
  const find = useFindAnalogs();
  const [showEz, setShowEz] = useState(false);
  const m = missions.data?.find((x) => x.id === mission);

  if (!selection) {
    return (
      <div className="flex h-full flex-col justify-center px-6 py-10 text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full ring-1 ring-mars/40" />
        <p className="text-[14px] text-ink">Select a location on Mars</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Click the globe, enter coordinates or choose one of the 39 Exploration Zones to see its measured terrain
          characteristics and observation support.
        </p>
      </div>
    );
  }

  const a = q.data;
  const run = () => {
    find.mutate({ lat: selection.lat, lon: selection.lon, footprint_km: footprintKm, mission }, {
      onSuccess: (res) => {
        // Only a stable named leader is pre-selected. A tied set is never reduced to one member
        // on the user's behalf; tier-1 cells are a screening list, so nothing is pre-selected there either.
        const leader = res.tier2.decision.type === "named_leader" ? res.tier2.candidates[0]?.id : undefined;
        const first = leader ? `t2:${leader}` : null;
        set({ search: res, candidateId: first, tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1 });
        go("earth");
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2">
          <Chip tone="mars">Mars target</Chip>
          {a?.status === "available" ? <Chip tone="ok">Research EZ</Chip> : a?.status === "unavailable" ? <Chip>Arbitrary point</Chip> : null}
        </div>
        <h2 className="mt-2.5 text-[19px] font-semibold tracking-[-0.015em]">{selection.label}</h2>
        <p className="num mt-1 font-mono text-[11.5px] text-muted">
          {formatLat(selection.lat)} · {formatLon(selection.lon)} · {footprintKm} km footprint
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {q.isLoading && <div className="px-5 py-4"><Spinner label="Retrieving scientific measurements" /></div>}
        {q.isError && <div className="px-5 py-4"><Note tone="critical">{(q.error as Error).message}</Note></div>}

        {a && (
          <>
            <Section title="Data availability">
              {a.status === "available" ? (
                <Note>Inside the <span className="text-ink">{a.site_name}</span> Exploration Zone footprint. Values describe the research EZ, derived from the 463 m MOLA grid.</Note>
              ) : (
                <div className="space-y-2.5">
                  <Note tone="warning">{a.unavailable?.reason}</Note>
                  <div className="flex flex-wrap gap-1.5">
                    {a.unavailable?.missing_inputs.map((x) => <Chip key={x} className="whitespace-normal text-left">{x}</Chip>)}
                  </div>
                </div>
              )}
              <div className="mt-3"><Flags flags={a.quality_flags} /></div>
            </Section>

            {a.observation_support && (
              <Section title="MOLA observation support">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-ink/90">Bins with ≥ 1 laser return</span>
                  <span className="num text-[15px] font-medium">{pct(a.observation_support.observed_fraction, 1)}</span>
                </div>
                <Bar value={a.observation_support.observed_fraction} tone="mars" className="mt-2" />
                <div className="num mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted">
                  <div><div className="text-faint">Interpolated</div>{pct(a.observation_support.interpolation_dependence, 0)}</div>
                  <div><div className="text-faint">Mean shots/bin</div>{fmt(a.observation_support.mean_counts, undefined, 2)}</div>
                  <div><div className="text-faint">50 km window</div>{pct(a.observation_support.observed_fraction_native_50km, 1)}</div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-faint">{a.observation_support.note}</p>
              </Section>
            )}

            {a.tier1_features.length > 0 && (
              <Section title="Terrain · tier-1 descriptors" aside={<span className="text-[10.5px] text-faint">25 km cells, median</span>}>
                {a.tier1_features.map((f) => <FeatureRow key={f.key} f={f} />)}
              </Section>
            )}

            {a.ez_features.length > 0 && (
              <Section title="Terrain · full EZ AOI" aside={
                <button onClick={() => setShowEz((s) => !s)} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink">
                  {showEz ? "Hide" : "Show"} <ChevronDown className={cx("h-3 w-3 transition-transform", showEz && "rotate-180")} />
                </button>}>
                {showEz ? a.ez_features.map((f) => <FeatureRow key={f.key} f={f} />) :
                  <p className="text-[11.5px] text-faint">Multiscale descriptors over the 200 × 200 km EZ area (8 values).</p>}
              </Section>
            )}

            <Section title="Other factors">
              {a.unavailable_factors.map((f) => <FeatureRow key={f.key} f={f} />)}
            </Section>
          </>
        )}
      </div>

      <div className="border-t border-line/70 p-4">
        {m && !m.available && <Note tone="warning" className="mb-3">{m.label}: {m.reason_unavailable}</Note>}
        {find.isError && <Note tone="critical" className="mb-3">{(find.error as Error).message}</Note>}
        <Button variant="primary-mars" className="w-full py-2.5" onClick={run} disabled={!a || find.isPending || (m && !m.available)}>
          {find.isPending ? "Searching Earth…" : <>Find Earth Analogs <ArrowRight className="h-4 w-4" /></>}
        </Button>
        <p className="mt-2 text-center text-[10.5px] text-faint">
          {a?.status === "available" ? `${m?.label ?? mission} · tier-1 over 249,165 Earth cells, then OOM tier-2` : "Runs the request; reports what is unavailable rather than guessing"}
        </p>
      </div>
    </div>
  );
}
