/**
 * Clean captures for the location plates.
 *
 * A plate is captioned as NASA imagery with one frame drawn by the report, so nothing the globes draw for the
 * explorer may be baked into it: no data layers (similarity field, coverage raster, research-pool dots), no
 * markers or labels, no zone / AOI / candidate / member / comparison footprints, no graticule, no moon orbits.
 *
 * The globe hides all of that itself for the capture (snapshot `clean`) and shows it again exactly as it is
 * afterwards. Earlier the report emptied each drawing group by name and redrew it from app state, which meant
 * keeping a list of every group each sync draws in step by hand (and switching the Earth data layers off in
 * app state for the duration); the globe knows what it draws, so no list can fall out of step any more.
 *
 * The capture also settles on the globe's tile load queue rather than on fixed waits, completes any camera
 * flight in progress first (so there is no waiting for a still camera here), and is withdrawn — the reader's
 * view put back at once — as soon as `signal` aborts.
 */
import type { GlobeHandle, GlobeShot } from "../../globes/GlobeFrame";

export interface PlateShot {
  lat: number;
  lon: number;
  /** Camera height above the plate centre, km (nadir, north up). */
  heightKm: number;
  /** Width of the returned picture, px. */
  maxWidth: number;
}

/** Ask a globe for a clean capture; null when there is no globe, the capture failed, or it was withdrawn. */
export function capturePlate(handle: GlobeHandle | null | undefined, shot: PlateShot, signal: AbortSignal): Promise<GlobeShot | null> {
  if (!handle || signal.aborted) return Promise.resolve(null);
  return handle.snapshot(shot.lat, shot.lon, shot.heightKm, shot.maxWidth, { clean: true, signal }).catch(() => null);
}
