import { Kicker } from "../../components/primitives";
import { cx, pct } from "../../components/ui";
import type { CandidateView } from "../analogs/candidates";
import { DIFFERENCES_SOURCE, PLANETARY_DIFFERENCES } from "./science";

export type DimensionStatus = "evaluated" | "partial" | "not_evaluated";

export const DIMENSIONS = (c: CandidateView) => [
  { name: "Terrain & geomorphology", status: "evaluated" as DimensionStatus, detail: c.tier === 2 ? "8 multiscale terrain descriptors, compared with Earth as MOLA would observe it." : `7 global-screen terrain descriptors on ${c.t1?.footprint.cell_km_ns ? `${Math.round(c.t1.footprint.cell_km_ns)} km ` : ""}screening cells (Earth as measured).` },
  { name: "Engineering & operations", status: (c.t2?.landcover?.available ? "partial" : "not_evaluated") as DimensionStatus, detail: c.t2?.landcover?.available ? `Exposed-ground check only: ${pct(c.t2.landcover.frac_bare_like ?? null)} bare-like, ${pct(c.t2.landcover.frac_vegetated ?? null)} vegetated (ESA WorldCover 2021). Trafficability, access and permits not assessed.` : "No surface-cover or access data for this candidate." },
  { name: "Geological materials", status: "not_evaluated" as DimensionStatus, detail: "No lithology or mineralogy dataset is connected for either planet." },
  { name: "Surface processes", status: "not_evaluated" as DimensionStatus, detail: "Process relationships need geological evidence; terrain geometry alone cannot establish them." },
  { name: "Environmental conditions", status: "not_evaluated" as DimensionStatus, detail: "Climate and thermal datasets are not comparable or not ingested (e.g. MODIS LST ≠ TES thermal inertia)." },
  { name: "Resources", status: "not_evaluated" as DimensionStatus, detail: "Ice and mineral resource layers are not connected." },
];

export const STATUS_COPY: Record<DimensionStatus, { glyph: string; word: string }> = {
  evaluated: { glyph: "●", word: "Evaluated" },
  partial: { glyph: "◐", word: "Partial" },
  not_evaluated: { glyph: "○", word: "Not evaluated" },
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
  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section aria-label="Dimensions of analogy">
        <Kicker className="mb-1.5">Dimensions of analogy</Kicker>
        <ul>
          {DIMENSIONS(c).map((d) => {
            const s = STATUS_COPY[d.status];
            return (
              <li key={d.name} className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 border-t border-line/60 py-2 first:border-t-0">
                <span className={cx("text-caption", d.status === "evaluated" ? "text-ink" : d.status === "partial" ? "text-warn" : "text-faint")}>
                  <span aria-hidden>{s.glyph}</span> {s.word}
                </span>
                <span>
                  <span className="block text-label text-ink">{d.name}</span>
                  <span className="block text-caption text-muted">{d.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-caption text-faint">An Earth site need not match Mars in every way. TerraTwin measures terrain geometry and shows the other dimensions so the gaps stay visible.</p>
      </section>

      <div className="space-y-5">
        <section aria-label="Potential applications">
          <Kicker className="mb-1.5">Potential applications · to be verified</Kicker>
          <ul className="space-y-1.5">
            {applications(c, gate).map((a) => (
              <li key={a.text} className="text-caption text-muted"><span className="text-ink">{a.text}</span> <span className="text-faint">Basis: {a.basis}.</span></li>
            ))}
          </ul>
        </section>
        <section aria-label="Planetary differences">
          <Kicker className="mb-1.5">Planetary differences · no Earth site reproduces these</Kicker>
          <table className="w-full text-left text-caption">
            <thead className="text-faint">
              <tr><th scope="col" className="py-1 font-normal">Condition</th><th scope="col" className="py-1 font-normal"><span className="text-mars" aria-hidden>● </span>Mars</th><th scope="col" className="py-1 font-normal"><span className="text-earth" aria-hidden>● </span>Earth</th></tr>
            </thead>
            <tbody>
              {PLANETARY_DIFFERENCES.map((d) => (
                <tr key={d.factor} className="border-t border-line/60 align-top" title={d.note}>
                  <td className="py-1 pr-3 text-ink">{d.factor}</td>
                  <td className="py-1 pr-3 text-muted">{d.mars}</td>
                  <td className="py-1 text-muted">{d.earth}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-caption text-faint">Source: {DIFFERENCES_SOURCE}. Shown as limitations, never folded into the score.</p>
        </section>
      </div>
    </div>
  );
}
