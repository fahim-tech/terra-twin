import { ScaleBar } from "../../components/map/Instruments";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useGlobes } from "../../store/globes";
import { WHY_DRAWER_MAX_PX } from "./layout";
import type { CompareTargets } from "./model";

/**
 * Location plates over each half of the split view: planet kicker, toponym, coordinates and what the
 * white square is, plus a live scale bar each so ground scale can be read off both globes.
 */
export function ComparePlates({ targets, planets, whyOpen = false }: { targets: CompareTargets; planets: Planet[]; whyOpen?: boolean }) {
  const half = planets.length === 2;
  return (
    <>
      {planets.map((p) => (
        <div key={p} className={cx("pointer-events-none absolute inset-y-0 z-10", half ? "w-1/2" : "w-full", p === "mars" || !half ? "left-0" : "right-0")}>
          <Plate planet={p} targets={targets} drawerOpen={whyOpen && p === "earth"} />
          <Scale planet={p} />
        </div>
      ))}
    </>
  );
}

function Plate({ planet, targets, drawerOpen }: { planet: Planet; targets: CompareTargets; drawerOpen: boolean }) {
  const t = planet === "mars" ? targets.mars : targets.earth;
  const sub = planet === "earth" ? targets.earth.sub : null;
  // With the Why drawer open the Earth plate wraps inside the part of the half the drawer leaves free.
  const maxWidth = drawerOpen ? `min(320px, calc(100% - min(${WHY_DRAWER_MAX_PX}px, 200% - 24px) - 44px))` : undefined;
  return (
    // Labels on a basalt plate (not a scrim), so they stay legible over bright terrain and clouds.
    <section aria-label={`${planet === "mars" ? "Mars" : "Earth"} location`} style={{ maxWidth }}
      className="surface absolute left-4 top-4 w-max max-w-[min(320px,calc(100%-32px))] rounded-surface px-3.5 py-3">
      <div className="flex items-center gap-2 text-kicker font-semibold uppercase tracking-[0.08em] text-muted">
        <span aria-hidden className={cx("h-2 w-2 rounded-full", planet === "mars" ? "bg-mars" : "bg-earth")} />
        {planet === "mars" ? "Mars" : "Earth"}
      </div>
      <div className="toponym mt-1 text-toponym-sm text-ink">{t.name}</div>
      <div className="num mt-1 text-num-sm text-ink">{formatLat(t.lat, 3)} {formatLon(t.lon, 3)}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-caption text-muted">
        <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] border border-ink" />
        <span>{t.footprint}</span>
      </div>
      {sub && <div className="mt-1 line-clamp-2 text-caption text-faint" title={sub}>{sub}</div>}
    </section>
  );
}

function Scale({ planet }: { planet: Planet }) {
  const ins = useGlobes((s) => s.insets[planet]);
  return (
    <div className="on-imagery absolute left-5 transition-[bottom] duration-300 motion-reduce:transition-none" style={{ bottom: ins.bottom + 16 }}>
      <ScaleBar planet={planet} />
    </div>
  );
}
