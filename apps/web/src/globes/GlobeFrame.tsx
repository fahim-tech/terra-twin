import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type GlobeToParent, type ParentToGlobe, type Planet, isEnvelope, wrap } from "./protocol";
import { useGlobes } from "../store/globes";

/** A globe snapshot: a JPEG data URL and its size. `imagery` is "partial" when tiles were still loading at the bound. */
export interface GlobeShot { dataUrl: string; width: number; height: number; imagery?: "complete" | "partial" }

export interface SnapshotOptions {
  /** Hide everything the app draws on the globe for this capture only (protocol: snapshot `clean`). */
  clean?: boolean;
  /** Aborting withdraws the snapshot: the globe puts the reader's view back at once, and the promise resolves null. */
  signal?: AbortSignal;
  /** Withdraw it after this long, ms (default 20 s; the globe's own wait for tiles is bounded well inside that). */
  timeoutMs?: number;
}

export interface GlobeHandle {
  send: (msg: ParentToGlobe) => void;
  /**
   * Render a top-down view of a location and resolve with a JPEG data URL (visualization imagery only), or null
   * when it could not be taken or was withdrawn.
   */
  snapshot: (lat: number, lon: number, heightKm: number, maxWidth?: number, opts?: SnapshotOptions) => Promise<GlobeShot | null>;
}

interface Props {
  planet: Planet;
  className?: string;
  onMessage?: (msg: GlobeToParent) => void;
}

const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim() || null;
let snapshotSeq = 0;

/**
 * Hosts one planet's Cesium viewer in an isolated iframe. Messages sent before the frame is
 * ready are queued, so callers never need to know about the handshake.
 */
export const GlobeFrame = forwardRef<GlobeHandle, Props>(function GlobeFrame({ planet, className, onMessage }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const queue = useRef<ParentToGlobe[]>([]);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [loaded, setLoaded] = useState(false);
  const pending = useRef(new Map<string, (v: GlobeShot | null) => void>());

  const deliver = (msg: ParentToGlobe) => frame.current?.contentWindow?.postMessage(wrap(msg), location.origin);
  const send = useCallback((msg: ParentToGlobe) => {
    if (ready.current) deliver(msg);
    else queue.current.push(msg);
  }, []);

  useImperativeHandle(ref, () => ({
    send,
    snapshot(lat, lon, heightKm, maxWidth, opts = {}) {
      const requestId = `${planet}-${++snapshotSeq}`;
      return new Promise<GlobeShot | null>((resolve) => {
        if (opts.signal?.aborted) { resolve(null); return; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (v: GlobeShot | null) => {
          if (!pending.current.delete(requestId)) return;
          if (timer) clearTimeout(timer);
          opts.signal?.removeEventListener("abort", withdraw);
          resolve(v);
        };
        // Withdrawn by the caller or timed out: tell the globe to stop and put the reader's view back now.
        function withdraw() {
          if (!pending.current.has(requestId)) return;
          send({ t: "cancelSnapshot", requestId });
          finish(null);
        }
        pending.current.set(requestId, finish);
        opts.signal?.addEventListener("abort", withdraw, { once: true });
        send({ t: "snapshot", requestId, lat, lon, heightKm, maxWidth, ...(opts.clean ? { clean: true } : {}) });
        timer = setTimeout(withdraw, opts.timeoutMs ?? 20_000);
      });
    },
  }), [planet, send]);

  // The shared 3D preference: this globe keeps its own copy for its flights (no camera move, no event).
  useEffect(() => {
    send({ t: "setTilt", on: useGlobes.getState().tilt, turn: false });
    return useGlobes.subscribe((s, prev) => { if (s.tilt !== prev.tilt) send({ t: "setTilt", on: s.tilt, turn: false }); });
  }, [send]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.origin !== location.origin || ev.source !== frame.current?.contentWindow || !isEnvelope(ev.data)) return;
      const msg = ev.data.msg as GlobeToParent;
      if (msg.t === "boot") {
        deliver({ t: "init", ionToken: ION_TOKEN });
        return;
      }
      if (msg.t === "ready") {
        ready.current = true;
        setLoaded(true);
        useGlobes.getState().setReady(planet);
        if (msg.imagery) useGlobes.getState().setSource(planet, msg.imagery);
        for (const m of queue.current.splice(0)) deliver(m);
      } else if (msg.t === "camera") {
        useGlobes.getState().setCamera(planet, msg.camera);
        return;
      } else if (msg.t === "anchors") {
        useGlobes.getState().setAnchors(planet, msg.anchors);
        return;
      } else if (msg.t === "imagery") {
        useGlobes.getState().setSource(planet, msg.imagery);
        return;
      } else if (msg.t === "dataLayerStatus") {
        useGlobes.getState().reportDataLayer(planet, msg.id, msg.failures);
        return;
      } else if (msg.t === "imageryStatus") {
        useGlobes.getState().reportImagery(planet, msg.layer, msg.failures);
        return;
      } else if (msg.t === "snapshot") {
        pending.current.get(msg.requestId)?.(msg.dataUrl ? { dataUrl: msg.dataUrl, width: msg.width, height: msg.height, imagery: msg.imagery } : null);
        return;
      } else if (msg.t === "tilt") {
        // A switch made in this globe (its T key, or a setTilt) becomes the preference for both globes.
        useGlobes.getState().setTilt(msg.on);
      }
      handler.current?.(msg);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [planet]);

  // Keep the Cesium canvas sized with layout changes (panel collapse, split view).
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (ready.current) deliver({ t: "resize" }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <iframe
        ref={frame}
        title={`${planet === "mars" ? "Mars" : "Earth"} globe. Arrow keys pan, plus and minus zoom, N faces north, T switches between the top-down and 3D views, Enter selects the point under the centre crosshair.`}
        src={`./globe.html?planet=${planet}`}
        className="absolute inset-0 h-full w-full border-0 transition-opacity duration-700"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="kicker flex items-center gap-3 !text-muted">
            <span className={`h-1.5 w-1.5 animate-pulse motion-reduce:animate-none ${planet === "mars" ? "bg-mars" : "bg-earth"}`} />
            Initialising {planet === "mars" ? "Mars" : "Earth"} globe
          </div>
        </div>
      )}
    </div>
  );
});
