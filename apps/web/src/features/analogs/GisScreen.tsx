import { useState } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { SFigure } from "../../components/marks";
import { Term } from "../../components/primitives";
import { cx, Spinner } from "../../components/ui";
import { useGisTier1 } from "../../services/gis";
import { cellLabel, pctText, westToEast } from "./discoveryModel";
import { ReadoutStrip, rowClass, SectionHead, SelectionBar, StatusMark } from "./instruments";
import { sText } from "./readout";

const NEAR_TOL = 0.05;
const PAGE = 12;

type Cell = { region_id: string; rank: number; latitude: number; longitude: number; similarity: number | null; coverage?: number | null; verdict?: string };

/**
 * The GIS tier-1 global screen for any Mars point (useGisTier1): every Earth land cell of the GIS index
 * (25 km, Earth as measured), compared on the tier-1 descriptors. A screen, not a decision: cells within 0.05
 * of the top are not ranked against each other and are listed west to east; the rest keep the screen's rank.
 * Selecting a row flies the Earth globe to the cell.
 */
export function GisScreen({ lat, lon, mission, index }: { lat: number; lon: number; mission: string; index: string }) {
  const q = useGisTier1({ lat, lon, mission });
  const bus = useGlobeBus();
  const [on, setOn] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const t = q.data;
  const head = (
    <SectionHead index={index} className="mt-6" aside={t?.candidates.length}>
      Global screen · GIS index
    </SectionHead>
  );
  if (q.isLoading) return <>{head}<div className="mt-2.5"><Spinner label="Screening Earth land cells" /></div></>;
  if (q.isError || !t) {
    return (
      <>
        {head}
        <p className="mt-2.5 flex items-baseline gap-2 text-caption text-muted">
          <StatusMark state="struck" className="translate-y-[-1px]" />
          The GIS global screen is not available for this point: {(q.error as Error)?.message ?? "no result"}. Nothing is substituted.
        </p>
      </>
    );
  }
  const cells = t.candidates as Cell[];
  const top = t.specificity?.leader_similarity ?? null;
  const near = top === null ? [] : westToEast(cells.filter((c) => c.similarity !== null && c.similarity >= top - NEAR_TOL).map((c) => ({ ...c, lon: c.longitude })));
  const nearIds = new Set(near.map((c) => c.region_id));
  const rest = cells.filter((c) => !nearIds.has(c.region_id));
  const pick = (c: Cell) => {
    setOn(c.region_id);
    bus.send("earth", { t: "flyTo", lat: c.latitude, lon: c.longitude, heightKm: 900 });
  };
  const row = (c: Cell, ranked: boolean) => (
    <li key={c.region_id}>
      <button type="button" aria-pressed={on === c.region_id} onClick={() => pick(c)}
        aria-label={`${ranked ? `Rank ${c.rank}, ` : ""}${cellLabel(c.latitude, c.longitude)}, similarity ${sText(c.similarity)}, coverage ${pctText(c.coverage)}${c.verdict ? `, ${c.verdict}` : ""}`}
        className={rowClass(on === c.region_id, cx("grid items-baseline gap-x-2 py-2 pl-3 pr-3", ranked ? "grid-cols-[2.5rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"))}>
        {on === c.region_id && <SelectionBar layoutId="gis1-selection" />}
        {ranked && <span className="num text-num-sm text-faint">{c.rank}</span>}
        <span className={cx("num truncate text-num-sm", on === c.region_id ? "text-earth" : "text-ink")}>{cellLabel(c.latitude, c.longitude)}</span>
        <SFigure value={c.similarity} className="justify-self-end text-num text-ink" />
      </button>
    </li>
  );
  return (
    <>
      {head}
      <p className="mt-1.5 text-caption text-faint">
        {typeof t.footprint_km === "number" ? <><span className="num">{t.footprint_km}</span> km cells</> : "Screening cells"} · Earth as measured · <Term k="globalScreen">a wide net, not a verdict</Term>
      </p>
      <ReadoutStrip className="mt-2.5" label="GIS global screen summary" cells={[
        { key: "n", label: "Land cells", value: typeof t.n_cells_scored === "number" ? t.n_cells_scored.toLocaleString("en-US") : "—" },
        { key: "top", label: "Top S", value: sText(top) },
        { key: "near", label: "Within 0.05", value: t.specificity ? t.specificity.n_within_0p05_of_leader : "—" },
      ]} />
      {near.length > 0 && (
        <div className="mt-3">
          <p className="kicker border-b border-line pb-1.5">Near the top · not ranked · west → east</p>
          <ul aria-label="Cells within 0.05 of the top, not ranked against each other, listed west to east" className="divide-y divide-line border-b border-line">
            {near.map((c) => row(c, false))}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-3">
          <p className="kicker border-b border-line pb-1.5">Rank · location · S</p>
          <ul aria-label="Screened cells by screen rank" className="divide-y divide-line border-b border-line">
            {rest.slice(0, shown).map((c) => row(c, true))}
          </ul>
          {rest.length > shown && (
            <button type="button" onClick={() => setShown(rest.length)} className="hit mt-2 text-caption text-muted underline decoration-faint underline-offset-2 hover:text-ink">
              Show all {rest.length} listed cells
            </button>
          )}
        </div>
      )}
      <p className="mt-2.5 text-caption text-muted">
        {t.weights ? <>Weights: <span className="font-mono text-[11px]">{t.weights}</span>. </> : null}
        Validated on <Term k="synthetic">synthetic twins only</Term>. S is not comparable across window sizes.
      </p>
    </>
  );
}
