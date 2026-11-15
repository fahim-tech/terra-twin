import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cx } from "../../components/ui";
import { normLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useMissions, useSites } from "../../services/api";
import { useApp, type Selection } from "../../store/app";
import { useExplorer } from "./explorerStore";
import { OUTCOME_COPY, useSiteOutcomes } from "./outcomes";
import { formatCoord, formatKm, readZone, selectionFor, zoneSelection } from "./zones";

/** Shown first: a stable leader (Jezero), a tie-prone zone (Gale), and a documented positive-control limit (Cerberus). */
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

/** Search capsule: research zones by name, or a coordinate. The primary keyboard path to any Mars point. */
export function MarsSearch() {
  const sites = useSites();
  const missions = useMissions();
  const select = useApp((s) => s.select);
  const selection = useApp((s) => s.selection);
  const mission = useApp((s) => s.mission);
  const { bySite } = useSiteOutcomes();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const coord = parseCoordinate(q);
  const coordZone = coord ? readZone(sites.data, coord.lat, coord.lon) : null;
  const missionLabel = missions.data?.find((m) => m.id === mission)?.label ?? "this mission";

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

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && open) { e.preventDefault(); setActive(Math.max(options.length - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open || coord) choose(active, true); else setOpen(true); }
    else if (e.key === "Escape" && (open || q)) { e.preventDefault(); e.stopPropagation(); if (open) setOpen(false); else setQ(""); }
  };

  const activeId = open && !coord && options[active] ? `${listId}-${options[active].id}` : open && coord ? `${listId}-coord` : undefined;
  let lastGroup = "";
  return (
    <div className="relative w-full" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      {!selection && <h1 data-stage-heading="mars" tabIndex={-1} className="sr-only">Mars explorer</h1>}
      <div data-occludes="mars" className={cx("surface flex h-11 items-center gap-2.5 rounded-full pl-4 pr-1.5 transition-shadow has-[input:focus-visible]:shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-earth)_70%,white)]", open && "shadow-[inset_0_0_0_1px_var(--color-line-strong)]")}>
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeId}
          placeholder={selection ? `${selection.siteId ? zoneName(selection.siteId) : formatCoord(selection.lat, selection.lon)} · search zones or lat, lon` : `Search ${sites.data?.length ?? 39} research zones or enter lat, lon`}
          aria-label="Search research zones or enter a latitude and longitude"
          style={{ outline: "none" }} className="h-full min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-muted" />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(""); input.current?.focus(); }}
            className="hit grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-elevated hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="surface-solid absolute left-0 right-0 top-[52px] z-40 overflow-hidden rounded-surface">
          <ul id={listId} role="listbox" aria-label={coord ? "Coordinate" : "Research zones"} className="scroll-thin fade-edges max-h-[min(56vh,440px)] overflow-y-auto py-1.5">
            {coord ? (
              <li id={`${listId}-coord`} role="option" aria-selected onMouseDown={(e) => e.preventDefault()} onClick={() => choose(0)}
                className="flex cursor-pointer items-center justify-between gap-3 bg-space/60 px-4 py-2.5 [@media(pointer:coarse)]:min-h-[44px]">
                <span className="min-w-0">
                  <span className="block text-label text-ink">Go to <span className="num">{formatCoord(coord.lat, coord.lon)}</span></span>
                  {coordZone && (
                    <span className="mt-0.5 block text-caption text-muted">
                      {coordZone.inside ? <>Inside research zone · {coordZone.name}</> : <>Outside research zones · nearest {coordZone.name}, <span className="whitespace-nowrap"><span className="num">{formatKm(coordZone.km ?? 0).split(" ")[0]}</span> km</span></>}
                    </span>
                  )}
                </span>
                <kbd className="shrink-0 rounded-control bg-elevated px-1.5 py-0.5 font-sans text-caption text-faint shadow-[inset_0_0_0_1px_var(--color-line)]">Enter</kbd>
              </li>
            ) : options.length === 0 ? (
              <li role="presentation" className="px-4 py-3 text-caption text-muted">
                {sites.isError ? "Research zones are unavailable — the scientific API is not reachable."
                  : sites.isLoading ? "Loading research zones…"
                  : <>No zone matches “{q.trim()}”. Try a name, or a coordinate like <span className="num">18.4, 77.5</span>.</>}
              </li>
            ) : options.map((s, i) => {
              const head = s.group !== lastGroup ? s.group : null;
              lastGroup = s.group;
              const o = bySite[s.id];
              const current = selection?.siteId === s.id;
              return (
                <li key={s.id} role="presentation">
                  {head && <div role="presentation" className="kicker px-4 pb-1 pt-3 first:pt-2">{head}</div>}
                  <div id={`${listId}-${s.id}`} role="option" aria-selected={i === active} aria-current={current || undefined}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
                    className={cx("flex cursor-pointer items-center justify-between gap-3 px-4 py-2 [@media(pointer:coarse)]:min-h-[44px]", i === active && "bg-space/60")}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <OutcomeGlyph type={o?.type} />
                      <span className={cx("truncate text-label", current ? "text-mars" : "text-ink")}>{s.display}</span>
                      {current && <span className="sr-only">(selected)</span>}
                    </span>
                    <span className="num shrink-0 text-num-sm text-faint">{formatCoord(s.lat, s.lon, 1)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {!coord && (
            <p className="border-t border-line px-4 py-2 text-caption text-faint">
              {missionLabel}: <span className="whitespace-nowrap"><span aria-hidden className="text-mars">◉</span> stable leader</span> · <span className="whitespace-nowrap"><span aria-hidden className="text-mars">◎</span> tie</span> · <span className="whitespace-nowrap"><span aria-hidden>—</span> none</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Research outcome glyph for a zone under the active mission: ◉ stable leader, ◎ tie, — none. */
export function OutcomeGlyph({ type }: { type?: string }) {
  const label = type ? OUTCOME_COPY[type as keyof typeof OUTCOME_COPY]?.short ?? type : "No research outcome loaded";
  const glyph = type === "named_leader" ? "◉" : type === "tied_set" ? "◎" : "—";
  return (
    <span title={label} className={cx("inline-grid w-4 shrink-0 place-items-center text-[13px] leading-none", type === "named_leader" || type === "tied_set" ? "text-mars" : "text-faint")}>
      <span aria-hidden>{glyph}</span>
      <span className="sr-only">{label}:</span>
    </span>
  );
}
