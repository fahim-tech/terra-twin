import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../components/ui";
import { formatLat, formatLon } from "../lib/geodesy";
import { useHealth } from "../services/api";
import { type Stage, useApp } from "../store/app";
import { useGlobes } from "../store/globes";
import { searchTarget } from "../store/searchTarget";

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <button type="button" onClick={() => useApp.getState().set({ stage: "mars", introOpen: true, whyOpen: false })}
      aria-label="TerraTwin — back to the start" className="flex shrink-0 items-center gap-2.5 rounded-control">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <circle cx="12.5" cy="16" r="7.5" fill="none" stroke="var(--color-mars)" strokeWidth="1.6" />
        <circle cx="19.5" cy="16" r="7.5" fill="none" stroke="var(--color-earth)" strokeWidth="1.6" />
      </svg>
      {!compact && <span className="toponym text-[21px] leading-none tracking-[-0.01em]">TerraTwin</span>}
    </button>
  );
}

const DECISION_SHORT: Record<string, string> = {
  named_leader: "stable leader", tied_set: "tie", no_convincing_analog: "no convincing analog", insufficient_evidence: "not enough evidence",
};
/** Phone tokens: the full outcome stays in the accessible name; these never cut a G5-derived word mid-way. */
const DECISION_TINY: Record<string, string> = {
  named_leader: "leader", tied_set: "tie", no_convincing_analog: "none", insufficient_evidence: "n/a",
};

/** The investigation trail: Mars · target › Earth · outcome › Compare. Locked steps say what unlocks them. */
function Trail({ compact }: { compact: boolean }) {
  const { stage, selection, search, candidateId, go } = useApp();
  const t = searchTarget(search);
  const outcome = search ? (search.status === "available" ? search.tier2.decision.type : "insufficient_evidence") : null;
  const steps: { id: Stage; planet: string; detail: string | null; tiny: string | null; locked: string | null }[] = [
    { id: "mars", planet: "Mars", detail: selection?.label ?? null, tiny: selection ? (selection.siteId ? selection.label : "point") : null, locked: null },
    { id: "earth", planet: "Earth", detail: outcome ? DECISION_SHORT[outcome] : null, tiny: outcome ? DECISION_TINY[outcome] : null, locked: search ? null : "Run Find Earth Analogs first" },
    { id: "compare", planet: "Compare", detail: t && candidateId ? t.label : null, tiny: t && candidateId ? (t.siteId ? t.label : "point") : null, locked: !search ? "Run Find Earth Analogs first" : !candidateId ? "Choose an Earth candidate first" : null },
  ];
  const visible = compact ? steps.filter((s) => s.id === (stage === "evidence" || stage === "report" ? "mars" : stage)) : steps;
  return (
    <nav aria-label="Investigation" className="flex min-w-0 items-center">
      <ol className="flex min-w-0 items-center gap-1">
        {visible.map((s, i) => {
          const current = stage === s.id;
          const shown = compact ? s.tiny : s.detail;
          return (
            <li key={s.id} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />}
              <button type="button" onClick={() => !s.locked && go(s.id)} aria-current={current ? "step" : undefined} aria-disabled={!!s.locked}
                title={s.locked ?? undefined} aria-label={compact && s.detail ? `${s.planet}: ${s.detail}${s.locked ? ` (${s.locked})` : ""}` : undefined}
                className={cx("hit group flex min-w-0 items-center rounded-control px-2 py-1 text-label transition-colors",
                  s.locked ? "cursor-default text-faint" : current ? "text-ink" : "text-muted hover:text-ink")}>
                <span className="flex min-w-0 items-baseline">
                  <span className={cx("shrink-0", current && s.id === "mars" && "text-mars", current && s.id === "earth" && "text-earth")}>{s.planet}</span>
                  {shown && <><span aria-hidden className="mx-1.5 shrink-0 text-faint">·</span><span className="truncate text-muted">{shown}</span></>}
                </span>
                {s.locked && !compact && <span className="sr-only">({s.locked})</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BackButton({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  const prev = useApp((s) => s.previousStage);
  const [full, short] = prev === "mars" ? ["Mars", "Mars"] : prev === "compare" ? ["comparison", "Compare"] : ["Earth", "Earth"];
  return (
    <button type="button" onClick={onClick} aria-label={`Back to ${full}`} className="hit shrink-0 whitespace-nowrap rounded-control px-2 py-1 text-label text-muted hover:text-ink">
      ← {compact ? short : `Back to ${full}`}
    </button>
  );
}

function HoverReadout() {
  const hover = useGlobes((s) => s.hover);
  return (
    <div className="num hidden w-[200px] justify-end text-num-sm text-muted xl:flex" aria-hidden>
      {hover && <><span className={cx("mr-2", hover.planet === "mars" ? "text-mars" : "text-earth")}>{hover.planet === "mars" ? "Mars" : "Earth"}</span>{formatLat(hover.lat, 2)} {formatLon(hover.lon, 2)}</>}
    </div>
  );
}

export function TopBar({ compact }: { compact: boolean }) {
  const { stage, go, back, search } = useApp();
  const fullPage = stage === "evidence" || stage === "report";
  return (
    <header className="no-print relative z-30 flex h-[52px] shrink-0 items-center gap-3 bg-gradient-to-b from-space via-space/90 to-space/70 px-3 sm:gap-5 sm:px-5">
      <Wordmark compact={compact} />
      {fullPage ? (
        <BackButton compact={compact} onClick={back} />
      ) : <Trail compact={compact} />}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <HoverReadout />
        <button type="button" onClick={() => go("evidence")} aria-current={stage === "evidence" ? "page" : undefined}
          className={cx("hit rounded-control px-2.5 py-1 text-label hover:text-ink", stage === "evidence" ? "text-ink" : "text-muted")}>Evidence</button>
        <button type="button" onClick={() => search && go("report")} aria-disabled={!search} title={search ? undefined : "Run Find Earth Analogs to build a report"}
          className={cx("hit rounded-control px-2.5 py-1 text-label", !search ? "cursor-default text-faint" : stage === "report" ? "text-ink" : "text-muted hover:text-ink")}>Report</button>
        <MoreMenu />
      </div>
    </header>
  );
}

const MARS_LAYERS = [
  { id: "viking_color", label: "Viking colour mosaic", note: "232 m" },
  { id: "mola_shade", label: "MOLA shaded relief", note: "463 m · colour = elevation" },
];
const EARTH_LAYERS = [
  { id: "blue_marble_relief", label: "Blue Marble relief", note: "500 m" },
  { id: "blue_marble_ng", label: "Blue Marble true colour", note: "500 m" },
];

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const { marsLayer, earthLayer, graticule, set } = useApp();
  const health = useHealth();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitemradio],[role=menuitemcheckbox]")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio],[role=menuitemcheckbox]") ?? []);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const to = e.key === "ArrowDown" ? (i + 1) % list.length : e.key === "ArrowUp" ? (i - 1 + list.length) % list.length
      : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (to >= 0 && list.length) { e.preventDefault(); list[to].focus(); }
    else if (e.key === "Tab") setOpen(false);
  };
  const onMenuBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && !menu.current?.contains(next) && !btn.current?.contains(next)) setOpen(false);
  };
  const item = (on: boolean, label: string, note: string, act: () => void, role: "menuitemradio" | "menuitemcheckbox" = "menuitemradio") => (
    <button key={label} role={role} aria-checked={on} onClick={act} tabIndex={-1}
      className="flex w-full items-center justify-between gap-4 rounded-control px-2.5 py-2 text-left hover:bg-space/60 focus-visible:bg-space/60">
      <span className="flex items-center gap-2 text-label"><span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-ink" : "ring-1 ring-faint")} />{label}</span>
      <span className="text-caption text-faint">{note}</span>
    </button>
  );
  const apiTone = health.isError ? "API unreachable" : health.data?.research_data ? "API connected · research data verified" : health.data ? "API connected · research data missing" : "Checking API…";
  return (
    <div className="relative">
      <button ref={btn} type="button" aria-label="More: layers, data status, about" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="hit grid h-9 w-9 place-items-center rounded-control text-muted hover:bg-elevated hover:text-ink">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label="Layers and status" onKeyDown={onMenuKey} onBlur={onMenuBlur} className="surface-solid absolute right-0 top-11 z-50 w-[320px] rounded-[12px] p-2">
          <div className="kicker px-2.5 pb-1 pt-1.5">Mars imagery</div>
          {MARS_LAYERS.map((l) => item(marsLayer === l.id, l.label, l.note, () => set({ marsLayer: l.id })))}
          <div className="kicker px-2.5 pb-1 pt-3">Earth imagery</div>
          {EARTH_LAYERS.map((l) => item(earthLayer === l.id, l.label, l.note, () => set({ earthLayer: l.id })))}
          <div className="kicker px-2.5 pb-1 pt-3">Overlays</div>
          {item(graticule, "Latitude–longitude grid", "30°", () => set({ graticule: !graticule }), "menuitemcheckbox")}
          <p className="px-2.5 pb-1 pt-3 text-caption text-faint">Imagery is visual context only; measurements come from the analysis datasets.</p>
          <div className="mt-2 border-t border-line px-2.5 pt-2.5 text-caption text-muted">{apiTone}</div>
          <div className="px-2.5 pb-1 pt-1 text-caption text-faint">AstroSUST · NASA Space Apps Challenge 2026</div>
        </div>
      )}
    </div>
  );
}
