/**
 * One-at-a-time captures per globe. A snapshot moves its globe's camera (and hides the app's drawings) until
 * the image is taken, so two captures on one globe must never overlap, and a capture nobody waits for any
 * more — the reader left the report, or moved to another candidate — must not touch the globe at all: by the
 * time it would run, that globe may be the one on screen. A capture already running when its last reader
 * leaves is withdrawn: its signal aborts, and the globe puts the reader's view back at once instead of holding
 * the capture view until its imagery has loaded. Pure (no React, no globe), tested in captureQueue.test.ts.
 */
export function createCaptureQueue() {
  const tails = new Map<string, Promise<unknown>>();
  const waiting = new Map<string, number>();
  /** Signals of the captures running now, by key. */
  const running = new Map<string, Set<AbortController>>();
  const wanted = (key: string) => (waiting.get(key) ?? 0) > 0;
  const abortRunning = (key: string) => {
    for (const ctl of running.get(key) ?? []) ctl.abort();
  };
  return {
    /** Register interest in a capture; returns the release function (call it on unmount). */
    want(key: string): () => void {
      waiting.set(key, (waiting.get(key) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const n = (waiting.get(key) ?? 1) - 1;
        if (n > 0) waiting.set(key, n);
        else {
          waiting.delete(key);
          abortRunning(key);
        }
      };
    },
    wanted,
    /** Whether a capture for `key` is running now. */
    isRunning(key: string): boolean {
      return (running.get(key)?.size ?? 0) > 0;
    },
    /**
     * Run `job` after every job queued before it on `lane`. When its turn comes it runs only if someone still
     * wants `key` and `allowed()` holds; otherwise it resolves null without running. While it runs, its signal
     * aborts as soon as nobody wants `key` any more.
     */
    run<T>(lane: string, key: string, job: (signal: AbortSignal) => Promise<T>, allowed: () => boolean = () => true): Promise<T | null> {
      const go = async (): Promise<T | null> => {
        if (!wanted(key) || !allowed()) return null;
        const ctl = new AbortController();
        const set = running.get(key) ?? new Set<AbortController>();
        set.add(ctl);
        running.set(key, set);
        try {
          return await job(ctl.signal);
        } finally {
          set.delete(ctl);
          if (!set.size) running.delete(key);
        }
      };
      const run = (tails.get(lane) ?? Promise.resolve()).then(go, go);
      tails.set(lane, run.catch(() => undefined));
      return run;
    },
  };
}
