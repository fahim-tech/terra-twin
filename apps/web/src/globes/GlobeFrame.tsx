import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { type GlobeToParent, type ParentToGlobe, type Planet, isEnvelope, wrap } from "./protocol";
import { useGlobes } from "../store/globes";

export interface GlobeHandle {
  send: (msg: ParentToGlobe) => void;
  /** Render a top-down view of a location and resolve with a JPEG data URL (visualization imagery only). */
  snapshot: (lat: number, lon: number, heightKm: number, maxWidth?: number) => Promise<{ dataUrl: string; width: number; height: number } | null>;
}

interface Props {
  planet: Planet;
  className?: string;
  onMessage?: (msg: GlobeToParent) => void;
}

const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || "").trim() || null;

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
  const pending = useRef(new Map<string, (v: { dataUrl: string; width: number; height: number } | null) => void>());

  const deliver = (msg: ParentToGlobe) => frame.current?.contentWindow?.postMessage(wrap(msg), location.origin);

  useImperativeHandle(ref, () => {
    const send = (msg: ParentToGlobe) => {
      if (ready.current) deliver(msg);
      else queue.current.push(msg);
    };
    return {
      send,
      snapshot(lat, lon, heightKm, maxWidth) {
        const requestId = `${planet}-${Math.round(performance.now())}-${pending.current.size}`;
        return new Promise((resolve) => {
          pending.current.set(requestId, resolve);
          send({ t: "snapshot", requestId, lat, lon, heightKm, maxWidth });
          setTimeout(() => { if (pending.current.delete(requestId)) resolve(null); }, 15000);
        });
      },
    };
  }, [planet]);

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
        for (const m of queue.current.splice(0)) deliver(m);
      } else if (msg.t === "camera") {
        useGlobes.getState().setCamera(planet, msg.camera);
        return;
      } else if (msg.t === "anchors") {
        useGlobes.getState().setAnchors(planet, msg.anchors);
        return;
      } else if (msg.t === "snapshot") {
        const done = pending.current.get(msg.requestId);
        pending.current.delete(msg.requestId);
        done?.(msg.dataUrl ? { dataUrl: msg.dataUrl, width: msg.width, height: msg.height } : null);
        return;
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
        title={`${planet === "mars" ? "Mars" : "Earth"} globe. Arrow keys pan, plus and minus zoom, N faces north, Enter selects the point under the centre crosshair.`}
        src={`./globe.html?planet=${planet}`}
        className="absolute inset-0 h-full w-full border-0 transition-opacity duration-700"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${planet === "mars" ? "bg-mars" : "bg-earth"}`} />
            Initialising {planet === "mars" ? "Mars" : "Earth"} globe
          </div>
        </div>
      )}
    </div>
  );
});
