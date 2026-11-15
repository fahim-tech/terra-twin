import { useEffect, useRef } from "react";
import { formatLat, formatLon, normLon } from "../lib/geodesy";
import { api } from "../services/api";
import { type Stage, useApp } from "../store/app";
import { searchTarget } from "../store/searchTarget";
import { stableLeaderId } from "../features/analogs/candidates";

const STAGES: Stage[] = ["mars", "earth", "compare", "evidence", "report"];

interface UrlState {
  stage: Stage;
  site: string | null;
  lat: number | null;
  lon: number | null;
  mission: string | null;
  cand: string | null;
}

export function parseHash(hash: string): UrlState | null {
  const m = /^#\/([a-z]+)(?:\?(.*))?$/.exec(hash);
  if (!m || !STAGES.includes(m[1] as Stage)) return null;
  const q = new URLSearchParams(m[2] ?? "");
  const num = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  return { stage: m[1] as Stage, site: q.get("site"), lat: num("lat"), lon: num("lon"), mission: q.get("mission"), cand: q.get("cand") };
}

export function buildHash(s: UrlState): string {
  const q = new URLSearchParams();
  if (s.site) q.set("site", s.site);
  else if (s.lat !== null && s.lon !== null) { q.set("lat", s.lat.toFixed(4)); q.set("lon", s.lon.toFixed(4)); }
  if (s.mission) q.set("mission", s.mission);
  if (s.cand) q.set("cand", s.cand);
  const qs = q.toString();
  return `#/${s.stage}${qs ? `?${qs}` : ""}`;
}

/**
 * Mirrors the investigation (stage, Mars target, mission, Earth candidate) into the URL hash so
 * views can be shared and the browser Back button walks between stages. On load, a shared link is
 * restored by re-running the same real search — nothing is cached or invented.
 */
export function useUrlState() {
  const restoring = useRef(true);
  const stage = useApp((s) => s.stage);
  const selection = useApp((s) => s.selection);
  const mission = useApp((s) => s.mission);
  const candidateId = useApp((s) => s.candidateId);
  const search = useApp((s) => s.search);
  const lastStage = useRef(stage);

  // Restore once on load.
  useEffect(() => {
    const u = parseHash(location.hash);
    if (!u) { restoring.current = false; return; }
    (async () => {
      const app = useApp.getState();
      if (u.mission) app.set({ mission: u.mission });
      let lat = u.lat, lon = u.lon, siteId: string | null = null, label = "";
      if (u.site) {
        const site = (await api.sites().catch(() => [])).find((x) => x.id === u.site);
        if (site) { lat = site.lat; lon = site.lon; siteId = site.id; label = site.name; }
      }
      if (lat !== null && lon !== null) {
        lon = normLon(lon);
        app.set({ introOpen: false });
        app.select({ lat, lon, siteId, label: label || `${formatLat(lat, 2)}, ${formatLon(lon, 2)}` });
        if (u.stage === "earth" || u.stage === "compare" || u.stage === "report") {
          const res = await api.findAnalogs({ lat, lon, footprint_km: app.footprintKm, mission: u.mission ?? app.mission }).catch(() => null);
          if (res) {
            const leader = stableLeaderId(res.tier2);
            app.set({ search: res, candidateId: u.cand ?? (leader ? `t2:${leader}` : null), tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1 });
            app.go(u.stage === "compare" && !(u.cand ?? leader) ? "earth" : u.stage);
          }
        } else if (u.stage === "evidence") {
          app.go("evidence");
        }
      } else if (u.stage === "evidence") {
        app.set({ introOpen: false });
        app.go("evidence");
      }
      lastStage.current = useApp.getState().stage;
      restoring.current = false;
    })();
  }, []);

  // Write state → URL. Stage changes push history entries; everything else replaces.
  useEffect(() => {
    if (restoring.current) return;
    // Result stages describe the searched target; the Mars stage describes the live selection.
    const t = stage !== "mars" && stage !== "evidence" ? searchTarget(search) : null;
    const place = t ? { siteId: t.siteId, lat: t.lat, lon: t.lon } : selection ? { siteId: selection.siteId, lat: selection.lat, lon: selection.lon } : null;
    const hash = buildHash({
      stage, site: place?.siteId ?? null,
      lat: place && !place.siteId ? place.lat : null, lon: place && !place.siteId ? place.lon : null,
      mission: t ? t.mission : mission, cand: stage === "mars" ? null : candidateId,
    });
    if (hash === location.hash) return;
    if (stage !== lastStage.current) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
    lastStage.current = stage;
  }, [stage, selection, mission, candidateId, search]);

  // Back / Forward between stages (only to stages that are reachable with the current results).
  useEffect(() => {
    const onPop = () => {
      const u = parseHash(location.hash);
      const app = useApp.getState();
      if (!u) { app.set({ stage: "mars" }); return; }
      const needsSearch = u.stage === "earth" || u.stage === "compare" || u.stage === "report";
      if (needsSearch && !app.search) return;
      lastStage.current = u.stage;
      app.set({ stage: u.stage, whyOpen: false });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return search;
}
