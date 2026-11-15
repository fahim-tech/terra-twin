import { useMemo } from "react";
import { useMissions, useResearchSummary } from "../../services/api";
import { useApp } from "../../store/app";
import type { ResearchSiteSummary } from "../../types/contracts";

export type Outcome = ResearchSiteSummary["exclude"] & { gateMode: "exclude" | "report" };

/**
 * Research outcome per Exploration Zone for the active mission: field-test missions use the
 * gate-then-rank records, Terrain Geometry Only uses the report-only records. Real research data
 * from /api/research/summary; nothing is computed here. A mission without a research configuration
 * (or before mission profiles have loaded) has no outcome at all — never another mission's.
 */
export function useSiteOutcomes(): { bySite: Record<string, Outcome>; loading: boolean; gateMode: "exclude" | "report" | null } {
  const summary = useResearchSummary();
  const missions = useMissions();
  const mission = useApp((s) => s.mission);
  const profile = missions.data?.find((m) => m.id === mission);
  // Same rule as the API (`gate_mode or "report"`), but only for missions it can run.
  const gateMode = profile?.available ? profile.gate_mode ?? "report" : null;
  const bySite = useMemo(() => {
    const out: Record<string, Outcome> = {};
    if (!gateMode) return out;
    for (const s of summary.data ?? []) out[s.site] = { ...s[gateMode], gateMode };
    return out;
  }, [summary.data, gateMode]);
  return { bySite, loading: summary.isLoading || missions.isLoading, gateMode };
}

export const OUTCOME_COPY: Record<Outcome["type"], { short: string; long: string }> = {
  named_leader: { short: "Stable leader", long: "One Earth window leads under all four orientations" },
  tied_set: { short: "Tied set", long: "Several Earth windows are equivalent at this resolution" },
  no_convincing_analog: { short: "No convincing analog", long: "No candidate reaches the research verdict thresholds" },
  insufficient_evidence: { short: "Insufficient evidence", long: "Not enough evidence to rank candidates" },
};
