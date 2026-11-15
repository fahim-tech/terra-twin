/**
 * One-at-a-time captures per globe. A snapshot moves its globe's camera (and hides the app's drawings) until
 * the image is taken, so two captures on one globe must never overlap, and a capture nobody waits for any
 * more — the reader left the report, or moved to another candidate — must not touch the globe at all: by the
 * time it would run, that globe may be the one on screen. Pure (no React, no globe), tested in
 * captureQueue.test.ts.
 */
export function createCaptureQueue() {
  const tails = new Map<string, Promise<unknown>>();
  const waiting = new Map<string, number>();
  const wanted = (key: string) => (waiting.get(key) ?? 0) > 0;
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
        else waiting.delete(key);
      };
    },
    wanted,
    /**
     * Run `job` after every job queued before it on `lane`. When its turn comes it runs only if someone still
     * wants `key` and `allowed()` holds; otherwise it resolves null without running.
     */
    run<T>(lane: string, key: string, job: () => Promise<T>, allowed: () => boolean = () => true): Promise<T | null> {
      const go = (): Promise<T | null> => (wanted(key) && allowed() ? job() : Promise.resolve(null));
      const run = (tails.get(lane) ?? Promise.resolve()).then(go, go);
      tails.set(lane, run.catch(() => undefined));
      return run;
    },
  };
}
