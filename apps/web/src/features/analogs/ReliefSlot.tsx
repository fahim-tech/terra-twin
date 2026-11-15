import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useLayout } from "../../app/useLayout";
import { Term } from "../../components/primitives";
import { GridFacts, ReliefView, scoreBasisLine, type Exaggeration } from "../../components/relief";
import { cx } from "../../components/ui";
import { G5 } from "../../lib/glossary";
import type { Relief, Tier2Candidate } from "../../types/contracts";
import { prettyWindow } from "./candidates";
import { CAPS, SectionHead } from "./instruments";

/**
 * Terrain relief of the selected research window, mounted by <ResearchStage> under the decision: a compact 3D
 * instrument (real elevations, labelled vertical exaggeration, km axes, an elevation scale in metres) keyed on
 * the window's research-pool id, under its own indexed section head.
 *
 * What it shows is Earth as measured: the window's Copernicus GLO-90 elevations aggregated to the MOLA grid
 * spacing (cell size and grid from the relief payload). The MOLA observation model is not applied to it, while
 * the research score above uses Earth as MOLA would observe it, and the caption says both.
 *
 * The panel scrolls, so the plain wheel scrolls it (Ctrl / ⌘ or a trackpad pinch zooms the view) and one finger
 * moving up or down scrolls it on touch. On phones the instrument waits behind a disclosure, so the sheet keeps
 * its fit at half height and no 3D context starts until it is asked for.
 */
export interface ReliefSlotProps {
  /** The selected research window (tier 2). */
  candidate: Tier2Candidate;
  /** Its research-pool window id (`reliefWindowId`): the caller renders this slot only when the pool lists it. */
  windowId: string;
  /** Section index in the panel ("02"). */
  index: string;
}

const TITLE = "Terrain relief";

export function ReliefSlot({ candidate, windowId, index }: ReliefSlotProps) {
  const phone = useLayout() === "phone";
  const [open, setOpen] = useState(false);
  const region = useId();
  const view = (
    <ReliefView key={windowId} planet="earth" id={windowId} title={prettyWindow(candidate.id)} density="compact" sceneHeight={phone ? 280 : 252}
      wheel="modifier" caption={(r, ve) => <Caption relief={r} ve={ve} />} />
  );
  if (!phone) {
    return (
      <div className="mt-6">
        {/* Set like the report's plate strips ("NADIR 420 KM · N UP"): an instrument tag, not a sentence. */}
        <SectionHead index={index} aside="3D · REAL ELEVATION">{TITLE}</SectionHead>
        <div className="mt-2.5">{view}</div>
      </div>
    );
  }
  return (
    <section className="mt-5">
      <h3 className="m-0">
        <button type="button" aria-expanded={open} aria-controls={region} onClick={() => setOpen((o) => !o)}
          className="hit flex w-full items-center gap-3 py-1.5 text-left">
          <span className={cx(CAPS, "flex min-w-0 flex-1 items-center gap-2.5 !text-ink/85 after:h-px after:min-w-4 after:flex-1 after:bg-line-strong after:content-['']")}>
            <span aria-hidden className="num font-medium text-faint">{index}</span>
            <span>{TITLE}</span>
          </span>
          {/* The button is named by the title; aria-expanded says whether it is open. */}
          <span aria-hidden className="flex shrink-0 items-center gap-1.5 border border-line-strong px-2 py-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.1em] text-muted">
            {open ? "Hide" : "Show 3D"}
            <ChevronDown className={cx("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} strokeWidth={1.75} />
          </span>
        </button>
      </h3>
      <div id={region} hidden={!open} className="mt-2">{open && view}</div>
    </section>
  );
}

/** What the relief is, from its own payload, and how it differs from what the research score uses. */
function Caption({ relief, ve }: { relief: Relief; ve: Exaggeration }) {
  const measured = relief.source.representation === "as_measured";
  return (
    <div className="space-y-1 text-caption [&_button]:text-left">
      <p className="text-ink/85">
        {measured
          ? <>Earth terrain: {G5.toggleMeasured} — the <Term k="operator">MOLA observation model</Term> is not applied.</>
          : <>{G5.toggleOom}.</>}
      </p>
      <p className="text-muted">
        {relief.source.title} · <GridFacts relief={relief} /> · <span className="whitespace-nowrap">vertical exaggeration <span className="num">×{ve}</span></span>
      </p>
      {measured && <p className="text-faint">{scoreBasisLine(2, "research")}</p>}
    </div>
  );
}
