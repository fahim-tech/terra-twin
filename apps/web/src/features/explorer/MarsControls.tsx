import { Crosshair, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Chip, cx, Eyebrow, Note, Section, Segmented, pct } from "../../components/ui";
import { formatLat, formatLon, normLon } from "../../lib/geodesy";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import type { MarsSite } from "../../types/contracts";

export const FOOTPRINTS = [1, 5, 25, 100] as const;

export function siteContaining(sites: MarsSite[] | undefined, lat: number, lon: number): MarsSite | null {
  if (!sites) return null;
  const hits = sites.filter((s) => lat >= s.bbox.lat_min && lat <= s.bbox.lat_max && lon >= s.bbox.lon_min && lon <= s.bbox.lon_max);
  hits.sort((a, b) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2 - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2));
  return hits[0] ?? null;
}

export function MarsControls() {
  const sites = useSites();
  const { selection, select, footprintKm, set } = useApp();
  const [q, setQ] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = (sites.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const t = q.trim().toLowerCase();
    return t ? s.filter((x) => x.name.toLowerCase().includes(t)) : s;
  }, [sites.data, q]);

  function goto(e: FormEvent) {
    e.preventDefault();
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || la < -90 || la > 90) return setErr("Latitude must be between −90 and 90.");
    if (!Number.isFinite(lo) || lo < -180 || lo > 360) return setErr("Longitude must be −180…180 (or 0…360 east).");
    setErr(null);
    const L = normLon(lo);
    const site = siteContaining(sites.data, la, L);
    select({ lat: la, lon: L, siteId: site?.id ?? null, label: site ? site.name : `${formatLat(la, 2)}, ${formatLon(L, 2)}` });
  }

  return (
    <div className="flex h-full flex-col">
      <Section title="Coordinates" aside={<span className="text-[10.5px] text-faint">planetocentric · east +</span>}>
        <form onSubmit={goto} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="sr-only">Latitude</span>
              <input inputMode="decimal" placeholder="Lat °" value={lat} onChange={(e) => setLat(e.target.value)}
                className="num w-full rounded-md bg-space/70 px-2.5 py-1.5 text-[12.5px] ring-1 ring-line/70 outline-none placeholder:text-faint focus:ring-mars/50" />
            </label>
            <label className="block">
              <span className="sr-only">Longitude</span>
              <input inputMode="decimal" placeholder="Lon °E" value={lon} onChange={(e) => setLon(e.target.value)}
                className="num w-full rounded-md bg-space/70 px-2.5 py-1.5 text-[12.5px] ring-1 ring-line/70 outline-none placeholder:text-faint focus:ring-mars/50" />
            </label>
          </div>
          <Button type="submit" variant="outline" className="w-full"><Crosshair className="h-3.5 w-3.5" /> Fly to coordinate</Button>
          {err && <p className="text-[11.5px] text-bad">{err}</p>}
          <p className="text-[11px] leading-relaxed text-faint">Or click anywhere on the globe.</p>
        </form>
      </Section>

      <Section title="Study area" aside={<span className="text-[10.5px] text-faint">requested footprint</span>}>
        <Segmented ariaLabel="Analysis footprint" accent="mars" value={footprintKm}
          onChange={(v) => set({ footprintKm: v })}
          options={[...FOOTPRINTS.map((k) => ({ value: k, label: `${k} km` })), { value: -1 as number, label: "Custom", disabled: true, title: "Custom AOI polygons are planned for a later phase" }]} />
        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          A requested footprint is not a data resolution. Research analyses run on 25 km cells (tier 1) and 50 km windows (tier 2).
        </p>
      </Section>

      <Section title="Research sites" aside={<Chip>{sites.data?.length ?? "…"} EZs</Chip>} className="flex min-h-0 flex-1 flex-col">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter Exploration Zones" aria-label="Filter Exploration Zones"
            className="w-full rounded-md bg-space/70 py-1.5 pl-8 pr-2.5 text-[12.5px] ring-1 ring-line/70 outline-none placeholder:text-faint focus:ring-mars/50" />
        </div>
        {sites.isError && <Note tone="warning">Research sites unavailable — the scientific API is not reachable.</Note>}
        <ul className="scroll-thin -mx-2 min-h-0 flex-1 overflow-y-auto">
          {list.map((s) => {
            const on = selection?.siteId === s.id;
            return (
              <li key={s.id}>
                <button onClick={() => select({ lat: s.lat, lon: s.lon, siteId: s.id, label: s.name })}
                  className={cx("group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors", on ? "bg-mars/10" : "hover:bg-elevated")}>
                  <span className={cx("truncate text-[12.5px]", on ? "text-mars" : "text-ink/90")}>{s.name}</span>
                  <span className="num shrink-0 font-mono text-[10.5px] text-faint group-hover:text-muted">
                    {s.lat.toFixed(1)}, {s.lon.toFixed(1)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Eyebrow className="mt-3">Source</Eyebrow>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          NASA 2015 human-landing Exploration Zone footprints, as carried by the research package. Median MOLA observed-bin fraction {pct(median(sites.data?.map((s) => s.observed_fraction)))}.
        </p>
      </Section>
    </div>
  );
}

function median(v?: (number | null)[]) {
  const a = (v ?? []).filter((x): x is number => x !== null).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}
