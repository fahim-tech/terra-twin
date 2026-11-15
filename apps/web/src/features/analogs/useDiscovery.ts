import { useEffect, useRef } from "react";
import { useFindAnalogs } from "../../services/api";
import { useDiscoveryJob, useSubmitDiscovery } from "../../services/gis";
import { useApp, type Selection } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import { stableLeaderId } from "./candidates";

/**
 * "Run global discovery": submits a GIS discovery job for the point (a zone sends its id, so the run uses the
 * zone centre) with the app's mission and the chosen window count, stores the job and opens the Earth stage's
 * Live discovery tab. A cached run comes back done at once. The Earth stage is the results surface of a
 * search, so when the current search is for another target, the regular search runs for this point too
 * (the research record, or its honest absence off the zones, stays one tab away).
 */
export function useRunDiscovery() {
  const submit = useSubmitDiscovery();
  const find = useFindAnalogs();
  const run = (sel: Selection) => {
    const app = useApp.getState();
    const { mission, discoveryWindows: n, footprintKm, discoveryPool: includePool } = app;
    const request = { lat: sel.lat, lon: sel.lon, site: sel.siteId, label: sel.label, mission, nRefine: n, includePool };
    app.announce(`Submitting a global discovery for ${sel.label}, ${n} windows.`);
    submit.mutate({ lat: sel.lat, lon: sel.lon, mission, n_refine: n, site: sel.siteId, include_research_pool: includePool }, {
      onError: (e) => useApp.getState().announce(`Discovery could not be submitted: ${(e as Error).message}`, true),
      onSuccess: (job) => {
        const s = useApp.getState();
        s.set({ discovery: { request, job }, liveRunId: job.status === "done" ? job.run_id : null, liveCandidate: null, liveOpen: true });
        s.announce(job.status === "done"
          ? `${job.cached ? "These parameters already ran; opening the stored run" : "Discovery run ready"}.`
          : `Discovery submitted: ${job.state_label}. It runs on the server; progress updates here.`);
        const t = searchTarget(s.search);
        const same = t && Math.abs(t.lat - sel.lat) < 1e-6 && Math.abs(t.lon - sel.lon) < 1e-6 && t.mission === mission;
        if (same) { s.go("earth"); return; }
        find.mutate({ lat: sel.lat, lon: sel.lon, footprint_km: footprintKm, mission }, {
          onError: (e) => useApp.getState().announce(`Earth search failed: ${(e as Error).message}`, true),
          onSuccess: (res) => {
            const leader = stableLeaderId(res.tier2);
            useApp.getState().set({ search: res, candidateId: leader ? `t2:${leader}` : null, tier: res.tier2.candidates.length || !res.tier1 ? 2 : 1, liveOpen: true });
            useApp.getState().go("earth");
          },
        });
      },
    });
  };
  return { run, pending: submit.isPending || find.isPending, error: submit.isError ? (submit.error as Error) : null };
}

/**
 * Follows the submitted job (polling stops when it is done or failed): keeps the stored job current, opens its
 * run when it finishes and announces state changes. Mount once (EarthGlobeSync).
 */
export function useDiscoverySync() {
  const discovery = useApp((s) => s.discovery);
  const jobId = discovery && discovery.job.status !== "done" && discovery.job.status !== "failed" ? discovery.job.job_id : null;
  const q = useDiscoveryJob(jobId);
  const lastState = useRef<string | null>(null);
  useEffect(() => {
    const job = q.data;
    const s = useApp.getState();
    if (!job || !s.discovery || s.discovery.job.job_id !== job.job_id) return;
    s.set({ discovery: { ...s.discovery, job } });
    const key = `${job.job_id}:${job.status}`;
    if (lastState.current === key) return;
    lastState.current = key;
    if (job.status === "done" && job.run_id) {
      if (s.liveRunId === null) s.set({ liveRunId: job.run_id, liveCandidate: null });
      s.announce(`Global discovery finished for ${s.discovery.request.label}.`);
    } else if (job.status === "failed") {
      s.announce(`Global discovery failed${job.error?.message ? `: ${job.error.message}` : ""}.`, true);
    } else {
      s.announce(`Global discovery: ${job.state_label}.`);
    }
  }, [q.data]);
  useEffect(() => {
    if (q.isError) useApp.getState().announce(`Discovery status could not be read: ${(q.error as Error).message}`, true);
  }, [q.isError, q.error]);
  return q;
}
