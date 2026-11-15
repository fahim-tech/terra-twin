import { useEffect } from "react";
import { useGlobeBus } from "../../app/globeBus";
import type { Planet } from "../../globes/protocol";
import { gisApi, useGridInfo } from "../../services/gis";
import { useDataLayers } from "../../store/dataLayers";
import { useGlobes } from "../../store/globes";
import { dataLayerSpec } from "./model";

/**
 * Keeps one globe's gridded data layer in step with the DATA LAYERS control (store/dataLayers). `active` is
 * whether the control, and with it the layer's legend, is on screen: a layer is never drawn without its legend,
 * so the globe is cleared while the control is away (the choice is kept for when it returns).
 */
export function DataLayerSync({ planet, active }: { planet: Planet; active: boolean }) {
  const bus = useGlobeBus();
  const info = useGridInfo(planet, active);
  const layer = useDataLayers((s) => s.layer[planet]);
  const opacity = useDataLayers((s) => s.opacity[planet]);
  const ready = useGlobes((s) => s.ready[planet]);
  const spec = active && info.data ? dataLayerSpec(info.data, layer, opacity, gisApi.tileUrl) : null;
  const key = JSON.stringify(spec);
  useEffect(() => {
    if (!ready) return;
    bus.send(planet, { t: "setDataLayer", layer: spec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, planet, key, ready]);
  useEffect(() => () => bus.send(planet, { t: "setDataLayer", layer: null }), [bus, planet]);
  return null;
}
