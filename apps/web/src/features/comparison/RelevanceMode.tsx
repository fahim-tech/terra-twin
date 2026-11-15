import { cx, pct } from "../../components/ui";
import { type CandidateView, T1_MEASURES, T2_MEASURES } from "../analogs/candidates";
import { PlanetMark, SectionRule, StatusMark } from "./marks";
import { DIFFERENCES_SOURCE, PLANETARY_DIFFERENCES } from "./science";

export type DimensionStatus = "evaluated" | "partial" | "not_evaluated";

export const DIMENSIONS = (c: CandidateView) => [
  { name: "Terrain and geomorphology", status: "evaluated" as DimensionStatus, detail: c.tier === 2 ? `${T2_MEASURES} multiscale terrain descriptors, compared with Earth as MOLA would observe it.` : `${T1_MEASURES} global-screen terrain descriptors on ${c.t1?.footprint.cell_km_ns ? `${Math.round(c.t1.footprint.cell_km_ns)} km ` : ""}screening cells, Earth as measured.` },
  { name: "Engineering and operations", status: (c.t2?.landcover?.available ? "partial" : "not_evaluated") as DimensionStatus, detail: c.t2?.landcover?.available ? `Exposed-ground check only: ${pct(c.t2.landcover.frac_bare_like ?? null)} bare-like, ${pct(c.t2.landcover.frac_vegetated ?? null)} vegetated (ESA WorldCover 2021). Trafficability, access and permits not assessed.` : "No surface-cover or access data for this candidate." },
  { name: "Geological materials", status: "not_evaluated" as DimensionStatus, detail: "No lithology or mineralogy dataset is connected for either planet." },
  { name: "Surface processes", status: "not_evaluated" as DimensionStatus, detail: "Process relationships need geological evidence; terrain geometry alone cannot establish them." },
  { name: "Environmental conditions", status: "not_evaluated" as DimensionStatus, detail: "Climate and thermal datasets are not comparable or not ingested (e.g. MODIS LST is not TES thermal inertia)." },
  { name: "Resources", status: "not_evaluated" as DimensionStatus, detail: "Ice and mineral resource layers are not connected." },
];

/** Status words; the shared status marks (filled, half filled, outlined) carry the same three states on screen. */
export const STATUS_COPY: Record<DimensionStatus, { word: string }> = {
  evaluated: { word: "Evaluated" },
  partial: { word: "Partial" },
  not_evaluated: { word: "Not evaluated" },
};

type LandcoverGate = { bare_min: number; veg_max: number } | null | undefined;

/**
 * Applications are suggestions to be verified; each one says what it rests on. The field-test suggestion
 * needs both halves of the search's own land-cover gate (bare ≥ bare_min and vegetated ≤ veg_max); with no
 * gate in the record, or a missing fraction, it is not offered.
 */
export function applications(c: CandidateView, gate: LandcoverGate): { text: string; basis: string }[] {
  const out = [{ text: "Testing DEM, roughness and hazard-mapping algorithms on terrain with comparable statistics.", basis: "terrain descriptors" }];
  const g = c.t2?.landcover;
  const bare = g?.frac_bare_like ?? null;
  const veg = g?.frac_vegetated ?? null;
  if (gate && g?.available && g.gate !== "fail" && bare !== null && veg !== null && bare >= gate.bare_min && veg <= gate.veg_max) {
    out.push({ text: `Screening as a field-test site (exposed ground ${pct(g.frac_bare_like ?? null)}). Access, safety and permits not assessed.`, basis: "ESA WorldCover 2021" });
  }
  return out;
}

export function RelevanceMode({ c, gate }: { c: CandidateView; gate: LandcoverGate }) {
  const dims = DIMENSIONS(c);
  return (
    <div className="grid gap-x-10 gap-y-6 @min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section aria-label="Dimensions of analogy">
        <SectionRule title="Dimensions of analogy" as="h4" className="mb-1" />
        <ul>
          {dims.map((d) => {
            const s = STATUS_COPY[d.status];
            return (
              <li key={d.name} className="grid grid-cols-[124px_minmax(0,1fr)] gap-x-4 border-t border-line py-2.5 first:border-t-0">
                {/* Partial is a limit of the evaluation, not a caution: ink like evaluated, the half-filled mark says it. */}
                <span className={cx("flex items-center gap-2 self-start pt-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.1em]", d.status === "not_evaluated" ? "text-faint" : "text-ink")}>
                  <StatusMark status={d.status} />{s.word}
                </span>
                <span>
                  <span className="block text-label text-ink">{d.name}</span>
                  <span className="mt-0.5 block text-caption text-muted">{d.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 border-t border-line pt-2.5 text-caption text-faint">An Earth site need not match Mars in every way. TerraTwin measures terrain geometry and shows the other dimensions so the gaps stay visible.</p>
      </section>

      <div className="space-y-6">
        <section aria-label="Potential applications">
          <SectionRule title="Potential applications" as="h4" aside="to be verified" className="mb-2" />
          <ul className="space-y-1.5">
            {applications(c, gate).map((a) => (
              <li key={a.text} className="relative pl-4 text-caption text-muted before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:border before:border-faint">
                <span className="text-ink">{a.text}</span> <span className="text-faint">Basis: {a.basis}.</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Planetary differences">
          <SectionRule title="Planetary differences" as="h4" aside="no Earth site reproduces these" className="mb-1.5" />
          <table className="w-full text-left text-caption">
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="kicker py-1.5 pr-3">Condition</th>
                <th scope="col" className="kicker py-1.5 pr-3"><span className="inline-flex items-center gap-1.5"><PlanetMark planet="mars" />Mars</span></th>
                <th scope="col" className="kicker py-1.5"><span className="inline-flex items-center gap-1.5"><PlanetMark planet="earth" />Earth</span></th>
              </tr>
            </thead>
            <tbody>
              {PLANETARY_DIFFERENCES.map((d) => (
                <tr key={d.factor} className="border-t border-line align-top first:border-t-0" title={d.note}>
                  <td className="py-1.5 pr-3 text-label text-ink">{d.factor}</td>
                  <td className="py-1.5 pr-3 text-muted">{d.mars}</td>
                  <td className="py-1.5 text-muted">{d.earth}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 border-t border-line pt-2 text-caption text-faint">Source: {DIFFERENCES_SOURCE}. Shown as limitations, never folded into the score.</p>
        </section>
      </div>
    </div>
  );
}
