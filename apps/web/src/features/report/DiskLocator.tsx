import { motion } from "motion/react";
import { useMemo } from "react";
import { cx } from "../../components/ui";
import type { Planet } from "../../globes/protocol";
import { fmtLat, fmtLon } from "./model";
import { type Body, diskCrop, plateCamera } from "./plateGeometry";

type Shot = { dataUrl: string; width: number; height: number };
type ShotState = { status: "loading" } | { status: "ok"; shot: Shot } | { status: "failed" };

/**
 * Whole-disk locator: the same globe seen straight down on the plate centre from far enough out to show the
 * whole planet — the lit 3D body with its limb — and the plate's footprint marked to scale at the centre.
 * Placed by the plate camera model (plateGeometry.ts), so the framing is exact for any canvas shape. Until
 * the render arrives the box holds a hairline circle where the limb will be; it never shows other imagery.
 */
export function DiskLocator({ planet, body, lat, lon, heightKm, snapshot, plateKm, className }: {
  planet: Planet; body: Body; lat: number; lon: number; heightKm: number; snapshot: ShotState; plateKm: { w: number; h: number }; className?: string;
}) {
  const name = planet === "mars" ? "Mars" : "Earth";
  const shot = snapshot.status === "ok" ? snapshot.shot : null;
  const crop = useMemo(
    () => (shot ? diskCrop(plateCamera(body, lat, lon, heightKm, shot.width, shot.height), plateKm) : null),
    [shot, body, lat, lon, heightKm, plateKm.w, plateKm.h], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const km = Math.round(heightKm).toLocaleString("en-US");
  // Box units (0..100): plate square at the centre (at least visible), gapped reticle arms around it.
  const half = crop ? Math.max(1.2, crop.plate.w / 2) : 0;
  const halfH = crop ? Math.max(1.2, crop.plate.h / 2) : 0;
  const arms = crop ? ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).map(([dx, dy]) => {
    const from = (dx ? half : halfH) + 3;
    return { k: `${dx}${dy}`, x1: 50 + dx * from, y1: 50 + dy * from, x2: 50 + dx * (from + 7), y2: 50 + dy * (from + 7) };
  }) : [];

  return (
    <figure className={cx("m-0 w-[84px] md:w-[96px] print:w-[84px]", className)}>
      {/* A soft edge just outside the limb lets the render's own black sky meet the page. */}
      <div className="relative aspect-square w-full overflow-hidden [print-color-adjust:exact]"
        style={{ maskImage: "radial-gradient(circle closest-side, #000 93%, transparent 100%)", WebkitMaskImage: "radial-gradient(circle closest-side, #000 93%, transparent 100%)" }}>
        {shot && crop ? (
          <>
            {/* Cross-fade only (kept under reduced motion). */}
            <motion.img src={shot.dataUrl}
              alt={`${name}, whole disk, seen from ${km} km straight above ${fmtLat(lat, 2)} ${fmtLon(lon, 2)}; the small square marks the plate. Lighting is for legibility, not the Sun's position.`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute max-w-none select-none"
              style={{ left: `${crop.img.left}%`, top: `${crop.img.top}%`, width: `${crop.img.width}%`, height: `${crop.img.height}%` }} />
            <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full">
              <g fill="none" strokeLinecap="square">
                <g stroke="rgb(0 0 0 / .6)" strokeWidth={3}>
                  <rect x={50 - half} y={50 - halfH} width={2 * half} height={2 * halfH} vectorEffect="non-scaling-stroke" />
                  {arms.map((a) => <line key={a.k} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} vectorEffect="non-scaling-stroke" />)}
                </g>
                <g stroke="#fff" strokeWidth={1}>
                  <rect x={50 - half} y={50 - halfH} width={2 * half} height={2 * halfH} vectorEffect="non-scaling-stroke" />
                  {arms.map((a) => <line key={a.k} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} vectorEffect="non-scaling-stroke" />)}
                </g>
              </g>
            </svg>
          </>
        ) : (
          <>
            <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full text-line-strong">
              <circle cx="50" cy="50" r={50 / 1.1} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="sr-only" role="status">Rendering the {name} whole disk</span>
          </>
        )}
      </div>
      <figcaption aria-hidden className="mt-1 text-center text-[9.5px] font-semibold uppercase leading-none tracking-[0.14em] text-faint">Whole disk</figcaption>
    </figure>
  );
}
