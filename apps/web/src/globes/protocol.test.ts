import { describe, expect, it } from "vitest";
import { CHANNEL, VIEW_NAMES, anchorPoint, isEnvelope, viewName, wrap, type AnchorPosition, type GlobeToParent, type ParentToGlobe } from "./protocol";

describe("globe protocol", () => {
  it("carries the tilt command and event in the shared envelope", () => {
    const cmd = { t: "setTilt", on: true } satisfies ParentToGlobe;
    const evt = { t: "tilt", on: false } satisfies GlobeToParent;
    for (const msg of [cmd, evt]) {
      const env = JSON.parse(JSON.stringify(wrap(msg))); // what postMessage's structured clone preserves
      expect(isEnvelope(env)).toBe(true);
      expect(env.channel).toBe(CHANNEL);
      expect(env.msg).toEqual(msg);
    }
    expect(isEnvelope({ channel: "other", msg: cmd })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });

  it("keeps older messages valid: anchors without a stem top still parse", () => {
    const old: AnchorPosition = { id: "selection", x: 10, y: 20, visible: true };
    expect(anchorPoint(old)).toEqual({ x: 10, y: 20, glyph: false });
  });

  it("starts a label's leader at the stem top when the globe reports one", () => {
    const a: AnchorPosition = { id: "selection", x: 400, y: 300, visible: true, top: { x: 402, y: 271 } };
    expect(anchorPoint(a)).toEqual({ x: 402, y: 271, glyph: true });
  });

  it("names the two views consistently", () => {
    expect(viewName(true)).toBe("3D view");
    expect(viewName(false)).toBe("Top-down view");
    expect(VIEW_NAMES).toEqual({ tilted: "3D view", topDown: "Top-down view" });
  });
});
