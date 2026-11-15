import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cx } from "../../components/ui";
import { formatLat, formatLon, normLon } from "../../lib/geodesy";
import { zoneName } from "../../lib/glossary";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { siteContaining } from "./MarsControls";
import { OUTCOME_COPY, useSiteOutcomes } from "./outcomes";

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

/** Search capsule: research zones by name, or a coordinate. Primary keyboard path to any Mars point. */
export function MarsSearch() {
  const sites = useSites();
  const select = useApp((s) => s.select);
  const selection = useApp((s) => s.selection);
  const { bySite } = useSiteOutcomes();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const coord = parseCoordinate(q);

  const options = useMemo(() => {
    const all = (sites.data ?? []).map((s) => ({ ...s, display: zoneName(s.id) }));
    const t = q.trim().toLowerCase();
    if (coord) return [];
    if (!t) {
      const start = START_HERE.map((id) => all.find((s) => s.id === id)).filter(Boolean) as typeof all;
      const rest = all.filter((s) => !START_HERE.includes(s.id)).sort((a, b) => a.display.localeCompare(b.display));
      return [...start.map((s) => ({ ...s, group: "Start here" })), ...rest.map((s) => ({ ...s, group: "All research zones" }))];
    }
    return all.filter((s) => s.display.toLowerCase().includes(t)).map((s) => ({ ...s, group: "Research zones" }));
  }, [sites.data, q, coord]);

  const choose = (i: number) => {
    if (coord) {
      const site = siteContaining(sites.data, coord.lat, coord.lon);
      select({ lat: coord.lat, lon: coord.lon, siteId: site?.id ?? null, label: site ? zoneName(site.id) : `${formatLat(coord.lat, 2)}, ${formatLon(coord.lon, 2)}` });
    } else {
      const s = options[i];
      if (!s) return;
      select({ lat: s.lat, lon: s.lon, siteId: s.id, label: s.display });
    }
    setOpen(false); setQ(""); input.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0))); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); choose(active); }
    if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
  };

  let lastGroup = "";
  return (
    <div className="relative w-full" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <div className="surface flex h-11 items-center gap-2 rounded-full pl-4 pr-1.5">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls="mars-search-list" aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `zone-${options[active].id}` : undefined}
          placeholder={selection ? selection.label : "Search 39 research zones, or lat, lon"}
          aria-label="Search research zones or enter a latitude and longitude"
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint" />
        {q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); input.current?.focus(); }} className="hit grid h-8 w-8 place-items-center rounded-full text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && (
        <div className="surface-solid absolute left-0 right-0 top-[52px] z-40 overflow-hidden rounded-[14px]">
          {coord ? (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(0)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-space/60">
              <span className="text-label">Go to <span className="num">{formatLat(coord.lat, 2)} {formatLon(coord.lon, 2)}</span></span>
              <span className="text-caption text-faint">Enter</span>
            </button>
          ) : (
            <ul id="mars-search-list" role="listbox" aria-label="Research zones" className="scroll-thin max-h-[min(60vh,440px)] overflow-y-auto py-1.5">
              {options.length === 0 && <li className="px-4 py-3 text-caption text-muted">{sites.isError ? "Research zones unavailable — the API is not reachable." : "No zone matches. Try a name, or type a coordinate like 18.4, 77.5."}</li>}
              {options.map((s, i) => {
                const head = s.group !== lastGroup ? s.group : null;
                lastGroup = s.group;
                const o = bySite[s.id];
                return (
                  <li key={s.id} role="presentation">
                    {head && <div className="kicker px-4 pb-1 pt-2.5">{head}</div>}
                    <div id={`zone-${s.id}`} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
                      className={cx("flex cursor-pointer items-center justify-between gap-3 px-4 py-2", i === active && "bg-space/60")}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <OutcomeGlyph type={o?.type} />
                        <span className="truncate text-label text-ink">{s.display}</span>
                      </span>
                      <span className="num shrink-0 text-num-sm text-faint">{formatLat(s.lat, 1)} {formatLon(s.lon, 1)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line px-4 py-2 text-caption text-faint">Glyph: ◉ stable leader · ◎ tie · ○ no research ranking — for the selected mission</div>
        </div>
      )}
    </div>
  );
}

export function OutcomeGlyph({ type }: { type?: string }) {
  const label = type ? OUTCOME_COPY[type as keyof typeof OUTCOME_COPY]?.short : "No research ranking";
  return (
    <span title={label} aria-label={label} className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center">
      {type === "named_leader" ? <span className="h-3 w-3 rounded-full border border-mars p-[2px]"><span className="block h-full w-full rounded-full bg-mars" /></span>
        : type === "tied_set" ? <span className="h-3 w-3 rounded-full border border-mars p-[3px]"><span className="block h-full w-full rounded-full border border-mars" /></span>
        : <span className="h-3 w-3 rounded-full border border-faint" />}
    </span>
  );
}
