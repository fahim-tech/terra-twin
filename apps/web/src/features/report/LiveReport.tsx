import { useMemo, useRef, useState, type ReactNode } from "react";
import { OutcomeMark, SFigure, StatusMark } from "../../components/marks";
import { cx, pct, Spinner } from "../../components/ui";
import { G5, zoneName } from "../../lib/glossary";
import { useMarsRelief, useMissions } from "../../services/api";
import { useWindowRelief } from "../../services/gis";
import { useApp } from "../../store/app";
import { cellLabel, disclaimerText, scopeText, westToEast } from "../analogs/discoveryModel";
import { DescriptorTable } from "../comparison/LiveComparison";
import { asMeasured, type LivePair, liveBasis, liveGate, liveMarsKind, liveMarsName, liveMeasures, liveOrigin, liveVerdict, liveVersions, numAt, rotationRange, strAt } from "../comparison/live";
import { recordDigits } from "../comparison/model";
import type { LiveCompare } from "../comparison/useLive";
import { Designation, Field } from "./DossierHeader";
import { DossierIndex, useDossierNav } from "./DossierIndex";
import { bodyFor, LocationPlate, PLATE_HEIGHT_KM, type PlateFrame, stageAspect, useSnapshot } from "./LocationPlate";
import { type DossierSection as Sec, fmtLat, fmtLon, generatedStamp, type SectionId } from "./model";
import { DISPLAY, DossierSection, ReadoutGrid } from "./parts";
import { wholeDiskHeightKm } from "./plateGeometry";
import { dossierPrintCss } from "./print";
import { ReliefPlate } from "./ReliefSlot";
import { Differences, References } from "./sections";

/** The live dossier's sections, in reading order (ids reuse the research dossier's anchors where they mean the same). */
const LIVE_SECTIONS: { id: string; title: string }[] = [
  { id: "plates", title: "Location plates" },
  { id: "figures", title: "Key figures" },
  { id: "decision", title: "Decision" },
  { id: "scope", title: "Scope of the search" },
  { id: "terrain", title: "Terrain descriptors" },
  { id: "differences", title: "Planetary differences" },
  { id: "limitations", title: "Limitations" },
  { id: "provenance", title: "Provenance" },
  { id: "references", title: "References" },
];

const fmtCoord = (lat: number, lon: number) => `${fmtLat(lat, recordDigits(lat, lon))}  ${fmtLon(lon, recordDigits(lat, lon))}`;

/**
 * The mission dossier for a live discovery window: the run's Mars target and the selected refined Earth window,
 * every figure read from the run payload. Limitations are the run's own, verbatim; provenance names the run id and
 * its method, processing and contract versions. The research dossier is unchanged (ReportView).
 */
export function LiveReport({ live }: { live: Exclude<LiveCompare, { state: "off" }> }) {
  if (live.state !== "ready") {
    const text = live.state === "loading" ? null : live.state === "error" ? `The run record could not be read: ${live.message}` : "The selected window is not one of this run's refined windows.";
    return (
      <div className="mx-auto max-w-[1040px] px-4 pb-24 pt-10 md:px-8 md:pt-16">
        <div className="frame relative border border-line bg-surface px-4 py-8 md:px-6">
          <h1 data-stage-heading="report" tabIndex={-1} className={cx(DISPLAY, "text-[30px] leading-[0.95] text-ink outline-none! md:text-[40px]")}>Live discovery dossier</h1>
          <div className="mt-4 text-body text-muted">{text ?? <Spinner label="Reading the run record" />}</div>
        </div>
      </div>
    );
  }
  return <LiveDossier pair={live.pair} />;
}

function LiveDossier({ pair }: { pair: LivePair }) {
  const { run, r, c } = pair;
  const missions = useMissions();
  const mission = missions.data?.find((m) => m.id === r.mission || m.id === useApp.getState().discovery?.request.mission) ?? null;
  const verdict = liveVerdict(pair);
  const versions = liveVersions(r);
  const generatedAt = useMemo(() => new Date().toISOString(), [run.run_id, c.id]);
  const stamp = generatedStamp(generatedAt);
  const sections: Sec[] = useMemo(() => LIVE_SECTIONS.map((s, i) => ({ id: s.id as SectionId, index: String(i + 1).padStart(2, "0"), title: s.title })), []);
  const root = useRef<HTMLDivElement>(null);
  const [active, jump] = useDossierNav(sections, root);
  const marsName = liveMarsName(r);

  // Plates: both 50 km windows, identical frame styling (sizes from the payload).
  const km = r.window_km;
  const marsFrame: PlateFrame = { nsKm: r.target.window_km, ewKm: r.target.window_km, label: `${r.target.window_km} km target window` };
  const earthFrame: PlateFrame = { nsKm: km, ewKm: km, label: `${km} km discovery window` };
  const marsSnap = useSnapshot("mars", r.target.lat, r.target.lon);
  const earthSnap = useSnapshot("earth", c.lat, c.lon);
  const held = marsSnap.status === "loading" || earthSnap.status === "loading";
  const [aspect] = useState(stageAspect);
  const diskKm = useMemo(() => ({
    mars: Math.round(wholeDiskHeightKm(bodyFor("mars"), aspect) / 100) * 100,
    earth: Math.round(wholeDiskHeightKm(bodyFor("earth"), aspect) / 100) * 100,
  }), [aspect]);
  const marsDisk = useSnapshot("mars", r.target.lat, r.target.lon, true, diskKm.mars, null);
  const earthDisk = useSnapshot("earth", c.lat, c.lon, true, diskKm.earth, null);
  // Plate C: the run's own GLO-90 window grid, only when the server holds it; D: the Mars zone grid.
  const earthRelief = useWindowRelief({ lat: c.lat, lon: c.lon });
  const zone = pair.zone;
  const marsRelief = useMarsRelief(earthRelief.data ? zone : null);

  const Section = ({ id, aside, children }: { id: string; aside?: ReactNode; children: ReactNode }) => {
    const s = sections.find((x) => x.id === id)!;
    return <DossierSection id={id} index={s.index} title={s.title} aside={aside}>{children}</DossierSection>;
  };

  const sel = r.shortlist_selection as Record<string, unknown> | undefined;
  const cov = r.coarse_index_coverage as Record<string, unknown> | undefined;
  const sq = r.source_quality as Record<string, unknown> | undefined;
  const op = r.operator as Record<string, unknown>;
  const gate = liveGate(r);
  const am = asMeasured(c);
  const range = rotationRange(c);
  const members = westToEast(r.candidates.filter((x) => r.decision.members.includes(x.id)));
  const named = r.decision.type === "named_leader" || r.decision.type === "tied_set";
  const n = (x: number | null) => (x === null ? "—" : x.toLocaleString("en-US"));

  return (
    <div ref={root}
      className="dossier mx-auto max-w-[1320px] px-4 pb-28 pt-6 md:px-8 md:pt-10 xl:grid xl:grid-cols-[164px_minmax(0,1040px)] xl:justify-center xl:gap-x-14 print:block print:max-w-none print:px-0 print:pb-0 print:pt-0">
      <style>{dossierPrintCss(run.run_id)}</style>
      <aside className="no-print hidden xl:block">
        <div className="sticky top-12 pt-1"><DossierIndex sections={sections} active={active} onJump={jump} /></div>
      </aside>

      <article className="min-w-0">
        <header className="frame print-keep relative border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 md:px-6">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-ink" />
            <span className="kicker !text-ink">TerraTwin · Mission dossier</span>
            <span className="kicker sm:border-l sm:border-line-strong sm:pl-3">Live discovery · run <span className="num">{run.run_id}</span></span>
            <button type="button" onClick={() => window.print()} className="no-print hit label-caps ml-auto px-2 py-1 !text-[11px] text-muted hover:text-ink">Print</button>
          </div>
          <h1 data-stage-heading="report" tabIndex={-1}
            className="grid gap-y-4 px-4 pb-7 pt-6 outline-none! md:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] md:gap-x-2 md:px-6 md:pb-9 md:pt-8 print:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]">
            <Designation tone="mars" kicker={`Mars · ${liveMarsKind(pair)}`} name={marsName} coord={fmtCoord(r.target.lat, r.target.lon)} coordSpoken={!zone} />
            <span aria-hidden className="flex items-center md:justify-center md:pt-[30px]">
              <svg width="76" height="10" viewBox="0 0 76 10" className="hidden text-faint md:block print:block print:w-[60px]">
                <path d="M1 5h74M5 1L1 5l4 4M71 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </span>
            <span className="sr-only"> compared with </span>
            <Designation tone="earth" kicker={verdict.kind === "tie_member" ? `Earth · ${verdict.short}` : "Earth · Discovery window"} name="Discovery window" coord={fmtCoord(c.lat, c.lon)} coordSpoken />
          </h1>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line px-4 py-3 md:px-6" role="note">
            <span className="flex items-center gap-2"><StatusMark state="caution" /><span className="kicker !text-warn">Status</span></span>
            <span className="text-label text-warn">Candidate identification — not validation of a new analog</span>
          </p>
          <dl className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            <Field k="Mission profile"><span className="text-ink">{mission?.label ?? r.mission.replace(/_/g, " ")}</span></Field>
            <Field k="Analysis units" className="border-t sm:border-l sm:border-t-0">
              <span className="block text-ink"><span className="num">{km}</span> km discovery windows</span>
              <span className="mt-1 block text-caption text-faint"><span className="num">{r.number_of_windows_refined}</span> windows refined</span>
            </Field>
            <Field k="Generated" className="border-t lg:border-l lg:border-t-0">
              {stamp ? <><span className="num block text-ink">{stamp.date}</span><span className="block text-ink"><span className="num">{stamp.time}</span> UTC</span></> : <span className="num text-faint">—</span>}
            </Field>
            <Field k="Run" className="border-t sm:border-l lg:border-t-0">
              <span className="num block truncate text-ink">{run.run_id}</span>
              <span className="mt-1 block text-caption text-faint">Method <span className="num whitespace-nowrap">{versions.method ?? "—"}</span></span>
            </Field>
          </dl>
        </header>

        <Section id="plates" aside={earthRelief.data ? "NASA imagery · terrain relief · visualization only" : "NASA imagery · visualization only"}>
          <div className="grid gap-8 md:grid-cols-2 md:gap-7 print:grid-cols-2 print:gap-5">
            <LocationPlate planet="mars" plate="A" lat={r.target.lat} lon={r.target.lon} frame={marsFrame} kicker={`Mars · ${liveMarsKind(pair)}`}
              name={marsName} imagery="NASA Mars Trek imagery" snapshot={marsSnap} held={held} aspect={aspect} disk={{ snapshot: marsDisk, heightKm: diskKm.mars }} />
            <LocationPlate planet="earth" plate="B" lat={c.lat} lon={c.lon} frame={earthFrame} kicker="Earth · Discovery window" name="Discovery window"
              imagery="NASA GIBS imagery" snapshot={earthSnap} held={held} aspect={aspect} disk={{ snapshot: earthDisk, heightKm: diskKm.earth }} />
          </div>
          <p className="mt-5 max-w-[86ch] text-caption text-faint">
            Plates A and B are rendered from the planet globes at <span className="num">{PLATE_HEIGHT_KM}</span> km, nadir, north up. Frames and scale bars use the scale at the plate centre and are approximate.
            Lighting is set for legibility, not the Sun&apos;s position. Imagery is never used in any measurement.
          </p>
          {earthRelief.data ? (
            <div className="mt-10 print:mt-7">
              <ReliefPlate plate="C" planet="earth" kicker="Earth · Terrain relief" name="Discovery window" q={earthRelief} unit="discovery window" />
              {marsRelief.data && <div className="mt-10 print:mt-7"><ReliefPlate plate="D" planet="mars" kicker="Mars · Terrain relief" name={zoneName(marsRelief.data.id)} q={marsRelief} /></div>}
            </div>
          ) : earthRelief.isError ? (
            <p className="mt-4 text-caption text-faint">No terrain relief plate: this window's elevation grid is not cached on this server.</p>
          ) : null}
        </Section>

        <Section id="figures" aside="Decision · similarity · measures · validation">
          <ReadoutGrid cols={3} items={[
            { key: "decision", label: "Decision", value: <span className="inline-flex items-start gap-2"><span className="flex h-[1lh] items-center"><OutcomeMark kind={verdict.mark} /></span>{verdict.headline}</span>, note: verdict.detail },
            { key: "s", label: "Similarity S", value: <SFigure value={c.S} missing="no score" className="text-[22px] leading-none text-ink" />, note: <>{liveBasis(pair)} · validated on synthetic twins only</> },
            { key: "coverage", label: "Coverage", value: <span className="num">{pct(c.coverage)}</span>, note: liveMeasures(c) ?? undefined },
            { key: "rot", label: "Range over orientations", value: range ? <span className="num">{range[0].toFixed(3)} – {range[1].toFixed(3)}</span> : "—", note: "Four orientations of the Earth window relative to MOLA tracks" },
            { key: "am", label: "Without observation matching", value: <SFigure value={am.S} missing="not in the record" className="text-ink" />, note: am.label ?? undefined },
            { key: "gate", label: "Land cover", value: c.landcover?.gate ? c.landcover.gate.replace(/_/g, " ") : "—", note: c.landcover ? `${pct(c.landcover.frac_bare_like ?? null)} bare-like · ${pct(c.landcover.frac_vegetated ?? null)} vegetated` : undefined },
          ]} />
          <p className="mt-3 text-caption text-muted">{G5.validation}.</p>
        </Section>

        <Section id="decision" aside={`Run ${run.run_id}`}>
          <p className="max-w-[72ch] text-body text-ink">{verdict.headline}. <span className="text-muted">{verdict.detail}</span></p>
          {named && members.length > 0 && (
            <div className="mt-4">
              <div className="kicker mb-2">{r.decision.type === "tied_set" ? "Tied windows · listed west to east" : "Named window"}</div>
              <ul className="border-y border-line">
                {members.map((m) => (
                  <li key={m.id} className={cx("flex items-baseline justify-between gap-4 border-t border-line/70 py-1.5 first:border-t-0", m.id === c.id ? "text-ink" : "text-muted")}>
                    <span className="num text-num-sm">{cellLabel(m.lat, m.lon)}{m.id === c.id && <span className="ml-3 font-sans text-caption text-earth">this dossier</span>}</span>
                    <SFigure value={m.S} missing="no score" className="text-num-sm" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section id="scope" aside="Run record">
          <dl className="grid max-w-[86ch] gap-y-2 text-caption">
            <ScopeRow k="Pool">{scopeText(r.candidate_pool_scope)}</ScopeRow>
            <ScopeRow k="Refined"><span className="num">{r.number_of_windows_refined}</span> windows of <span className="num">{km}</span> km, compared as MOLA would observe them</ScopeRow>
            {sel && <ScopeRow k="Shortlist">{strAt(sel, "source") ?? "—"} · top <span className="num">{n(numAt(sel, "tier1_top_n_considered"))}</span> screening cells considered · <span className="num">{n(numAt(sel, "n_selected"))}</span> of <span className="num">{n(numAt(sel, "n_requested"))}</span> selected</ScopeRow>}
            {cov && <ScopeRow k="Screen"><span className="num">{n(numAt(cov, "n_cells_scored"))}</span> of <span className="num">{n(numAt(cov, "n_cells_total"))}</span> cells scored{strAt(cov, "statement") ? ` · ${strAt(cov, "statement")}` : ""}</ScopeRow>}
            {gate && <ScopeRow k="Land cover">bare-like ≥ <span className="num">{pct(gate.bare_min)}</span>, vegetated ≤ <span className="num">{pct(gate.veg_max)}</span>{gate.mode ? ` · ${gate.mode}` : ""}{gate.status ? ` · thresholds: ${gate.status}` : ""}</ScopeRow>}
            {liveOrigin(c) && <ScopeRow k="This window">{liveOrigin(c)}</ScopeRow>}
          </dl>
        </Section>

        <Section id="terrain" aside="Earth as MOLA would observe it · as measured for reference">
          <DescriptorTable pair={pair} />
        </Section>

        <Section id="differences" aside="No Earth site reproduces these"><Differences /></Section>

        <Section id="limitations" aside="Verbatim from the run">
          <ul className="max-w-[86ch] space-y-1.5 text-body text-muted">
            {r.disclaimers.map((d) => <li key={d}>{disclaimerText(d)}.</li>)}
            {(r.limitations ?? []).map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="mt-4 max-w-[72ch] text-body text-muted">No claim of a previously unrecognised analog is made. The run payload does not say whether this window is a documented analog; novelty requires literature verification.</p>
        </Section>

        <Section id="provenance" aside="Run, versions and sources">
          <dl className="grid max-w-[86ch] gap-y-2 text-caption">
            <ScopeRow k="Run"><span className="num">{run.run_id}</span>{typeof run.seconds === "number" ? <> · <span className="num">{run.seconds.toFixed(0)}</span> s</> : null}</ScopeRow>
            <ScopeRow k="Method"><span className="num">{versions.method ?? "—"}</span></ScopeRow>
            <ScopeRow k="Processing"><span className="num">{versions.processing ?? "—"}</span></ScopeRow>
            <ScopeRow k="Contract"><span className="num">{versions.contract ?? "—"}</span></ScopeRow>
            <ScopeRow k="Operator">{strAt(op, "version") ?? "—"}{strAt(op, "status_note") ? ` · ${strAt(op, "status_note")}` : ""}</ScopeRow>
            <ScopeRow k="Mars">MOLA target window; observed fraction <span className="num">{pct(numAt(r.target as Record<string, unknown>, "observed_fraction_native"))}</span></ScopeRow>
            <ScopeRow k="Earth">{strAt(sq, "dem_source") ?? "—"} · land cover {strAt(sq, "landcover_source") ?? "—"}</ScopeRow>
          </dl>
        </Section>

        <Section id="references"><References /></Section>

        <footer className="mt-16 border-t border-line-strong pt-4 print:mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <span className="flex items-center gap-2.5"><span aria-hidden className="h-1.5 w-1.5 bg-ink" /><span className="kicker !text-muted">End of dossier</span></span>
            <span className="text-caption text-faint">TerraTwin · AstroSUST · NASA Space Apps 2026</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-caption text-faint">
            <span>Run <span className="num">{run.run_id}</span></span>
            <span>Method <span className="num">{versions.method ?? "—"}</span></span>
            <span>Contract <span className="num">{versions.contract ?? "—"}</span></span>
            {stamp && <span>Generated <span className="num">{stamp.date} {stamp.time}</span> UTC</span>}
          </div>
        </footer>
      </article>
    </div>
  );
}

function ScopeRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 border-t border-line pt-2 first:border-t-0 first:pt-0">
      <dt className="kicker pt-px">{k}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}
