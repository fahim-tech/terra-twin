import { describe, expect, it } from "vitest";
import { createCaptureQueue } from "./captureQueue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("capture queue", () => {
  it("runs captures on one globe strictly one after another, in the order asked", async () => {
    const q = createCaptureQueue();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    q.want("plate");
    q.want("disk");
    const a = q.run("mars", "plate", async () => { log.push("plate:start"); await gate; log.push("plate:end"); return 1; });
    const b = q.run("mars", "disk", async () => { log.push("disk:start"); return 2; });
    await tick();
    expect(log).toEqual(["plate:start"]);
    release();
    expect(await a).toBe(1);
    expect(await b).toBe(2);
    expect(log).toEqual(["plate:start", "plate:end", "disk:start"]);
  });

  it("keeps the two globes independent", async () => {
    const q = createCaptureQueue();
    q.want("m");
    q.want("e");
    const log: string[] = [];
    const blocked = q.run("mars", "m", () => new Promise<number>(() => { log.push("mars"); }));
    void blocked;
    const earth = q.run("earth", "e", async () => { log.push("earth"); return 3; });
    expect(await earth).toBe(3);
    expect(log).toEqual(["mars", "earth"]);
  });

  it("skips a capture nobody waits for any more, without touching the globe", async () => {
    const q = createCaptureQueue();
    const release = q.want("disk");
    let ran = false;
    let open!: () => void;
    const first = new Promise<void>((r) => { open = r; });
    q.want("plate");
    void q.run("mars", "plate", () => first);
    const disk = q.run("mars", "disk", async () => { ran = true; return 1; });
    release(); // the reader leaves before the locator's turn
    open();
    expect(await disk).toBeNull();
    expect(ran).toBe(false);
  });

  it("skips a capture when its precondition fails at its turn (the report is no longer on screen)", async () => {
    const q = createCaptureQueue();
    q.want("k");
    let onReport = true;
    let open!: () => void;
    const first = new Promise<void>((r) => { open = r; });
    void q.run("earth", "x", () => first);
    let ran = false;
    const p = q.run("earth", "k", async () => { ran = true; return 1; }, () => onReport);
    onReport = false;
    open();
    expect(await p).toBeNull();
    expect(ran).toBe(false);
  });

  it("counts interest per capture and survives a double release", () => {
    const q = createCaptureQueue();
    const a = q.want("k");
    const b = q.want("k");
    a();
    a();
    expect(q.wanted("k")).toBe(true);
    b();
    expect(q.wanted("k")).toBe(false);
  });

  it("carries on after a failed capture", async () => {
    const q = createCaptureQueue();
    q.want("a");
    q.want("b");
    const a = q.run("mars", "a", async () => { throw new Error("tiles"); });
    const b = q.run("mars", "b", async () => 2);
    await expect(a).rejects.toThrow("tiles");
    expect(await b).toBe(2);
  });
});
