import type { DataLayerSpec } from "../../globes/protocol";
import type { GridInfo, GridLayer } from "../../services/gis";

/**
 * Pure logic behind the DATA LAYERS control: grouping the grid's layers as the payload states them, the legend
 * each layer gets (a ramp with its stretch, or class swatches) and the tile spec sent to the globe. Nothing here
 * invents a value: every label, unit, stretch and class comes from the grid's info payload.
 */

export type LayerGroup = GridLayer["group"];

/** Group headings, and what each group is (and is not) for. */
export const GROUP_COPY: Record<LayerGroup, { title: string; note?: string }> = {
  terrain: { title: "Terrain" },
  support: { title: "Observation support", note: "Metadata: never a weight or a confidence." },
  surface: { title: "Surface" },
};

const GROUP_ORDER: LayerGroup[] = ["terrain", "support", "surface"];

/** The payload's layers by group, in a fixed group order and the payload's own order within a group; empty groups left out. */
export function groupLayers(layers: readonly GridLayer[]): { group: LayerGroup; layers: GridLayer[] }[] {
  return GROUP_ORDER.map((group) => ({ group, layers: layers.filter((l) => l.group === group) })).filter((g) => g.layers.length > 0);
}

/** Digits for a stretch end so the two ends read at the precision their span needs (never more than 2). */
export function stretchDigits(min: number, max: number): number {
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span === 0) return 2;
  if (span >= 100) return 0;
  if (span >= 10) return 1;
  return 2;
}

/** A number as the legend prints it: grouped thousands, a true minus sign. */
export function legendNumber(v: number, digits: number): string {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return v < 0 && Number(s.replace(/,/g, "")) !== 0 ? `−${s}` : s;
}

export type Legend =
  | { kind: "ramp"; gradient: string; min: string; max: string; units: string | null; basis: string }
  | { kind: "classes"; classes: { value: number; label: string; color: string }[]; units: string | null }
  | { kind: "none" };

/** The legend for a layer as its payload describes it; "none" when the payload has neither a stretch with a palette nor classes. */
export function legendFor(layer: GridLayer): Legend {
  if (layer.kind === "categorical" && layer.classes?.length) {
    return { kind: "classes", classes: [...layer.classes].sort((a, b) => a.value - b.value), units: layer.units };
  }
  if (layer.stretch && layer.palette?.stops.length) {
    const d = stretchDigits(layer.stretch.min, layer.stretch.max);
    const stops = layer.palette.stops.map(([at, c]) => `${c} ${(at * 100).toFixed(2)}%`).join(", ");
    return {
      kind: "ramp", gradient: `linear-gradient(90deg, ${stops})`,
      min: legendNumber(layer.stretch.min, d), max: legendNumber(layer.stretch.max, d),
      units: layer.units, basis: layer.stretch.basis,
    };
  }
  return { kind: "none" };
}

/** The unit as a short suffix after a figure: the leading token of the payload's units ("m (EGM96 …)" → "m"); none for "1" and "class". */
export function unitSuffix(units: string | null | undefined): string {
  if (!units) return "";
  const head = units.split(" (")[0].trim();
  return head === "1" || head === "class" || head === "bit field" ? "" : head;
}

/**
 * Earth terrain layers are drawn over land cells only. The grid stores ocean cells' elevation as 0 (the
 * surface class says "ocean"); drawn as is, every ocean would read as land at 0 m. The mask is the grid's own
 * surface-class layer, keeping the colour of its class labelled "land". Null for Mars, for non-terrain layers,
 * and when the payload has no such class to mask by.
 */
export function landMask(info: GridInfo, layer: GridLayer, tileUrl: (info: GridInfo, layer: string) => string): { url: string; keep: string[] } | null {
  if (info.planet !== "earth" || layer.group !== "terrain") return null;
  const surface = info.layers.find((l) => l.name === "surface_class" && l.kind === "categorical");
  const land = surface?.classes?.find((c) => c.label.trim().toLowerCase() === "land");
  return surface && land ? { url: tileUrl(info, surface.name), keep: [land.color] } : null;
}

/** The tile spec the globe draws for a layer of this grid (null when the layer is not in the payload). */
export function dataLayerSpec(info: GridInfo, layer: string | null, opacity: number, tileUrl: (info: GridInfo, layer: string) => string): DataLayerSpec | null {
  const def = layer ? info.layers.find((l) => l.name === layer) : undefined;
  if (!layer || !def) return null;
  const mask = landMask(info, def, tileUrl);
  return {
    id: `${info.planet}:${info.version}:${layer}`,
    url: tileUrl(info, layer),
    maximumLevel: info.max_level,
    tileSize: info.tile_size,
    alpha: Math.min(1, Math.max(0, opacity)),
    ...(mask ? { mask } : {}),
  };
}

/** The grid's cell spacing as the payload states it: "0.015625°" from degrees per cell or "30″" from arc-seconds; null when it says neither. */
export function cellSpacing(info: GridInfo): string | null {
  const g = (info as { grid?: { degrees_per_cell?: unknown; arcsec_per_cell?: unknown } }).grid;
  if (typeof g?.degrees_per_cell === "number") return `${g.degrees_per_cell}°`;
  if (typeof g?.arcsec_per_cell === "number") return `${g.arcsec_per_cell}″`;
  return null;
}

/**
 * The surface class of a grid point: the payload's label, else the class list's label for its value. `land` is
 * true only for the class labelled "land": only then are terrain descriptors read (an ocean cell's stored
 * elevation of 0 is not a terrain value).
 */
export function pointSurface(values: Record<string, number | string | null>, label: string | null | undefined, info: GridInfo | undefined): { label: string | null; land: boolean } {
  const v = values.surface_class;
  const fromInfo = typeof v === "number" ? info?.layers.find((l) => l.name === "surface_class")?.classes?.find((c) => c.value === v)?.label ?? null : null;
  const name = label ?? fromInfo;
  return { label: name, land: !!name && name.trim().toLowerCase() === "land" };
}

/** Terrain descriptors of a land point, labelled from the grid's info payload, in its layer order; values never invented (null stays null). */
export function pointTerrain(values: Record<string, number | string | null>, units: Record<string, string>, info: GridInfo | undefined): { key: string; label: string; value: number | null; unit: string; units: string | null }[] {
  const terrain = info?.layers.filter((l) => l.group === "terrain") ?? [];
  return terrain.map((l) => {
    const v = values[l.name];
    return { key: l.name, label: l.label, value: typeof v === "number" && Number.isFinite(v) ? v : null, unit: unitSuffix(units[l.name] ?? l.units), units: units[l.name] ?? l.units };
  });
}

/** Digits a grid or context figure is printed with, by its unit. */
export function figureDigits(unit: string, value: number): number {
  if (unit === "deg") return 1;
  if (unit === "m" || unit === "%") return Math.abs(value) >= 100 || unit === "%" ? 0 : 1;
  return Math.abs(value) >= 10 ? 1 : Math.abs(value) >= 1 ? 2 : 3;
}

/** The grid's flags payload as a list ordered by bit value. */
export function flagList(flags: Record<string, string> | null): { bit: number; text: string }[] {
  if (!flags) return [];
  return Object.entries(flags).map(([k, text]) => ({ bit: Number(k), text })).filter((f) => Number.isFinite(f.bit)).sort((a, b) => a.bit - b.bit);
}
