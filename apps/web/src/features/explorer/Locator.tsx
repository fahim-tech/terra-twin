import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { graticulePaths, orthographic } from "./readouts";

type View = { lat0: number; lon0: number };

/** The disc faces the point's longitude, tilted half-way towards its latitude, so north stays up. */
const viewFor = (lat: number, lon: number): View => ({ lat0: Math.max(-40, Math.min(40, lat / 2)), lon0: lon });

/**
 * Where on Mars, at a glance: a small orthographic disc with a 30° graticule, the research zone centres as
 * faint ticks and the point as a square. When the point changes, the disc turns to it on a critically
 * damped spring (a cut under reduced motion). Geometry only — no imagery and nothing estimated.
 */
export function Locator({ lat, lon, zones, size = 48 }: { lat: number; lon: number; zones?: { id: string; lat: number; lon: number }[]; size?: number }) {
  const r = size / 2 - 1;
  const reduced = useReducedMotion();
  const target = viewFor(lat, lon);
  const [view, setView] = useState<View>(target);
  const shown = useRef(view);
  useEffect(() => {
    const from = shown.current;
    // Shortest way round in longitude.
    const dLon = ((target.lon0 - from.lon0 + 540) % 360) - 180;
    if (reduced || (Math.abs(dLon) < 1e-6 && Math.abs(target.lat0 - from.lat0) < 1e-6)) {
      shown.current = target;
      setView(target);
      return;
    }
    // Critically damped, in the UI spring range of the motion spec (bounce 0, 0.3–0.4 s).
    const controls = animate(0, 1, {
      type: "spring", bounce: 0, duration: 0.4,
      onUpdate: (t) => {
        const v = { lat0: from.lat0 + (target.lat0 - from.lat0) * t, lon0: from.lon0 + dLon * t };
        shown.current = v;
        setView(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.lat0, target.lon0, reduced]);

  const grid = useMemo(() => graticulePaths(view.lat0, view.lon0, r, 30), [view.lat0, view.lon0, r]);
  const p = orthographic(lat, lon, view.lat0, view.lon0, r);
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden className="block overflow-visible">
      <circle r={r} fill="rgb(2 3 4 / 0.6)" />
      {grid.map((d, i) => <path key={i} d={d} fill="none" stroke="rgb(242 244 245 / 0.16)" strokeWidth={0.6} />)}
      <circle r={r} fill="none" stroke="rgb(242 244 245 / 0.38)" strokeWidth={0.9} />
      {zones?.map((z) => {
        const q = orthographic(z.lat, z.lon, view.lat0, view.lon0, r);
        return q.front ? <rect key={z.id} x={q.x - 0.9} y={-q.y - 0.9} width={1.8} height={1.8} fill="rgb(236 127 83 / 0.55)" /> : null;
      })}
      {p.front && <rect x={p.x - 2.5} y={-p.y - 2.5} width={5} height={5} fill="var(--color-mars)" stroke="var(--color-space)" strokeWidth={0.75} />}
    </svg>
  );
}
