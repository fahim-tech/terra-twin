import { ArrowLeft, Check, Minus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Bar, Button, Chip, cx, Eyebrow, fmt, Note, pct, Segmented } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useApp } from "../../store/app";
import type { AnalogSearch } from "../../types/contracts";
import { DecisionBlock } from "../analogs/AnalogResults";
import { type CandidateView, prettyWindow, selectedCandidate } from "../analogs/candidates";
import { DIFFERENCES_SOURCE, interpret, PLANETARY_DIFFERENCES, TIER1_SPECS, TIER2_LABELS } from "./science";

export interface CompareRow { key: string; label: string; unit: string; mars: number | null; earth: number | null; s: number | null }

export function tier1Rows(search: AnalogSearch, c: CandidateView): { rows: CompareRow[]; S: number | null; coverage: number | null; regionId: string } | null {
  const marsT1 = Object.fromEntries(search.mars.tier1_features.map((f) => [f.key, f.value]));
  if (c.t1) {
    return {
      regionId: c.t1.region_id, S: c.t1.similarity, coverage: c.t1.coverage,
      rows: Object.keys(TIER1_SPECS).map((k) => ({ key: k, label: TIER1_SPECS[k].label, unit: TIER1_SPECS[k].unit, mars: marsT1[k] ?? null, earth: c.t1!.features[k] ?? null, s: c.t1!.per_feature[k] ?? null })),
    };
  }
  const ctx = c.t2?.tier1_context;
  if (!ctx) return null;
  return {
    regionId: ctx.region_id, S: ctx.similarity, coverage: ctx.coverage,
    rows: ctx.rows.map((r) => ({ ...r, label: TIER1_SPECS[r.key]?.label ?? r.key })),
  };
}

export const DIMENSIONS = (c: CandidateView) => [
  { name: "Terrain & geomorphology", status: "evaluated" as const, detail: c.tier === 2 ? "8 multiscale terrain descriptors, compared in Mars observation space (OOM)." : "7 tier-1 terrain descriptors on 25 km cells (as measured)." },
  { name: "Engineering & operations", status: c.t2?.landcover?.available ? ("partial" as const) : ("not_evaluated" as const), detail: c.t2?.landcover?.available ? `Exposed-ground check only: ${pct(c.t2.landcover.frac_bare_like ?? null)} bare-like, ${pct(c.t2.landcover.frac_vegetated ?? null)} vegetated (ESA WorldCover 2021). Trafficability, access and permits not assessed.` : "No surface-cover or access data for this candidate." },
  { name: "Geological materials", status: "not_evaluated" as const, detail: "No lithology or mineralogy dataset is connected for either planet." },
  { name: "Surface processes", status: "not_evaluated" as const, detail: "Process relationships require geological evidence; terrain geometry alone cannot establish them." },
  { name: "Environmental conditions", status: "not_evaluated" as const, detail: "Climate and thermal datasets are not comparable or not ingested (e.g. MODIS LST ≠ TES thermal inertia)." },
  { name: "Resources", status: "not_evaluated" as const, detail: "Ice and mineral resource layers are not connected." },
];

function Interp({ r }: { r: CompareRow }) {
  const i = interpret(r.key, r.mars, r.earth, r.s);
  return (
    <span className={cx("inline-flex items-center gap-1.5", i.kind === "match" ? "text-ok" : i.kind === "mismatch" ? "text-warn" : "text-faint")}>
      {i.kind === "match" ? <Check className="h-3 w-3" /> : i.kind === "mismatch" ? <X className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      <span className="text-[11.5px]">{i.text}</span>
    </span>
  );
}

export function ComparisonPanel() {
  const { search, candidateId, selection, representation, set, whyOpen, go } = useApp();
  const [view, setView] = useState<"features" | "dimensions" | "limits">("features");
  const c = useMemo(() => selectedCandidate(search, candidateId), [search, candidateId]);
  if (!search || !c) {
    return (
      <div className="panel absolute inset-x-3 bottom-3 z-10 rounded-2xl p-6 text-[13px] text-muted">
        Select an Earth candidate first. <Button variant="ghost" onClick={() => go("earth")}>Back to results</Button>
      </div>
    );
  }
  const t1 = tier1Rows(search, c);
  const t2 = search.tier2;
  const em = c.t2?.features?.earth_as_measured ?? null;

  return (
    <>
      <motion.section initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Mars–Earth comparison" data-occludes="both"
        className="panel no-print absolute inset-x-0 bottom-0 z-10 flex max-h-[62%] flex-col rounded-t-2xl shadow-2xl shadow-black/50 md:inset-x-3 md:bottom-3 md:max-h-[54%] md:rounded-2xl">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line/60 px-5 py-3.5">
          <button onClick={() => go("earth")} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Results</button>
          <div className="flex min-w-0 items-center gap-2 text-[13.5px]">
            <span className="truncate text-mars">{selection?.label}</span><span className="text-faint">↔</span><span className="truncate text-earth">{c.label}</span>
          </div>
          <div className="num flex items-baseline gap-2">
            <span className="eyebrow">{c.tier === 2 ? "S · OOM" : "S · tier 1"}</span>
            <span className="text-[18px] font-semibold">{fmt(c.score, undefined, 3)}</span>
            <span className="text-[11px] text-faint">coverage {pct(c.coverage)}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Segmented ariaLabel="Comparison view" size="sm" value={view} onChange={setView}
              options={[{ value: "features", label: "Features" }, { value: "dimensions", label: "Dimensions" }, { value: "limits", label: "Where it breaks down" }]} />
            <Button variant="primary-earth" className="py-1.5" onClick={() => set({ whyOpen: true })}><Sparkles className="h-3.5 w-3.5" /> Why this analog?</Button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {view === "features" && (
            <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <Eyebrow>Same operator, both planets · tier-1 descriptors</Eyebrow>
                  {t1 && <span className="num text-[11px] text-faint">S {fmt(t1.S, undefined, 3)} · {t1.regionId}</span>}
                </div>
                {t1 ? (
                  <table className="w-full text-left text-[12px]">
                    <thead className="text-[10.5px] uppercase tracking-wider text-faint">
                      <tr><th className="py-1.5 font-medium">Factor</th><th className="py-1.5 text-right font-medium text-mars/80">Mars</th><th className="py-1.5 text-right font-medium text-earth/80">Earth</th><th className="hidden py-1.5 pl-4 font-medium sm:table-cell">Interpretation</th></tr>
                    </thead>
                    <tbody>
                      {t1.rows.map((r) => (
                        <tr key={r.key} className="border-t border-line/40">
                          <td className="py-2 pr-2 text-ink/90">{r.label}<div className="mt-1 w-24"><Bar value={r.s} /></div></td>
                          <td className="num py-2 text-right">{fmt(r.mars, r.unit)}</td>
                          <td className="num py-2 text-right">{fmt(r.earth, r.unit)}</td>
                          <td className="hidden py-2 pl-4 sm:table-cell"><Interp r={r} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <Note tone="warning">Tier-1 context unavailable.</Note>}
                <p className="mt-2 text-[11px] leading-relaxed text-faint">
                  Mars: median over the EZ's 25 km cells from the 463 m MOLA grid. Earth: the 25 km GMTED2010 cell{c.tier === 2 ? " under the window centre" : ""}. Both from <span className="font-mono">screen.cell_descriptors</span>; the bar is the kernel's per-feature similarity.
                </p>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Eyebrow>50 km window · tier-2 descriptors</Eyebrow>
                  {c.tier === 2 && (
                    <Segmented ariaLabel="Earth representation" size="sm" value={representation} onChange={(v) => set({ representation: v })}
                      options={[{ value: "mars_observation_space", label: "As MOLA would observe it" }, { value: "as_measured", label: "As measured" }]} />
                  )}
                </div>
                {c.tier === 2 ? (
                  <>
                    <p className="mb-2 text-[11.5px] text-muted">
                      {representation === "mars_observation_space" ? "Earth terrain: as MOLA would observe it at this Mars site" : "Earth terrain: as measured (Copernicus GLO-90, 463 m) — uncorrected comparator"}
                    </p>
                    <table className="w-full text-left text-[12px]">
                      <thead className="text-[10.5px] uppercase tracking-wider text-faint">
                        <tr><th className="py-1.5 font-medium">Descriptor</th><th className="py-1.5 text-right font-medium text-mars/80">Mars</th><th className="py-1.5 text-right font-medium text-earth/80">Earth</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(TIER2_LABELS).map(([k, l]) => (
                          <tr key={k} className="border-t border-line/40">
                            <td className="py-1.5 text-ink/90">{l.label}</td>
                            <td className="num py-1.5 text-right text-faint" title="Mars 50 km window descriptors are stored only in the research pickles; live values need the MOLA mosaic (GIS).">n/a</td>
                            <td className="num py-1.5 text-right">{representation === "as_measured" ? fmt(em?.[k] ?? null, l.unit) : <span className="text-faint" title="Operator output requires the target's MEGDR counts tiles.">n/a</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Note className="mt-2.5">
                      The OOM score {fmt(c.score, undefined, 3)} is the research record (rotation 0°, equal weights). Per-descriptor values in Mars observation space, and the Mars window values, need the MEGDR counts tiles and MOLA mosaic from the GIS service.
                    </Note>
                    <div className="mt-3 rounded-lg bg-space/50 p-3 ring-1 ring-line/50"><DecisionBlock t2={t2} /></div>
                  </>
                ) : (
                  <Note>Tier-1 cells have no tier-2 window yet. Refining new shortlisted cells requires on-demand GLO-90 extraction and the target's MOLA operator (GIS service, not connected).</Note>
                )}
              </div>
            </div>
          )}

          {view === "dimensions" && (
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              {DIMENSIONS(c).map((d) => (
                <div key={d.name} className="flex gap-3 border-b border-line/40 py-3">
                  <Chip tone={d.status === "evaluated" ? "earth" : d.status === "partial" ? "warn" : "neutral"} className="h-fit">{d.status.replace("_", " ")}</Chip>
                  <div><div className="text-[12.5px] text-ink">{d.name}</div><p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{d.detail}</p></div>
                </div>
              ))}
              <p className="col-span-full pt-3 text-[11px] leading-relaxed text-faint">
                An Earth location does not need to match Mars in every way. TerraTwin currently measures one dimension (terrain geometry) and says so; the others are shown so gaps stay visible.
              </p>
            </div>
          )}

          {view === "limits" && (
            <div>
              <table className="w-full text-left text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-faint"><tr><th className="py-1.5 font-medium">Condition</th><th className="py-1.5 font-medium text-mars/80">Mars</th><th className="py-1.5 font-medium text-earth/80">Earth</th><th className="hidden py-1.5 font-medium md:table-cell">Consequence</th></tr></thead>
                <tbody>{PLANETARY_DIFFERENCES.map((d) => (
                  <tr key={d.factor} className="border-t border-line/40 align-top">
                    <td className="py-2 pr-3 text-ink/90">{d.factor}</td><td className="num py-2 pr-3">{d.mars}</td><td className="num py-2 pr-3">{d.earth}</td>
                    <td className="hidden py-2 text-[11.5px] text-muted md:table-cell">{d.note}</td>
                  </tr>))}</tbody>
              </table>
              <p className="mt-2 text-[11px] text-faint">Source: {DIFFERENCES_SOURCE}. Shown as limitations, never folded into the score.</p>
            </div>
          )}
        </div>
      </motion.section>

      <AnimatePresence>{whyOpen && <WhyDrawer c={c} rows={t1?.rows ?? []} onClose={() => set({ whyOpen: false })} />}</AnimatePresence>
    </>
  );
}

function WhyDrawer({ c, rows, onClose }: { c: CandidateView; rows: CompareRow[]; onClose: () => void }) {
  const { search } = useApp();
  const scored = rows.filter((r) => r.s !== null).sort((a, b) => (b.s ?? 0) - (a.s ?? 0));
  const strongest = scored.filter((r) => interpret(r.key, r.mars, r.earth, r.s).kind === "match").slice(0, 3);
  const mismatches = scored.filter((r) => interpret(r.key, r.mars, r.earth, r.s).kind === "mismatch");
  const t2 = search!.tier2;
  const gate = c.t2?.landcover;
  const member = t2.decision.members.includes(c.t2?.id ?? "");

  return (
    <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Why this analog?"
      className="panel no-print absolute inset-y-0 right-0 z-30 flex w-full flex-col shadow-2xl shadow-black/60 sm:inset-y-3 sm:right-3 sm:w-[420px] sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-line/60 px-6 py-5">
        <div>
          <Eyebrow className="text-earth/80">Why this analog?</Eyebrow>
          <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.015em]">{c.label}</h3>
          <p className="num mt-0.5 font-mono text-[11px] text-muted">{formatLat(c.lat, 2)} · {formatLon(c.lon, 2)} · {c.tier === 2 ? "50 km window" : "25 km cell"}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-elevated hover:text-ink"><X className="h-4 w-4" /></button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 text-[12.5px] leading-relaxed">
        <div>
          <p className="text-ink/90">
            {c.tier === 2 ? (
              <>Seen through the {search!.mars.site_name ?? "target"} MOLA observation chain, this window's terrain scores <span className="num text-earth">{fmt(c.score, undefined, 3)}</span> on eight terrain descriptors
              {member ? (t2.decision.type === "named_leader" ? ", and it stays the leader under all four window orientations." : `, as one of ${t2.decision.members.length} tied candidates — the MOLA geometry cannot separate them.`) : "."}</>
            ) : (
              <>Among {search!.tier1?.candidate_pool.n_cells_searched.toLocaleString()} Earth land cells this one ranks #{c.rank} with S <span className="num text-earth">{fmt(c.score, undefined, 3)}</span> on tier-1 terrain descriptors (as measured, 25 km).</>
            )}
          </p>
        </div>
        <Block title="Strongest matching characteristics">
          {strongest.length ? strongest.map((r) => <Li key={r.key} tone="ok">{r.label}: Mars {fmt(r.mars, r.unit)} vs Earth {fmt(r.earth, r.unit)}</Li>) : <Li tone="muted">No descriptor falls within research tolerance.</Li>}
        </Block>
        <Block title="Important mismatches">
          {mismatches.length ? mismatches.map((r) => <Li key={r.key} tone="warn">{r.label}: {interpret(r.key, r.mars, r.earth, r.s).text.split(" · ")[1]}</Li>) : <Li tone="muted">None outside tolerance at tier 1.</Li>}
          {gate && gate.available && gate.gate === "fail" && <Li tone="warn">Surface cover: {gate.reason}</Li>}
        </Block>
        <Block title="Relevant physical processes">
          <Li tone="muted">Not established. Terrain-shape similarity does not show that the same processes formed both surfaces; this needs geological evidence and expert review.</Li>
        </Block>
        <Block title="Potential applications (to be verified)">
          <Li tone="earth">Testing DEM, roughness and hazard-mapping algorithms on terrain with comparable statistics.</Li>
          {gate?.available && gate.gate !== "fail" && (gate.frac_bare_like ?? 0) >= 0.5 && <Li tone="earth">Candidate for field-test site screening (exposed ground {pct(gate.frac_bare_like ?? null)}); access, safety and permits not assessed.</Li>}
        </Block>
        <Block title="Limitations">
          <Li tone="muted">Terrain geometry only — not geology, formation process, habitability, gravity, atmosphere or radiation.</Li>
          {c.tier === 2 && <Li tone="muted">Benefit of observation-space matching shown on synthetic terrain twins only (0.30 → 0.97). Not validated against field data or expert review.</Li>}
          {c.tier === 2 && <Li tone="muted">Chosen from a fixed 230-window research sample, not a worldwide high-resolution search.</Li>}
          <Li tone="muted">Rankings depend on the analysis window; compare only within one window size.</Li>
        </Block>
        <Block title="Supporting evidence">
          <Li tone="muted">Mars: USGS MOLA 463 m mosaic, MEGDR 128 ppd counts (observed fraction {pct(search!.mars.observation_support?.observed_fraction ?? null, 1)}).</Li>
          <Li tone="muted">Earth: {c.tier === 2 ? "Copernicus GLO-90 window (463 m AEQD), ESA WorldCover 2021" : "GMTED2010 30″ tier-1 cell"}.</Li>
          <Li tone="muted">Method: {c.tier === 2 ? "OOM oom-1.0 (G2/G5)" : "MOSAIC tier-1 screen"}; novelty of this site not assessed.</Li>
        </Block>
      </div>
      <footer className="border-t border-line/60 px-6 py-3 text-[11px] text-faint">
        {c.t2 ? `Research window ${prettyWindow(c.t2.id)} · ${c.t2.id}` : c.t1?.region_id}
      </footer>
    </motion.aside>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><Eyebrow className="mb-2">{title}</Eyebrow><ul className="space-y-1.5">{children}</ul></div>;
}
function Li({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "muted" | "earth" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", muted: "bg-faint", earth: "bg-earth" }[tone];
  return <li className="flex gap-2.5 text-muted"><span className={cx("mt-[7px] h-1 w-1 shrink-0 rounded-full", c)} /><span>{children}</span></li>;
}
