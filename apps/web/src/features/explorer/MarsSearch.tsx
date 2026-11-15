import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "../../components/ui";
import { normLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useEvidence, useMissions, useSites } from "../../services/api";
import { useApp, type Selection } from "../../store/app";
import { useExplorer } from "./explorerStore";
import { OUTCOME_COPY, useSiteOutcomes } from "./outcomes";
import { Kbd, Mark } from "./parts";
import { nextActive, revealDelta } from "./readouts";
import { useScales } from "./useScales";
import { formatCoord, formatKm, readZone, selectionFor, zoneSelection } from "./zones";

/**
 * Shown first (spec §8): zones that between them show a stable leader, a tie and a documented
 * positive-control limit. Which zone shows which outcome depends on the mission and is read live from
 * the research summary (glyphs); for Landing Site, Arcadia Planitia is the tie. Cerberus carries the
 * limit: the verified volcanic analog Holuhraun is not recovered there (captioned from the evidence
 * limitations and the research window size, not hard-coded).
 */
const START_HERE = ["Jezero", "Gale", "Arcadia_Planitia", "Cerberus"];

/** Parse "lat, lon" (also "17.6N 77E" style) into numbers; null if not a coordinate. */
export function parseCoordinate(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = Number(m[1]); let lon = Number(m[3]);
  if (m[2]?.toUpperCase() === "S") lat = -Math.abs(lat);
  if (m[4]?.toUpperCase() === "W") lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || lon < -180 || lon > 360) return null;
  return { lat, lon: normLon(lon) };
}

/** Focus the inspector's heading once it has rendered (keyboard users land on what they chose). */
function focusInspector() {
  setTimeout(() => document.querySelector<HTMLElement>('[data-stage-heading="mars"]:not(.sr-only)')?.focus({ preventScroll: true }), 120);
}

/** True when a keystroke belongs to a text control, so the "/" shortcut leaves it alone. */
function typingIn(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/**
 * Navigator command field: research zones by name, or a coordinate. The primary keyboard path to any
 * Mars point — "/" focuses it from anywhere on the page, arrows/Home/End/PageUp/PageDown move the
 * selection bar, Enter goes, Escape closes.
 */
export function MarsSearch() {
  const sites = useSites();
  const missions = useMissions();
  const select = useApp((s) => s.select);
  const selection = useApp((s) => s.selection);
  const mission = useApp((s) => s.mission);
  const { bySite, gateMode } = useSiteOutcomes();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** The last change of the active option came from the keyboard (only then is it scrolled into view). */
  const byKeys = useRef(false);
  const listId = useId();
  const coord = parseCoordinate(q);
  const coordZone = coord ? readZone(sites.data, coord.lat, coord.lon) : null;
  const missionLabel = missions.data?.find((m) => m.id === mission)?.label ?? "This mission";
  const n = sites.data?.length;

  const options = useMemo(() => {
    const all = (sites.data ?? []).map((s) => ({ ...s, display: zoneName(s.id) }));
    const t = q.trim().toLowerCase();
    if (coord) return [];
    if (!t) {
      const start = START_HERE.map((id) => all.find((s) => s.id === id)).filter(Boolean) as typeof all;
      const rest = all.filter((s) => !START_HERE.includes(s.id)).sort((a, b) => a.display.localeCompare(b.display));
      return [...start.map((s) => ({ ...s, group: "Start here" })), ...rest.map((s) => ({ ...s, group: `All ${all.length} research zones` }))];
    }
    return all.filter((s) => s.display.toLowerCase().includes(t) || s.id.toLowerCase().includes(t)).map((s) => ({ ...s, group: "Matching zones" }));
  }, [sites.data, q, coord]);

  const go = (s: Selection, viaKeyboard: boolean) => {
    useExplorer.getState().set({ origin: null });
    select(s);
    useApp.getState().set({ introOpen: false });
    setOpen(false); setQ("");
    if (viaKeyboard) focusInspector(); else input.current?.blur();
  };
  const choose = (i: number, viaKeyboard = false) => {
    if (coord) return go(selectionFor(sites.data, coord.lat, coord.lon), viaKeyboard);
    const s = options[i];
    if (s) go(zoneSelection(s), viaKeyboard);
  };

  /** Open the list; a fresh, unfiltered list starts at its first row, a reopened one keeps its row in view. */
  const openList = () => {
    if (open) return;
    if (!q) setActive(0); else byKeys.current = true;
    setOpen(true);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (open || coord) choose(active, true); else openList(); return; }
    if (e.key === "Escape") {
      if (open || q) { e.preventDefault(); e.stopPropagation(); if (open) setOpen(false); else setQ(""); }
      return;
    }
    if (e.key === "ArrowDown" && !open) { e.preventDefault(); openList(); return; }
    if (!open || coord) return;
    const to = nextActive(e.key, active, options.length);
    if (to === null) return;
    e.preventDefault();
    byKeys.current = true;
    setActive(to);
  };

  // "/" anywhere on the page (outside a text control) puts the cursor in the field.
  useEffect(() => {
    const onSlash = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typingIn(e.target)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  const activeId = open && !coord && options[active] ? `${listId}-${options[active].id}` : open && coord ? `${listId}-coord` : undefined;

  // Keep the keyboard's selection bar in view (with its group heading when it is the first row of one).
  useEffect(() => {
    if (!open || !byKeys.current || !activeId) return;
    byKeys.current = false;
    const ul = list.current;
    const row = document.getElementById(activeId)?.parentElement;
    if (!ul || !row) return;
    const d = revealDelta(row.getBoundingClientRect(), ul.getBoundingClientRect(), 16);
    if (d) ul.scrollTop += d;
  }, [open, activeId]);

  const placeholder = selection
    ? `${selection.siteId ? zoneName(selection.siteId) : formatCoord(selection.lat, selection.lon)} · search zones`
    : n ? `Search ${n} research zones` : "Search research zones";

  let lastGroup = "";
  return (
    <div className="relative w-full" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      {!selection && <h1 data-stage-heading="mars" tabIndex={-1} className="sr-only">Mars explorer</h1>}
      <div data-occludes="mars"
        className={cx("surface group/field flex h-11 items-stretch rounded-control transition-shadow duration-150",
          "has-[input:focus-visible]:shadow-[inset_0_0_0_1px_rgb(242_244_245/0.55),0_24px_60px_-24px_rgb(0_0_0/0.8)]!")}>
        <span aria-hidden className="grid w-11 shrink-0 place-items-center text-muted transition-colors duration-150 group-focus-within/field:text-ink">
          <Search className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <span aria-hidden className="my-3 w-px shrink-0 bg-white/[0.09]" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={openList} onClick={openList} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeId} aria-keyshortcuts="/"
          placeholder={placeholder} aria-label="Search research zones or enter a latitude and longitude" spellCheck={false} autoComplete="off"
          style={{ outline: "none" }} className="h-full min-w-0 flex-1 bg-transparent pl-3 pr-2 text-body text-ink placeholder:text-muted" />
        <span className="flex shrink-0 items-center gap-2 pr-2">
          {q ? (
            <>
              {coord && (
                <span className="num flex items-center gap-1.5 text-[10.5px] tracking-[0.08em] text-ink" title="Recognised as latitude, longitude">
                  <Mark on tone="mars" />LAT, LON
                </span>
              )}
              <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setActive(0); input.current?.focus(); }}
                className="hit grid h-7 w-7 place-items-center rounded-control text-muted transition-colors duration-150 hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.12] active:duration-0">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <span aria-hidden className="num text-[10.5px] tracking-[0.08em] text-faint">LAT, LON</span>
              <span aria-hidden className="hidden pr-0.5 transition-opacity duration-150 group-focus-within/field:opacity-0 [@media(hover:hover)]:inline-flex"><Kbd>/</Kbd></span>
            </>
          )}
        </span>
      </div>

      <AnimatePresence>
        {/* Phones: a scrim behind the open list so it never half-covers the nav cluster or the sheet. */}
        {open && <motion.div key="scrim" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 -z-10 bg-space/75 md:hidden" />}
        {open && (
          <motion.div key="list" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-[calc(100%-1px)] z-40 overflow-hidden rounded-b-control bg-surface shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_24px_60px_-20px_rgb(0_0_0/0.85)]">
            <ul ref={list} id={listId} role="listbox" aria-label={coord ? "Coordinate" : "Research zones"} className="scroll-thin fade-edges max-h-[min(56vh,440px)] overflow-y-auto py-1">
              {coord ? (
                <li role="presentation">
                  <div id={`${listId}-coord`} role="option" aria-selected onMouseDown={(e) => e.preventDefault()} onClick={() => choose(0)}
                    className="relative flex cursor-pointer items-center gap-3 bg-white/[0.06] py-2.5 pl-4 pr-3 [@media(pointer:coarse)]:min-h-[44px]">
                    <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2.5">
                        <span className="kicker !text-muted">Go to</span>
                        <span className="num text-num text-ink">{formatCoord(coord.lat, coord.lon)}</span>
                      </span>
                      {coordZone && (
                        <span className="mt-1 flex items-center gap-2 text-caption text-muted">
                          <Mark on={coordZone.inside} tone="mars" />
                          {coordZone.inside
                            ? <span>Inside research zone · <span className="text-ink">{coordZone.name}</span></span>
                            : <span>Outside research zones · nearest <span className="text-ink">{coordZone.name}</span>
                                {typeof coordZone.km === "number" && <>, <span className="whitespace-nowrap"><span className="num">{formatKm(coordZone.km).split(" ")[0]}</span> km to centre</span></>}
                              </span>}
                        </span>
                      )}
                    </span>
                    <span aria-hidden className="hidden shrink-0 [@media(hover:hover)]:inline-flex"><Kbd>↵</Kbd></span>
                  </div>
                </li>
              ) : options.length === 0 ? (
                <li role="presentation" className="px-4 py-3 text-caption text-muted">
                  {sites.isError ? "Research zones are unavailable — the scientific API is not reachable."
                    : sites.isLoading ? "Loading research zones…"
                    : <>No zone matches “{q.trim()}”. Try a name, or a coordinate like <span className="num text-ink">18.4, 77.5</span>.</>}
                </li>
              ) : options.map((s, i) => {
                const note = s.group === "Start here" && s.id === "Cerberus" ? <PositiveControlNote /> : null;
                const head = s.group !== lastGroup ? s.group : null;
                lastGroup = s.group;
                const o = bySite[s.id];
                const current = selection?.siteId === s.id;
                const on = i === active;
                return (
                  <li key={s.id} role="presentation">
                    {head && <div role="presentation" className="kicker rule-after px-4 pb-1.5 pt-3">{head}</div>}
                    <div id={`${listId}-${s.id}`} role="option" aria-selected={on} aria-current={current || undefined}
                      onMouseDown={(e) => e.preventDefault()} onMouseMove={() => { if (!on) setActive(i); }} onClick={() => choose(i)}
                      className={cx("relative flex cursor-pointer items-center gap-3 py-[7px] pl-4 pr-4 [@media(pointer:coarse)]:min-h-[44px]", on && "bg-white/[0.06]")}>
                      {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
                      <OutcomeGlyph type={o?.type} />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate text-label", current ? "text-mars" : "text-ink")}>{s.display}</span>
                        {note}
                      </span>
                      {current && <span className="sr-only">(selected)</span>}
                      <span className="num shrink-0 text-num-sm text-faint">{formatCoord(s.lat, s.lon, 1)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!coord && (
              <div className="border-t border-line px-4 pb-3 pt-2.5">
                <p className="kicker !text-muted">{missionLabel} · research outcome</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-caption text-faint">
                  {!gateMode && missions.data ? <span>None for this mission</span> : (
                    <>
                      <span className="whitespace-nowrap"><span aria-hidden className="text-mars">◉</span> stable leader</span>
                      <span className="whitespace-nowrap"><span aria-hidden className="text-mars">◎</span> tie</span>
                      <span className="whitespace-nowrap"><span aria-hidden>○</span> no verdict</span>
                      <span className="whitespace-nowrap"><span aria-hidden>—</span> not loaded</span>
                    </>
                  )}
                </p>
                <p aria-hidden className="mt-2.5 hidden items-center gap-4 text-[11px] text-faint [@media(hover:hover)]:flex">
                  <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>move</span>
                  <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>go</span>
                  <span className="flex items-center gap-1.5"><Kbd>esc</Kbd>close</span>
                  <span className="flex items-center gap-1.5"><Kbd>/</Kbd>search</span>
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Research outcome glyph for a zone under the active mission: ◉ stable leader, ◎ tie, ○ abstention
 * (no convincing analog / insufficient evidence), — no outcome loaded. Abstention is a result, so it
 * never shares the "missing data" dash. (The glyph set is shared with the Earth, comparison and report
 * views.)
 */
export function OutcomeGlyph({ type }: { type?: string }) {
  const label = type ? OUTCOME_COPY[type as keyof typeof OUTCOME_COPY]?.short ?? type : "No research outcome loaded";
  const glyph = type === "named_leader" ? "◉" : type === "tied_set" ? "◎" : type ? "○" : "—";
  return (
    <span title={label} className={cx("inline-grid w-4 shrink-0 place-items-center text-[13px] leading-none", type === "named_leader" || type === "tied_set" ? "text-mars" : "text-faint")}>
      <span aria-hidden>{glyph}</span>
      <span className="sr-only">{label}:</span>
    </span>
  );
}

/** One-line caption for Cerberus in "Start here", from the API's evidence limitations and window size. */
function PositiveControlNote() {
  const ev = useEvidence();
  const { windowKm } = useScales();
  const lim = (ev.data?.limitations as { code: string; text: string }[] | undefined)?.find((l) => l.code === "positive_control_miss");
  if (!lim) return null;
  return <span className="mt-0.5 block truncate text-caption text-faint" title={lim.text}>Positive control missed{windowKm !== null ? ` at ${windowKm} km` : ""}</span>;
}
