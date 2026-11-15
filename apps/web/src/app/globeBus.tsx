import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { GlobeHandle } from "../globes/GlobeFrame";
import type { GlobeToParent, ParentToGlobe, Planet } from "../globes/protocol";

type Handler = (m: GlobeToParent) => void;

/**
 * Shared access to both globe frames. The shell mounts the frames once; feature packages send
 * commands and subscribe to globe events through this bus instead of reaching into App.
 */
export interface GlobeBus {
  handles: Record<Planet, RefObject<GlobeHandle>>;
  send: (planet: Planet, msg: ParentToGlobe) => void;
  emit: (planet: Planet, msg: GlobeToParent) => void;
  on: (planet: Planet, h: Handler) => () => void;
}

const Ctx = createContext<GlobeBus | null>(null);

export function GlobeBusProvider({ children }: { children: ReactNode }) {
  const mars = useRef<GlobeHandle>(null);
  const earth = useRef<GlobeHandle>(null);
  const subs = useRef<Record<Planet, Set<Handler>>>({ mars: new Set(), earth: new Set() });
  const bus = useMemo<GlobeBus>(() => ({
    handles: { mars, earth },
    send: (p, msg) => (p === "mars" ? mars : earth).current?.send(msg),
    emit: (p, msg) => { for (const h of subs.current[p]) h(msg); },
    on: (p, h) => { subs.current[p].add(h); return () => { subs.current[p].delete(h); }; },
  }), []);
  if (import.meta.env.DEV) Object.assign(window, { __terratwinBus: bus });
  return <Ctx.Provider value={bus}>{children}</Ctx.Provider>;
}

export function useGlobeBus(): GlobeBus {
  const b = useContext(Ctx);
  if (!b) throw new Error("useGlobeBus outside GlobeBusProvider");
  return b;
}

/** Subscribe to one planet's globe events; the latest handler is always used. */
export function useGlobeEvents(planet: Planet, handler: Handler) {
  const bus = useGlobeBus();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bus.on(planet, (m) => ref.current(m)), [bus, planet]);
}
