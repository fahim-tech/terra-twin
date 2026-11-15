import { Check, Copy, Download, Printer } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlanetMark, StatusMark } from "../../components/marks";
import { cx } from "../../components/ui";
import { useEvidence } from "../../services/api";
import { useApp } from "../../store/app";
import type { SearchTarget } from "../../store/searchTarget";
import type { AnalogSearch, MissionProfile } from "../../types/contracts";
import { tiedWindows } from "../analogs/readout";
import {
  buildCsv, buildReportJson, candidateRole, exportBaseName, fmtCoord, generatedStamp, provenanceSummary, type ReportCandidate,
} from "./model";
import { DISPLAY } from "./parts";
import { splitDesignation } from "./typeset";

/** The land-cover gate only acts on the research-pool ranking (tier 2); the global screen is never land-cover filtered. */
const GATE_EFFECT = {
  exclude: "Research comparison: vegetated windows excluded before ranking",
  report: "Research comparison: land cover reported, never used to rank",
} as const;

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Document header block: dossier identity and exports, the two designations (the stage heading), the
 * status line, document control (mission profile, analysis units, generation time, analysis) and a one-line
 * data provenance. Every value is read from the search, the mission list or the real clock.
 */
export function DossierHeader({ search, target, c, mission, generatedAt, stale, liveLabel, onProvenance }: {
  search: AnalogSearch; target: SearchTarget; c: ReportCandidate | null; mission: MissionProfile | null; generatedAt: string;
  stale: boolean; liveLabel: string | null; onProvenance: () => void;
}) {
  const t2 = search.tier2;
  const role = c ? candidateRole(search, c) : null;
  const gateMode = t2.landcover_gate?.mode ?? mission?.gate_mode ?? null;
  const researchRan = t2.operator.status === "ok";
  const stamp = generatedStamp(generatedAt);
  const basis = !c ? "Search summary · no candidate selected" : c.tier === 1 ? "Screening cell · screen rank, not a decision" : "Research comparison";
  const researchVersion = (t2 as { method_version?: string }).method_version ?? (t2.operator as { version?: string }).version ?? null;
  const marsGeneric = !target.siteId;
  const earthName = !c ? null : c.tier === 1 && !c.t1?.known_analog.name ? "Screening cell" : c.label;
  // A tied window is named by the app's one tie wording: the set and its size, never a position in it.
  const earthKicker = !c ? "Earth · No candidate" : c.tier === 1 ? "Earth · Screening cell"
    : role === "tie_member" ? `Earth · ${tiedWindows(t2.decision.members.length)}` : "Earth · Research window";

  return (
    <header className="frame print-keep relative border border-line bg-surface">
      {/* Identity strip and exports. The exports keep their place at the right; a long basis wraps inside its
          own cell (under the identity, after its rule) instead of pushing the exports onto a second row. */}
      <div className="grid items-center gap-x-6 gap-y-3 border-b border-line px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] md:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-ink" />
          <span className="kicker !text-ink">TerraTwin · Mission dossier</span>
          <span className="kicker text-balance sm:border-l sm:border-line-strong sm:pl-3">{basis}</span>
        </div>
        <Exports search={search} c={c} mission={mission} generatedAt={generatedAt} />
      </div>

      {/* Designations: the stage heading. Category kickers repeat in the plate captions, so they are hidden here. */}
      <h1 data-stage-heading="report" tabIndex={-1}
        className="grid gap-y-4 px-4 pb-7 pt-6 outline-none! md:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] md:gap-x-2 md:px-6 md:pb-9 md:pt-8 print:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] print:pb-6 print:pt-5">
        <Designation tone="mars" kicker={target.siteId ? "Mars · Research zone" : "Mars · Search target"}
          name={target.siteId ? target.label : "Search target"} coord={fmtCoord(target.lat, target.lon, 3)} coordSpoken={marsGeneric} />
        <span aria-hidden className="flex items-center md:justify-center md:pt-[30px] print:justify-center print:pt-[26px]">
          {/* Stacked on phones: the same double arrow, turned to point at both designations. */}
          <svg width="10" height="30" viewBox="0 0 10 30" className="block text-faint md:hidden print:hidden">
            <path d="M5 1v28M1 5l4-4 4 4M1 25l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <svg width="76" height="10" viewBox="0 0 76 10" className="hidden text-faint md:block print:block print:w-[60px]">
            <path d="M1 5h74M5 1L1 5l4 4M71 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
        <span className="sr-only"> compared with </span>
        {c && earthName ? (
          <Designation tone="earth" kicker={earthKicker} name={earthName} coord={fmtCoord(c.lat, c.lon, 3)} coordSpoken={earthName === "Screening cell"} />
        ) : (
          <Designation tone="earth" kicker={earthKicker} name="No candidate selected" muted />
        )}
      </h1>

      {/* Status */}
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line px-4 py-3 md:px-6" role="note">
        <span className="flex items-center gap-2"><StatusMark state="caution" /><span className="kicker !text-warn">Status</span></span>
        <span className="text-label text-warn">Candidate identification — not validation of a new analog</span>
      </p>
      {stale && (
        <p className="border-t border-line px-4 py-3 text-body text-muted md:px-6" role="note">
          <span className="kicker mr-3 !text-warn">Superseded selection</span>
          This dossier describes <span className="text-ink">{target.label}</span>, the target of the last search. The current selection{liveLabel ? <> (<span className="text-ink">{liveLabel}</span>)</> : null} has moved on; run Find Earth Analogs again to report it.
        </p>
      )}

      {/* Document control */}
      {/* Rules are drawn by the cells (by position at each breakpoint), so they stay single lines under the print zoom. */}
      {/* Column shares leave the analysis cell room for a full method version (mono, never broken mid-token). */}
      <dl className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-[1.05fr_1fr_0.85fr_1.1fr] print:grid-cols-[1.05fr_1fr_0.85fr_1.1fr]">
        <Field k="Mission profile">
          <span className="text-ink">{mission?.label ?? target.mission.replace(/_/g, " ")}</span>
          {gateMode ? <span className="mt-1 block text-caption text-faint">{GATE_EFFECT[gateMode]}</span> : null}
          {gateMode && search.tier1 ? <span className="block text-caption text-faint">Global screen: no land-cover filter</span> : null}
        </Field>
        <Field k="Analysis units" className="border-t sm:border-l sm:border-t-0">
          <span className="block text-ink">{researchRan ? <><span className="num">{t2.target.window_km}</span> km research windows</> : "Research comparison not run"}</span>
          <span className="block text-ink">{search.tier1 ? <><span className="num">{search.tier1.candidate_pool.cell_size_km}</span> km screening cells</> : "Global screen not run"}</span>
          <span className="mt-1 block text-caption text-faint">Requested footprint <span className="num">{target.footprintKm}</span> km</span>
        </Field>
        <Field k="Generated" className="border-t lg:border-l lg:border-t-0 print:border-l print:border-t-0">
          {stamp ? (
            <>
              <span className="num block text-ink">{stamp.date}</span>
              <span className="block text-ink"><span className="num">{stamp.time}</span> UTC</span>
              {/* Two readouts side by side; in a narrow column they stack, with no separator left dangling. */}
              <span className="mt-1 flex flex-wrap gap-x-3 text-caption text-faint">
                <span className="whitespace-nowrap">MSD <span className="num">{stamp.msd.toLocaleString("en-US")}</span></span>
                <span className="whitespace-nowrap">MTC <span className="num">{stamp.mtc}</span></span>
              </span>
            </>
          ) : <span className="num text-faint">—</span>}
        </Field>
        <Field k="Analysis" className="border-t sm:border-l lg:border-t-0 print:border-t-0">
          <span className="num block truncate text-ink" title={search.id}>{search.id}</span>
          {/* A version id wraps only as a whole (after its label), never at its own hyphens. */}
          <span className="mt-1 block text-caption text-faint">Research <span className="num whitespace-nowrap">{researchVersion ?? "—"}</span></span>
          {search.tier1 && <span className="block text-caption text-faint">Screen <span className="num whitespace-nowrap">{search.tier1.method_version}</span></span>}
        </Field>
      </dl>

      {/* Data provenance, one line; the Provenance section has the full statements. */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-2.5 border-t border-line px-4 py-3.5 md:px-6">
        <span className="kicker pt-px">Data provenance</span>
        <dl className="flex w-full min-w-0 flex-wrap gap-x-7 gap-y-1.5 sm:w-auto sm:flex-1">
          {provenanceSummary(search).map((line) => (
            <div key={line.body} className="flex min-w-0 items-baseline gap-2">
              <dt className={cx("text-[10.5px] font-semibold uppercase tracking-[0.14em]", line.body === "mars" ? "text-mars" : line.body === "earth" ? "text-earth" : "text-muted")}>{line.label}</dt>
              <dd className="text-caption text-muted">{line.items.join(" · ")}</dd>
            </div>
          ))}
        </dl>
        {/* The padding is a touch target only: the words line up with the column (the left edge on phones). */}
        <button type="button" onClick={onProvenance} className="no-print hit label-caps -mx-1 -my-1 shrink-0 px-1 py-1 !text-[11px] text-muted hover:text-ink">
          Full provenance →
        </button>
      </div>
    </header>
  );
}

function Designation({ tone, kicker, name, coord, coordSpoken = false, muted = false }: {
  tone: "mars" | "earth"; kicker: string; name: string; coord?: string; coordSpoken?: boolean; muted?: boolean;
}) {
  // "Window 217 · roughness decile 8": the designation in display caps, its qualifier on a quieter line.
  const d = splitDesignation(name);
  return (
    <span className="block min-w-0">
      <span aria-hidden className="flex items-center gap-2.5">
        <PlanetMark planet={tone} />
        <span className={cx("kicker", tone === "mars" ? "!text-mars" : "!text-earth")}>{kicker}</span>
      </span>
      <span className={cx(DISPLAY, "mt-3 block text-balance leading-[0.95] tracking-[0.02em]",
        muted ? "text-[28px] text-muted md:text-[32px] xl:text-[36px] print:text-[30px]" : "text-[34px] text-ink md:text-[42px] xl:text-[50px] print:text-[38px]")}>
        {d.name}
      </span>
      {d.detail && (
        <span className="mt-2 block font-[family-name:var(--font-display)] text-[15px] font-medium uppercase leading-tight tracking-[0.08em] text-muted md:text-[17px]">
          <span className="sr-only">, </span>{d.detail}
        </span>
      )}
      {coord && <span aria-hidden={!coordSpoken || undefined} className="num mt-3 block text-num text-muted">{coordSpoken ? <span className="sr-only"> at </span> : null}{coord}</span>}
    </span>
  );
}

function Field({ k, children, className }: { k: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 border-line px-4 py-3.5 md:px-6", className)}>
      <dt className="kicker">{k}</dt>
      <dd className="mt-2 text-label">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ exports

const CMD = "hit inline-flex items-center justify-center gap-2 px-3 py-2 text-[11.5px] font-semibold uppercase leading-none tracking-[0.12em] text-muted transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12] active:duration-0";

/** Rectangular export commands, joined by hairlines: copy JSON, download JSON, download CSV, print. */
function Exports({ search, c, mission, generatedAt }: { search: AnalogSearch; c: ReportCandidate | null; mission: MissionProfile | null; generatedAt: string }) {
  const announce = useApp((s) => s.announce);
  const evidence = useEvidence().data;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const json = () => JSON.stringify(buildReportJson(search, c, mission, generatedAt, evidence), null, 2);
  const base = exportBaseName(search);
  return (
    <div role="group" aria-label="Export report" className="no-print grid w-full grid-cols-4 divide-x divide-line-strong border border-line-strong sm:flex sm:w-auto">
      <button type="button" className={CMD} onClick={async () => {
        try {
          await navigator.clipboard.writeText(json());
          setCopied(true);
          announce("Report JSON copied to the clipboard");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        } catch {
          announce("Could not copy — use Download JSON instead", true);
        }
      }}>
        {copied ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> : <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
        {/* Both labels share one cell, so the command keeps its width when it confirms (the strip never shifts). */}
        <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          <span className={cx(copied && "invisible")}>Copy<span className="max-sm:sr-only"> JSON</span></span>
          <span className={cx(!copied && "invisible")}>Copied</span>
        </span>
      </button>
      <button type="button" className={CMD} onClick={() => { download(`${base}.json`, json(), "application/json"); announce("Report JSON downloaded"); }}>
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /><span><span className="sr-only">Download </span>JSON</span>
      </button>
      <button type="button" className={CMD} onClick={() => { download(`${base}.csv`, buildCsv(search, c, evidence), "text/csv"); announce("Report CSV downloaded"); }}>
        <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /><span><span className="sr-only">Download </span>CSV</span>
      </button>
      <button type="button" className={CMD} onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />Print
      </button>
    </div>
  );
}
