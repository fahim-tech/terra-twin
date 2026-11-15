/** Planet geodesy helpers. Kept explicit: Mars never goes through Earth (WGS84) formulas. */

export const R_MARS_M = 3_396_190; // IAU 2000 sphere used by the MOLA mosaic and the research code
export const MARS_IAU2000 = { a: 3_396_190, b: 3_376_200 }; // Cesium Ellipsoid.MARS radii
export const R_EARTH_MEAN_M = 6_371_008.8;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Planetographic (geodetic) latitude on an ellipsoid → planetocentric latitude. */
export function graphicToCentric(latDeg: number, a: number, b: number): number {
  if (Math.abs(latDeg) >= 90) return latDeg;
  return Math.atan(((b * b) / (a * a)) * Math.tan(latDeg * D2R)) * R2D;
}

/** Planetocentric latitude → planetographic (geodetic) latitude on an ellipsoid. */
export function centricToGraphic(latDeg: number, a: number, b: number): number {
  if (Math.abs(latDeg) >= 90) return latDeg;
  return Math.atan(((a * a) / (b * b)) * Math.tan(latDeg * D2R)) * R2D;
}

export function normLon(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return l === -180 && lon > 0 ? 180 : l;
}

/** Great-circle destination on a sphere of radius R. */
export function destination(lat: number, lon: number, bearingDeg: number, distM: number, R: number) {
  const d = distM / R;
  const b = bearingDeg * D2R;
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * R2D, lon: normLon(l2 * R2D) };
}

/** Corners (lat, lon) of a square of side `km` centred on a point, approximating a local AEQD window. */
export function squareFootprint(lat: number, lon: number, km: number, R: number) {
  const h = (km * 1000) / 2;
  const diag = Math.SQRT2 * h;
  return [45, 135, 225, 315].map((brg) => destination(lat, lon, brg, diag, R));
}

export function formatLat(lat: number, digits = 3) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}`;
}
export function formatLon(lon: number, digits = 3) {
  return `${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Haversine distance in km on a sphere. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number, R: number) {
  const dp = (lat2 - lat1) * D2R;
  const dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dl / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(a))) / 1000;
}
