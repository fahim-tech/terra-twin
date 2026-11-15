import { describe, expect, it } from "vitest";
import type { GlobeHandle, SnapshotOptions } from "../../globes/GlobeFrame";
import type { ParentToGlobe } from "../../globes/protocol";
import { capturePlate } from "./plateCapture";

/** A globe handle that records what it is asked for and answers when told to. */
function fakeGlobe() {
  const calls: { args: [number, number, number, number | undefined]; opts: SnapshotOptions | undefined }[] = [];
  const sent: ParentToGlobe[] = [];
  let answer: ((v: { dataUrl: string; width: number; height: number } | null) => void) | null = null;
  const handle: GlobeHandle = {
    send: (m) => { sent.push(m); },
    snapshot: (lat, lon, heightKm, maxWidth, opts) => {
      calls.push({ args: [lat, lon, heightKm, maxWidth], opts });
      return new Promise((resolve) => {
        answer = resolve;
        opts?.signal?.addEventListener("abort", () => resolve(null));
      });
    },
  };
  return { handle, calls, sent, answer: (v: { dataUrl: string; width: number; height: number } | null) => answer?.(v) };
}

const shot = { lat: 17.6756, lon: 77.0127, heightKm: 420, maxWidth: 800 };

describe("clean plate captures", () => {
  it("asks the globe for a clean nadir capture: the globe hides everything the app draws, so no group list can drift", async () => {
    const g = fakeGlobe();
    const ctl = new AbortController();
    const p = capturePlate(g.handle, shot, ctl.signal);
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].args).toEqual([17.6756, 77.0127, 420, 800]);
    expect(g.calls[0].opts?.clean).toBe(true);
    expect(g.calls[0].opts?.signal).toBe(ctl.signal);
    // No drawing group is emptied or redrawn by the report any more.
    expect(g.sent).toEqual([]);
    g.answer({ dataUrl: "data:image/jpeg;base64,x", width: 800, height: 473 });
    expect(await p).toEqual({ dataUrl: "data:image/jpeg;base64,x", width: 800, height: 473 });
  });

  it("withdraws the capture when the reader leaves while it renders", async () => {
    const g = fakeGlobe();
    const ctl = new AbortController();
    const p = capturePlate(g.handle, shot, ctl.signal);
    ctl.abort();
    expect(await p).toBeNull();
  });

  it("never touches a globe for a capture already withdrawn, or without a globe", async () => {
    const g = fakeGlobe();
    const ctl = new AbortController();
    ctl.abort();
    expect(await capturePlate(g.handle, shot, ctl.signal)).toBeNull();
    expect(g.calls).toHaveLength(0);
    expect(await capturePlate(null, shot, new AbortController().signal)).toBeNull();
  });

  it("turns a failed capture into no imagery rather than an error", async () => {
    const handle: GlobeHandle = { send: () => {}, snapshot: () => Promise.reject(new Error("context lost")) };
    expect(await capturePlate(handle, shot, new AbortController().signal)).toBeNull();
  });
});
