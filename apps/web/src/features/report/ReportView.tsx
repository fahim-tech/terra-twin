import { useMemo, useRef, useState, type ReactNode } from "react";
import { Term } from "../../components/primitives";
import { Button, cx } from "../../components/ui";
import { reliefWindowId } from "../../components/relief";
import { useEarthPool, useEvidence, useMissions } from "../../services/api";
import { zoneName } from "../../lib/glossary";
import { useApp } from "../../store/app";
import { resultsAreStale, searchTarget, type SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch } from "../../types/contracts";
import { screenCellKm } from "../analogs/candidates";
import { DossierHeader } from "./DossierHeader";
import { DossierIndex, useDossierNav } from "./DossierIndex";
import { KeyFigures } from "./KeyFigures";
import { bodyFor, LocationPlate, PLATE_HEIGHT_KM, type PlateFrame, stageAspect, useSnapshot } from "./LocationPlate";
import { candidateRole, type DossierSection as Sec, dossierSections, generatedStamp, resolveCandidate, type ReportCandidate, type SectionId } from "./model";
import { DISPLAY, DossierSection } from "./parts";
import { wholeDiskHeightKm } from "./plateGeometry";
import { dossierPrintCss } from "./print";
import { ReliefSnapshotSlot } from "./ReliefSlot";
import { LiveReport } from "./LiveReport";
import { useLiveCompare } from "../comparison/useLive";
import { FactorsTable } from "../factors/FactorsPanel";
import {
  Differences, Dimensions, Limitations, LIMITATIONS_ASIDE, NoCandidatePlate, Provenance, References, ResearchSummary, ScreenSummary, TerrainComparison,
  terrainAside,
} from "./sections";

export default function ReportView() {
  const live = useLiveCompare();
  // A live discovery window when Compare follows one (the Live discovery tab's selection); else the research dossier.
  return live.state === "off" ? <ResearchReport /> : <LiveReport live={live} />;
}

function ResearchReport() {
  const search = useApp((s) => s.search);
  const candidateId = useApp((s) => s.candidateId);
  const selection = useApp((s) => s.selection);
  const target = useMemo(() => searchTarget(search), [search]);
  const c = useMemo(() => resolveCandidate(search, candidateId), [search, candidateId]);

  if (!search || !target) return <NoReport />;
  return <Dossier search={search} target={target} c={c} stale={resultsAreStale(search, selection)} liveLabel={selection?.label ?? null} />;
}

function NoReport() {
  const go = useApp((s) => s.go);
  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-24 pt-10 md:px-8 md:pt-16">
      <div className="frame relative border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-6">
          <span aria-hidden className="h-1.5 w-1.5 bg-ink" />
          <span className="kicker !text-ink">TerraTwin · Mission dossier</span>
        </div>
        <div className="px-4 py-8 md:px-6 md:py-10">
          <h1 data-stage-heading="report" tabIndex={-1} className={cx(DISPLAY, "text-[34px] leading-[0.95] tracking-[0.02em] text-ink outline-none! md:text-[50px]")}>No report yet</h1>
          <p className="mt-4 max-w-[52ch] text-lead text-muted">A dossier is built from an Earth analog search. Choose a research zone on Mars and run Find Earth Analogs; the report then describes that search.</p>
          <Button variant="primary-mars" className="mt-7" onClick={() => go("mars")}>Go to the Mars explorer →</Button>
        </div>
      </div>
    </div>
  );
}

/** The plates note on the whole-disk locators actually shown (none, one or both), with their real camera heights. */
function LocatorNote({ mars, earth }: { mars: number | null; earth: number | null }) {
  const parts = [
    mars !== null ? <><span className="num">{mars.toLocaleString("en-US")}</span> km (Mars)</> : null,
    earth !== null ? <><span className="num">{earth.toLocaleString("en-US")}</span> km (Earth)</> : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <>
      {parts.length > 1 ? "Whole-disk locators look" : "The whole-disk locator looks"} straight down on the plate centre from {parts[0]}
      {parts[1] ? <> and {parts[1]}</> : null}; the small square is the plate.
    </>
  );
}

/** A numbered dossier section; its number and title come from the section list, so numbering never has gaps. */
function Section({ of, id, aside, children }: { of: Sec[]; id: SectionId; aside?: ReactNode; children: ReactNode }) {
  const s = of.find((x) => x.id === id);
  if (!s) return null;
  return <DossierSection id={id} index={s.index} title={s.title} aside={aside}>{children}</DossierSection>;
}

function Dossier({ search, target, c, stale, liveLabel }: { search: AnalogSearch; target: SearchTarget; c: ReportCandidate | null; stale: boolean; liveLabel: string | null }) {
  const missions = useMissions();
  const evidence = useEvidence();
  // Plate C (terrain relief) exists only for a candidate that is a research-pool window.
  const hasRelief = !!reliefWindowId(c, useEarthPool().data);
  const mission = missions.data?.find((m) => m.id === target.mission) ?? null;
  // Generation time from the real clock: when this dossier (search + candidate) was put together.
  const generatedAt = useMemo(() => new Date().toISOString(), [search.id, c?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const t2 = search.tier2;
  const role = c ? candidateRole(search, c) : null;
  const researchRan = t2.operator.status === "ok";
  // The research window has its own centre; draw its frame there, not at the requested point.
  const marsAtWindow = c?.tier !== 1 && researchRan;
  const marsLat = marsAtWindow ? t2.target.lat : target.lat;
  const marsLon = marsAtWindow ? t2.target.lon : target.lon;
  const windowOffset = marsAtWindow && (Math.abs(t2.target.lat - target.lat) > 1e-3 || Math.abs(t2.target.lon - target.lon) > 1e-3);

  // Plates: the Mars window at the search target; the Earth unit at the candidate. Identical frame styling.
  const cellKm = screenCellKm(search);
  const marsFrame: PlateFrame = c?.tier === 1 && cellKm !== null
    ? { nsKm: cellKm, ewKm: cellKm, label: `${cellKm} km scale reference (descriptors are the zone median)` }
    : researchRan
      ? { nsKm: t2.target.window_km, ewKm: t2.target.window_km, label: `${t2.target.window_km} km research window${windowOffset ? " · centred on the research window, not the requested point" : ""}` }
      : { nsKm: target.footprintKm, ewKm: target.footprintKm, label: `${target.footprintKm} km requested footprint` };
  const earthFrame: PlateFrame | null = !c ? null : c.tier === 1
    ? { nsKm: c.t1!.footprint.cell_km_ns, ewKm: c.t1!.footprint.cell_km_ew, label: cellKm !== null ? `${cellKm} km screening cell` : "Screening cell" }
    : { nsKm: c.t2!.window_km, ewKm: c.t2!.window_km, label: `${c.t2!.window_km} km research window` };
  // Both plates are revealed together (each still falls back on its own after its timeout).
  const marsSnap = useSnapshot("mars", marsLat, marsLon);
  const earthSnap = useSnapshot("earth", c?.lat ?? 0, c?.lon ?? 0, !!(c && earthFrame));
  const platesHeld = marsSnap.status === "loading" || (!!(c && earthFrame) && earthSnap.status === "loading");
  // Whole-disk locators: the same globes from far enough out to show the planet whole, framed for the canvas
  // shape (read once). Asked for after the plates, so on each globe they are captured after the plate.
  const [aspect] = useState(stageAspect);
  const diskKm = useMemo(() => ({
    mars: Math.round(wholeDiskHeightKm(bodyFor("mars"), aspect) / 100) * 100,
    earth: Math.round(wholeDiskHeightKm(bodyFor("earth"), aspect) / 100) * 100,
  }), [aspect]);
  const marsDisk = useSnapshot("mars", marsLat, marsLon, true, diskKm.mars, null);
  const earthDisk = useSnapshot("earth", c?.lat ?? 0, c?.lon ?? 0, !!(c && earthFrame), diskKm.earth, null);

  const sections = useMemo(() => dossierSections(search, c), [search, c]);
  const root = useRef<HTMLDivElement>(null);
  const [active, jump] = useDossierNav(sections, root);
  const stamp = generatedStamp(generatedAt);
  const researchVersion = (t2 as { method_version?: string }).method_version ?? (t2.operator as { version?: string }).version ?? null;

  return (
    <div ref={root}
      className="dossier mx-auto max-w-[1320px] px-4 pb-28 pt-6 md:px-8 md:pt-10 xl:grid xl:grid-cols-[164px_minmax(0,1040px)] xl:justify-center xl:gap-x-14 print:block print:max-w-none print:px-0 print:pb-0 print:pt-0">
      <style>{dossierPrintCss(search.id)}</style>
      <aside className="no-print hidden xl:block">
        <div className="sticky top-12 pt-1">
          <DossierIndex sections={sections} active={active} onJump={jump} />
        </div>
      </aside>

      <article className="min-w-0">
        <DossierHeader search={search} target={target} c={c} mission={mission} generatedAt={generatedAt} stale={stale} liveLabel={liveLabel} onProvenance={() => jump("provenance")} />

        <Section of={sections} id="plates" aside={hasRelief ? "NASA imagery · terrain relief · visualization only" : "NASA imagery · visualization only"}>
          <div className="grid gap-8 md:grid-cols-2 md:gap-7 print:grid-cols-2 print:gap-5">
            <LocationPlate planet="mars" plate="A" lat={marsLat} lon={marsLon} frame={marsFrame}
              kicker={target.siteId ? "Mars · Research zone" : "Mars · Search target"} name={target.siteId ? zoneName(target.siteId) : "Search target"}
              imagery="NASA Mars Trek imagery" snapshot={marsSnap} held={platesHeld} aspect={aspect}
              disk={{ snapshot: marsDisk, heightKm: diskKm.mars }} />
            {c && earthFrame ? (
              <LocationPlate planet="earth" plate="B" lat={c.lat} lon={c.lon} frame={earthFrame}
                kicker={c.tier === 1 ? "Earth · Screening cell" : role === "tie_member" ? "Earth · Tie member" : "Earth · Research window"}
                name={c.tier === 1 && !c.t1?.known_analog.name ? "Screening cell" : c.label} imagery="NASA GIBS imagery" snapshot={earthSnap} held={platesHeld}
                aspect={aspect} disk={{ snapshot: earthDisk, heightKm: diskKm.earth }} />
            ) : (
              <NoCandidatePlate hasCandidates={search.tier2.candidates.some((x) => x.lat !== null && x.lon !== null) || (search.tier1?.candidates.length ?? 0) > 0} screenRan={!!search.tier1} decision={t2.decision.type} />
            )}
          </div>
          <p className="mt-5 max-w-[86ch] text-caption text-faint">
            {c && earthFrame ? "Plates A and B are rendered" : "Plate A is rendered"} from the planet globes at <span className="num">{PLATE_HEIGHT_KM}</span> km, nadir, north up. Frames and scale bars use the scale at the plate
            centre and are approximate; neatline ticks mark where parallels and meridians cross the plate edge (planetocentric on Mars, geodetic WGS84 on Earth).
            {" "}<LocatorNote mars={marsDisk.status !== "failed" ? diskKm.mars : null} earth={c && earthFrame && earthDisk.status !== "failed" ? diskKm.earth : null} />
            {" "}Lighting is set for legibility, not the Sun&apos;s position. Imagery is never used in any measurement.
          </p>
          {/* Plate C: the research window's terrain relief, a still rendered from its own elevation grid (none for a screening cell). */}
          <ReliefSnapshotSlot search={search} candidate={c} />
        </Section>

        <Section of={sections} id="figures" aside="Decision · similarity · measures · validation">
          <KeyFigures search={search} c={c} />
        </Section>

        <Section of={sections} id="research" aside={<>Earth as MOLA would observe it · <Term k="researchComparison">method</Term></>}>
          <ResearchSummary search={search} c={c} />
        </Section>

        {search.tier1 && (
          <Section of={sections} id="screen" aside={<>Earth as measured · <Term k="globalScreen">method</Term></>}>
            <ScreenSummary search={search} c={c} />
          </Section>
        )}

        {c && (
          <Section of={sections} id="terrain" aside={terrainAside(search)}>
            <TerrainComparison search={search} c={c} />
          </Section>
        )}

        {c && (
          <Section of={sections} id="dimensions" aside="What this analysis can and cannot speak to">
            <Dimensions c={c} cellKm={cellKm} />
          </Section>
        )}

        <Section of={sections} id="context" aside="Characterization only · never in the score">
          <FactorsTable lat={search.mars.coordinate.lat} lon={search.mars.coordinate.lon} />
        </Section>

        <Section of={sections} id="differences" aside="No Earth site reproduces these">
          <Differences />
        </Section>

        <Section of={sections} id="provenance" aside="Data, operator and coverage">
          <Provenance search={search} />
        </Section>

        <Section of={sections} id="limitations" aside={LIMITATIONS_ASIDE}>
          <Limitations search={search} evidence={evidence.data} />
        </Section>

        <Section of={sections} id="claims" aside="Status">
          <p className="max-w-[72ch] text-body text-muted">No claim of a previously unrecognised analog is made. Novelty requires literature verification by the research team; absence from the reference set is not evidence of novelty.</p>
        </Section>

        <Section of={sections} id="references">
          <References />
        </Section>

        <footer className="mt-16 border-t border-line-strong pt-4 print:mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <span className="flex items-center gap-2.5"><span aria-hidden className="h-1.5 w-1.5 bg-ink" /><span className="kicker !text-muted">End of dossier</span></span>
            <span className="text-caption text-faint">TerraTwin · AstroSUST · NASA Space Apps 2026</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-caption text-faint">
            <span>Research method <span className="num">{researchVersion ?? "—"}</span></span>
            {search.tier1 && <span>Screen <span className="num">{search.tier1.method_version}</span></span>}
            <span>Analysis <span className="num">{search.id}</span></span>
            {stamp && <span>Generated <span className="num">{stamp.date} {stamp.time}</span> UTC</span>}
          </div>
        </footer>
      </article>
    </div>
  );
}
