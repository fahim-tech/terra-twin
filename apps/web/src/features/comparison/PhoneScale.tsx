import type { Planet } from "../../globes/protocol";
import { niceScale } from "../../lib/instruments";
import { useGlobes } from "../../store/globes";
import { PlanetMark, PLANET_NAME } from "./marks";

/**
 * Phone scale instrument for the comparison. Phones show one globe at a time (the shell's Mars | Earth
 * switch), so it carries both planets' live scale bars, each marked with its planet: at the matched
 * comparison altitude they read the same, and zooming either globe shows at once. Sits just above
 * whatever covers the bottom of the frame (the strip, measured as insets) and clear of the imagery credit.
 */
export function PhoneScale() {
  // Both globe frames are full width on phones, so their insets agree; read one.
  const ins = useGlobes((s) => s.insets.earth);
  return (
    <div className="no-print on-imagery frame pointer-events-none absolute left-3 z-10 bg-[rgb(2_3_4/0.62)] px-2.5 pb-2 pt-1.5 [--frame-l:6px] transition-[bottom] duration-300 motion-reduce:transition-none"
      style={{ bottom: ins.bottom + 34 }}>
      <div aria-hidden className="kicker mb-1 !text-ink/65">Scale</div>
      <ScaleRow planet="mars" />
      <ScaleRow planet="earth" />
    </div>
  );
}

function ScaleRow({ planet }: { planet: Planet }) {
  const mpp = useGlobes((s) => s.camera[planet]?.metersPerPixel ?? null);
  const s = niceScale(mpp, 72);
  return (
    <div role="img" aria-label={s ? `${PLANET_NAME[planet]} scale bar ${s.label}` : `${PLANET_NAME[planet]} scale unavailable`} className="flex h-[18px] items-center gap-2">
      <PlanetMark planet={planet} />
      <span className="num w-[46px] text-num-sm text-ink">{s ? s.label : "—"}</span>
      {s && (
        // End ticks and a half-way tick, like the survey scale of the other views.
        <span aria-hidden className="relative block h-[5px] border-x border-b border-ink transition-[width] duration-200" style={{ width: `${s.px}px` }}>
          <span className="absolute bottom-0 left-1/2 h-[3px] w-px bg-ink/70" />
        </span>
      )}
    </div>
  );
}
