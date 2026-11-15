/** Pure helpers behind the map instruments (scale bar, altitude, nearest supported site). */
import { distanceKm, R_MARS_M } from "./geodesy";

const NICE = [1, 2, 5];

/**
 * Pick a "nice" scale-bar length (1·2·5 × 10ⁿ metres) that fits within maxPx at the given ground
 * resolution. Returns null when the frame centre is off the planet.
 */
export function niceScale(metersPerPixel: number | null, maxPx = 120): { px: number; meters: number; label: string } | null {
  if (!metersPerPixel || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;
  const maxM = metersPerPixel * maxPx;
  const exp = Math.floor(Math.log10(maxM));
  let best = 0;
  for (let e = exp; e >= exp - 1 && !best; e--) {
    for (let i = NICE.length - 1; i >= 0; i--) {
      const m = NICE[i] * 10 ** e;
      if (m <= maxM) { best = m; break; }
    }
  }
  if (!best) return null;
  return { px: best / metersPerPixel, meters: best, label: best >= 1000 ? `${(best / 1000).toLocaleString("en-US")} km` : `${best} m` };
}

export function formatAltitude(heightKm: number | null | undefined): string {
  if (heightKm === null || heightKm === undefined || !Number.isFinite(heightKm)) return "—";
  if (heightKm >= 10_000) return `${(Math.round(heightKm / 100) * 100).toLocaleString("en-US")} km`;
  if (heightKm >= 100) return `${Math.round(heightKm).toLocaleString("en-US")} km`;
  if (heightKm >= 1) return `${heightKm.toFixed(1)} km`;
  return `${Math.round(heightKm * 1000)} m`;
}

export interface SiteLike { id: string; name: string; lat: number; lon: number }

/** Nearest research site on the Mars sphere, with great-circle distance in km. */
export function nearestSite<T extends SiteLike>(sites: T[] | undefined, lat: number, lon: number): { site: T; km: number } | null {
  if (!sites?.length) return null;
  let best: { site: T; km: number } | null = null;
  for (const s of sites) {
    const km = distanceKm(lat, lon, s.lat, s.lon, R_MARS_M);
    if (!best || km < best.km) best = { site: s, km };
  }
  return best;
}

/**
 * Mars Sol Date and Mars Coordinated Time (Allison & McEwen 2000; NASA GISS Mars24, algorithm AM2000).
 * `taiMinusUtc` is the leap-second count (37 s since 2017-01-01).
 */
export function marsTime(utcMs: number, taiMinusUtc = 37): { msd: number; mtcHours: number } {
  const jdUt = utcMs / 86_400_000 + 2_440_587.5;
  const jdTt = jdUt + (taiMinusUtc + 32.184) / 86_400;
  const msd = (jdTt - 2_451_545.0 - 4.5) / 1.0274912517 + 44_796.0 - 0.0009626;
  const mtcHours = (((24 * msd) % 24) + 24) % 24;
  return { msd, mtcHours };
}

/** hh:mm:ss from fractional hours. */
export function clock(hours: number): string {
  const total = Math.floor(hours * 3600 + 1e-6);
  const h = Math.floor(total / 3600) % 24, m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
