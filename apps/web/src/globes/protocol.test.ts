import { describe, expect, it } from "vitest";
import { CHANNEL, VIEW_NAMES, anchorPoint, isEnvelope, tiltAnnouncement, viewName, wrap, type AnchorPosition, type GlobeToParent, type ParentToGlobe } from "./protocol";

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

  it("carries snapshot cancellation and the clean, settled capture in the shared envelope", () => {
    const msgs = [
      { t: "snapshot", requestId: "mars-1", lat: 17.7, lon: 77, heightKm: 420, maxWidth: 800, clean: true },
      { t: "cancelSnapshot", requestId: "mars-1" },
      { t: "setLight", mode: "intro" },
      { t: "setTilt", on: false, turn: false },
      { t: "flyTo", lat: 1, lon: 2, heightKm: 300, tilt: true },
      { t: "setGroupShown", kind: "footprints", group: "zones", on: false },
    ] satisfies ParentToGlobe[];
    const replies = [
      { t: "snapshot", requestId: "mars-1", dataUrl: "data:image/jpeg;base64,x", width: 800, height: 473, imagery: "complete" },
      { t: "snapshot", requestId: "mars-2", dataUrl: null, width: 0, height: 0, cancelled: true },
      { t: "tilt", on: true, turned: false },
    ] satisfies GlobeToParent[];
    for (const msg of [...msgs, ...replies]) {
      const env = JSON.parse(JSON.stringify(wrap(msg)));
      expect(isEnvelope(env)).toBe(true);
      expect(env.msg).toEqual(msg);
    }
  });

  it("keeps the older forms valid: a snapshot without `clean`, a reply without `imagery`, a tilt event without `turned`", () => {
    const old = [
      { t: "snapshot", requestId: "earth-3", lat: 0, lon: 0, heightKm: 420 },
      { t: "setTilt", on: true },
      { t: "flyTo", lat: 0, lon: 0 },
    ] satisfies ParentToGlobe[];
    const oldReplies = [
      { t: "snapshot", requestId: "earth-3", dataUrl: null, width: 0, height: 0, error: "viewer not ready" },
      { t: "tilt", on: false },
    ] satisfies GlobeToParent[];
    expect(old).toHaveLength(3);
    expect(oldReplies).toHaveLength(2);
    // A tilt event without `turned` reads as a view that did turn.
    expect(tiltAnnouncement(false)).toBe("Top-down view");
  });

  it("says when the 3D choice could not turn the view and holds for the next site flight", () => {
    expect(tiltAnnouncement(true, true)).toBe("3D view");
    const held = tiltAnnouncement(true, false);
    expect(held.startsWith("3D view applies from the next site flight")).toBe(true);
    expect(held).toContain("no ground under the centre of the view");
  });
});
