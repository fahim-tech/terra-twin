/**
 * The globe's snapshot pipeline as plain logic (no Cesium), so it can be tested: captures run one at a time and
 * can be withdrawn, a capture settles when the tile load queue is empty rather than after a fixed wait, and the
 * tile detail a capture needs follows the size of the picture it returns.
 */

/**
 * When a capture's picture is taken: once the new view has rendered `minFrames` times and the globe's tile load
 * queue has been empty for `quietFrames` renders in a row (every terrain and imagery tile of the view is loaded,
 * or has failed and shows its parent's imagery), or at `timeoutMs` whatever is still loading.
 *
 * The queue is rebuilt by every render's tile selection, so one empty reading right after a tile finishes can
 * precede the selection that asks for its children; two in a row cannot.
 */
export interface SettleRule { minFrames: number; quietFrames: number; timeoutMs: number }
export const SNAPSHOT_SETTLE: SettleRule = { minFrames: 2, quietFrames: 2, timeoutMs: 12_000 };

export interface SettleState { frames: number; quiet: number }
export type SettleVerdict = "wait" | "loaded" | "timeout";
export const SETTLE_START: SettleState = { frames: 0, quiet: 0 };

/** Account for one rendered frame of a capture: whether the tile queue was empty after it, and the time since its view was set. */
export function settleStep(s: SettleState, tilesLoaded: boolean, elapsedMs: number, rule: SettleRule = SNAPSHOT_SETTLE): { state: SettleState; verdict: SettleVerdict } {
  const state = { frames: s.frames + 1, quiet: tilesLoaded ? s.quiet + 1 : 0 };
  if (state.frames >= rule.minFrames && state.quiet >= rule.quietFrames) return { state, verdict: "loaded" };
  if (elapsedMs >= rule.timeoutMs) return { state, verdict: "timeout" };
  return { state, verdict: "wait" };
}

/**
 * Screen-space error (Cesium's tile refinement threshold, px) for a capture. The picture is the canvas scaled
 * down to `outW` px wide, so its tiles need only be as fine as the picture shows them: the working error over
 * the scale. Never finer than the working view, and capped so a tiny picture still refines past the coarsest
 * levels. Fewer, coarser tiles are what make a plate arrive sooner; the picture loses nothing it could show.
 */
export function captureSse(workingSse: number, canvasW: number, outW: number, max = 8): number {
  if (!(workingSse > 0)) return workingSse;
  if (!(canvasW > 0) || !(outW > 0)) return workingSse;
  const scale = Math.min(1, outW / canvasW);
  return Math.max(workingSse, Math.min(max, workingSse / scale));
}

export interface SerialRunner<J extends { id: string }> {
  /** Queue a job; it runs after every job queued before it. */
  add(job: J): void;
  /**
   * Withdraw a job: "queued" — removed before it ran (`drop` is called for it); "running" — its signal is
   * aborted and it is expected to wind up at once; null — not known (finished, or never added).
   */
  cancel(id: string): "queued" | "running" | null;
  /** Id of the job running now, if any. */
  readonly running: string | null;
  /** Jobs waiting behind it. */
  readonly pending: number;
}

/**
 * One job at a time, in the order added. A job receives an AbortSignal that `cancel` aborts; a failing job
 * never stalls the ones behind it.
 */
export function serialRunner<J extends { id: string }>(exec: (job: J, signal: AbortSignal) => Promise<void>, drop: (job: J) => void): SerialRunner<J> {
  const queue: J[] = [];
  let current: { job: J; ctl: AbortController } | null = null;
  const pump = () => {
    if (current) return;
    const job = queue.shift();
    if (!job) return;
    const ctl = new AbortController();
    current = { job, ctl };
    let run: Promise<void>;
    try {
      run = exec(job, ctl.signal);
    } catch (err) {
      run = Promise.reject(err);
    }
    void run.catch(() => undefined).finally(() => {
      current = null;
      pump();
    });
  };
  return {
    add(job) {
      queue.push(job);
      pump();
    },
    cancel(id) {
      const i = queue.findIndex((j) => j.id === id);
      if (i >= 0) {
        drop(queue.splice(i, 1)[0]);
        return "queued";
      }
      if (current?.job.id === id) {
        current.ctl.abort();
        return "running";
      }
      return null;
    },
    get running() {
      return current?.job.id ?? null;
    },
    get pending() {
      return queue.length;
    },
  };
}
