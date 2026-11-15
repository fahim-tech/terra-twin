import { useEffect, useRef } from "react";
import { formatLat, formatLon, normLon } from "../lib/geodesy";
import { zoneName } from "../lib/glossary";
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

const RESULT_STAGES: Stage[] = ["earth", "compare", "report"];

/**
 * Where the in-app Back button should lead from a stage reached through browser history or a link,
 * where the real previous stage is unknown: the stage's logical parent in the journey. Evidence is
 * opened from anywhere, so it returns to the stage the user was on.
 */
export function parentStage(stage: Stage, hasCandidate: boolean, from: Stage): Stage {
  if (stage === "earth") return "mars";
  if (stage === "compare") return "earth";
  if (stage === "report") return hasCandidate ? "compare" : "earth";
  if (stage === "evidence") return from !== "evidence" ? from : "mars";
  return "mars";
}

/** True when the URL's Mars target and mission are the ones the app currently shows for that stage. */
function sameTarget(u: UrlState): boolean {
  const app = useApp.getState();
  const near = (a: number | null, b: number) => a !== null && Math.abs(normLon(a) - normLon(b)) < 1e-3;
  const matches = (p: { siteId: string | null; lat: number; lon: number } | null) =>
    !!p && (u.site ? p.siteId === u.site : !p.siteId && u.lat !== null && Math.abs(u.lat - p.lat) < 1e-3 && near(u.lon, p.lon));
  if (RESULT_STAGES.includes(u.stage)) {
    const t = searchTarget(app.search);
    return !!t && matches(t) && (!u.mission || u.mission === t.mission);
  }
  if (u.stage === "mars") return (u.site === null && u.lat === null) || matches(app.selection);
  return true; // Evidence does not depend on a target.
}

/**
 * Applies a URL to the app by re-running the same real search the link describes — used on load and
 * when the hash changes to a different target in an open tab. Nothing is cached or invented.
 */
async function applyUrl(u: UrlState) {
  const app = useApp.getState();
  const from = app.stage;
  const goTo = (stage: Stage) => {
    const s = useApp.getState();
    s.set({ stage, previousStage: parentStage(stage, !!s.candidateId, from), whyOpen: false });
  };
  if (u.mission) app.set({ mission: u.mission });
  let lat = u.lat, lon = u.lon, siteId: string | null = null, label = "";
  if (u.site) {
    const site = (await api.sites().catch(() => [])).find((x) => x.id === u.site);
    if (site) { lat = site.lat; lon = site.lon; siteId = site.id; label = zoneName(site.id); }
  }
  if (lat !== null && lon !== null) {
    lon = normLon(lon);
    app.set({ introOpen: false });
    app.select({ lat, lon, siteId, label: label || `${formatLat(lat, 2)}, ${formatLon(lon, 2)}` });
    if (RESULT_STAGES.includes(u.stage)) {
      const res = await api.findAnalogs({ lat, lon, footprint_km: app.footprintKm, mission: u.mission ?? app.mission }).catch(() => null);
      if (res) {
        const leader = stableLeaderId(res.tier2);
        const cand = u.cand ?? (leader ? `t2:${leader}` : null);
        app.set({ search: res, candidateId: cand, tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1 });
        // Compare always needs a candidate; without one the link opens the results instead.
        goTo(u.stage === "compare" && !cand ? "earth" : u.stage);
      } else goTo("mars");
    } else goTo(u.stage);
  } else if (u.stage === "evidence") {
    app.set({ introOpen: false });
    goTo("evidence");
  } else goTo("mars");
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
    applyUrl(u).finally(() => {
      lastStage.current = useApp.getState().stage;
      restoring.current = false;
    });
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

  // Back / Forward, and hash edits or pasted links in an open tab. A URL for the target already on
  // screen only switches stage (and candidate); a different target re-runs the restore path.
  useEffect(() => {
    const onPop = () => {
      const u = parseHash(location.hash);
      const app = useApp.getState();
      if (!u) { app.set({ stage: "mars", previousStage: "mars", whyOpen: false }); return; }
      if (!sameTarget(u) || (RESULT_STAGES.includes(u.stage) && !app.search)) {
        restoring.current = true;
        applyUrl(u).finally(() => {
          lastStage.current = useApp.getState().stage;
          restoring.current = false;
          // The restored state may describe the link more fully (e.g. a resolved candidate); record it.
          const s = useApp.getState();
          const t = s.stage !== "mars" && s.stage !== "evidence" ? searchTarget(s.search) : null;
          const place = t ?? (s.selection ? { siteId: s.selection.siteId, lat: s.selection.lat, lon: s.selection.lon, mission: s.mission } : null);
          history.replaceState(null, "", buildHash({
            stage: s.stage, site: place?.siteId ?? null,
            lat: place && !place.siteId ? place.lat : null, lon: place && !place.siteId ? place.lon : null,
            mission: t ? t.mission : s.mission, cand: s.stage === "mars" ? null : s.candidateId,
          }));
        });
        return;
      }
      if (u.mission && u.stage === "mars" && u.mission !== app.mission) app.set({ mission: u.mission });
      const cand = u.stage === "mars" ? app.candidateId : u.cand ?? app.candidateId;
      const target: Stage = u.stage === "compare" && !cand ? "earth" : u.stage;
      lastStage.current = target;
      app.set({ stage: target, candidateId: cand, previousStage: parentStage(target, !!cand, app.stage), whyOpen: false });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return search;
}
