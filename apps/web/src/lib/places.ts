/**
 * Approximate place names for a few Earth windows that the published discovery runs return, read from their
 * coordinates by the team. They are annotations for orientation only: not from the data, never used in any
 * measurement, and shown as approximate. A window with no entry keeps its coordinates alone.
 */
const PLACES: { lat: number; lon: number; place: string; region: string }[] = [
  { lat: 37.06, lon: 86.21, place: "Kunlun–Altun mountain belt, south rim of the Tarim Basin", region: "Xinjiang, China" },
  { lat: 37.29, lon: 97.51, place: "North-eastern Qaidam Basin near Delingha", region: "Qinghai, China" },
  { lat: 32.79, lon: 88.13, place: "Changtang, northern Tibetan Plateau", region: "Tibet, China" },
  { lat: 31.21, lon: -6.36, place: "Southern High Atlas", region: "Morocco" },
  { lat: 21.11, lon: 18.49, place: "Tibesti Mountains", region: "Chad" },
  { lat: 38.19, lon: -117.88, place: "West-central Nevada", region: "USA" },
  { lat: 52.79, lon: -124.88, place: "Chilcotin Plateau", region: "British Columbia, Canada" },
];
export const PLACE_NOTE = "Approximate place, read from the coordinates by the team (not from the data).";

/** The annotated place within about 15 km of a window centre, or null. */
export function placeNear(lat: number, lon: number): { place: string; region: string; text: string } | null {
  const p = PLACES.find((x) => Math.abs(x.lat - lat) < 0.15 && Math.abs(x.lon - lon) < 0.15);
  return p ? { place: p.place, region: p.region, text: `${p.place}, ${p.region}` } : null;
}
