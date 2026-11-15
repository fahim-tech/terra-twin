import { describe, expect, it } from "vitest";
import { SETTLE_START, SNAPSHOT_SETTLE, type SettleState, captureSse, serialRunner, settleStep } from "./capture";

/** Feed a run of frames (true = tile queue empty after that render) through the settle rule. */
function settle(frames: boolean[], msPerFrame = 16) {
  let s: SettleState = SETTLE_START;
  for (let i = 0; i < frames.length; i++) {
    const r = settleStep(s, frames[i], (i + 1) * msPerFrame);
    s = r.state;
    if (r.verdict !== "wait") return { verdict: r.verdict, frame: i + 1 };
  }
  return { verdict: "wait" as const, frame: frames.length };
}

describe("snapshot settling", () => {
  it("takes the picture once the tile queue has stayed empty for two renders of the new view", () => {
    expect(settle([false, false, false, true, true])).toEqual({ verdict: "loaded", frame: 5 });
    // Already loaded (tiles cached): two renders, no fixed wait.
    expect(settle([true, true])).toEqual({ verdict: "loaded", frame: 2 });
  });

  it("does not trust one empty reading between levels of refinement", () => {
    // A tile finishes (queue empty), then the next selection asks for its children.
    expect(settle([false, true, false, true, false, true, true])).toEqual({ verdict: "loaded", frame: 7 });
  });

  it("gives up waiting at the bound and says so", () => {
    const frames = Array.from({ length: 1000 }, () => false);
    const r = settle(frames, 16);
    expect(r.verdict).toBe("timeout");
    expect(r.frame * 16).toBeGreaterThanOrEqual(SNAPSHOT_SETTLE.timeoutMs);
    expect(r.frame * 16).toBeLessThan(SNAPSHOT_SETTLE.timeoutMs + 16);
  });
});

describe("capture tile detail", () => {
  it("loads tiles only as fine as the scaled-down picture can show", () => {
    // 1440 px canvas → 800 px plate: the error allowed on the canvas grows by 1440 / 800.
    expect(captureSse(1.6, 1440, 800)).toBeCloseTo(1.6 * (1440 / 800), 9);
    // A picture as wide as the canvas (or wider) needs the working detail.
    expect(captureSse(1.6, 800, 800)).toBe(1.6);
    expect(captureSse(1.6, 390, 800)).toBe(1.6);
  });

  it("stays within sane bounds", () => {
    expect(captureSse(1.6, 4000, 100)).toBe(8);
    expect(captureSse(1.6, 0, 800)).toBe(1.6);
    expect(captureSse(1.6, 1440, 0)).toBe(1.6);
  });
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("one capture at a time, withdrawable", () => {
  function setup() {
    const log: string[] = [];
    const dropped: string[] = [];
    const gates = new Map<string, () => void>();
    const runner = serialRunner<{ id: string }>((job, signal) => new Promise<void>((resolve) => {
      log.push(`${job.id}:start`);
      const end = (how: string) => { log.push(`${job.id}:${how}`); resolve(); };
      gates.set(job.id, () => end("done"));
      signal.addEventListener("abort", () => end("withdrawn"));
    }), (job) => dropped.push(job.id));
    return { runner, log, dropped, finish: (id: string) => gates.get(id)?.() };
  }

  it("runs captures strictly in order", async () => {
    const { runner, log, finish } = setup();
    runner.add({ id: "plate" });
    runner.add({ id: "disk" });
    expect(runner.running).toBe("plate");
    expect(runner.pending).toBe(1);
    finish("plate");
    await tick();
    expect(runner.running).toBe("disk");
    finish("disk");
    await tick();
    expect(log).toEqual(["plate:start", "plate:done", "disk:start", "disk:done"]);
    expect(runner.running).toBeNull();
  });

  it("drops a queued capture without running it, and stops a running one at once", async () => {
    const { runner, log, dropped } = setup();
    runner.add({ id: "plate" });
    runner.add({ id: "disk" });
    expect(runner.cancel("disk")).toBe("queued");
    expect(dropped).toEqual(["disk"]);
    expect(runner.cancel("plate")).toBe("running");
    await tick();
    expect(log).toEqual(["plate:start", "plate:withdrawn"]);
    expect(runner.cancel("plate")).toBeNull(); // already answered
  });

  it("keeps going after a capture that throws", async () => {
    const order: string[] = [];
    const runner = serialRunner<{ id: string }>(async (job) => {
      order.push(job.id);
      if (job.id === "bad") throw new Error("context lost");
    }, () => {});
    runner.add({ id: "bad" });
    runner.add({ id: "good" });
    await tick();
    await tick();
    expect(order).toEqual(["bad", "good"]);
  });
});
