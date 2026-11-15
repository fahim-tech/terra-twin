import { describe, expect, it } from "vitest";
import { applyMask, dataLayerChange, hexRgb, isTileTemplate } from "./dataLayer";
import { CHANNEL, isEnvelope, wrap, type DataLayerSpec, type GlobeToParent, type ParentToGlobe } from "./protocol";
import { arcClearOfBox, ringArcs } from "./moons";

const spec: DataLayerSpec = { id: "mars:v:elevation_m", url: "/t/{z}/{x}/{y}.png?layer=elevation_m", maximumLevel: 6, tileSize: 256, alpha: 0.8 };

describe("data layer protocol", () => {
  it("carries set and clear in the shared envelope, and the new globe reports", () => {
    const msgs = [
      { t: "setDataLayer", layer: spec },
      { t: "setDataLayer", layer: { ...spec, mask: { url: "/t/{z}/{x}/{y}.png?layer=surface_class", keep: ["#c9b48a"] } } },
      { t: "setDataLayer", layer: null },
    ] satisfies ParentToGlobe[];
    const replies = [
      { t: "imagery", imagery: { mode: "fallback", layer: "viking_color", label: "Viking colour mosaic", note: "n", credit: "c" } },
      { t: "dataLayerStatus", id: spec.id, failures: 3 },
      // `ready` without `imagery` (older globes) still type-checks.
      { t: "ready", planet: "mars", mode: "fallback", layers: [], ellipsoid: "sphere" },
    ] satisfies GlobeToParent[];
    for (const msg of [...msgs, ...replies]) {
      const env = JSON.parse(JSON.stringify(wrap(msg)));
      expect(isEnvelope(env)).toBe(true);
      expect(env.channel).toBe(CHANNEL);
      expect(env.msg).toEqual(msg);
    }
  });

  it("tells an opacity change from a new layer", () => {
    expect(dataLayerChange(null, null)).toBe("none");
    expect(dataLayerChange(null, spec)).toBe("replace");
    expect(dataLayerChange(spec, null)).toBe("clear");
    expect(dataLayerChange(spec, { ...spec })).toBe("none");
    expect(dataLayerChange(spec, { ...spec, alpha: 0.4 })).toBe("alpha");
    expect(dataLayerChange(spec, { ...spec, url: "/t/{z}/{x}/{y}.png?layer=hurst_2pt" })).toBe("replace");
    expect(dataLayerChange(spec, { ...spec, mask: { url: "/m/{z}/{x}/{y}", keep: ["#000000"] } })).toBe("replace");
  });

  it("accepts only templates naming z, x and y once", () => {
    expect(isTileTemplate(spec.url)).toBe(true);
    expect(isTileTemplate("/t/{z}/{x}.png")).toBe(false);
  });

  it("clears pixels whose mask is not a kept colour or is transparent", () => {
    const data = new Uint8ClampedArray([10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255]);
    const mask = new Uint8ClampedArray([0xc9, 0xb4, 0x8a, 255, 0x0d, 0x2f, 0x4a, 255, 0xc9, 0xb4, 0x8a, 0]);
    expect(applyMask(data, mask, [hexRgb("#c9b48a")!])).toBe(1);
    expect([data[3], data[7], data[11]]).toEqual([255, 0, 0]);
    expect(hexRgb("#zzz")).toBeNull();
  });
});

describe("orbit arcs near the intro copy", () => {
  it("splits a closed ring into arcs that share their ends", () => {
    const ring = [0, 1, 2, 3, 4, 5, 6, 0];
    const arcs = ringArcs(ring, 3);
    expect(arcs).toEqual([[0, 1, 2, 3], [3, 4, 5, 6], [6, 0]]);
  });

  it("hides an arc through the copy box and fades it in with distance", () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 50 };
    expect(arcClearOfBox([{ x: 50, y: 25 }], box)).toBe(0);
    expect(arcClearOfBox([{ x: 116 + 24, y: 25 }], box)).toBeCloseTo(0.5);
    expect(arcClearOfBox([{ x: 400, y: 25 }], box)).toBe(1);
    expect(arcClearOfBox([{ x: 400, y: 25 }, null], null)).toBe(1);
  });
});
