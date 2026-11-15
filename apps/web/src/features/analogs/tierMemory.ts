import { useEffect } from "react";
import { create } from "zustand";
import { useApp } from "../../store/app";
import { tierOf } from "./candidates";

/**
 * One remembered candidate per stage (research comparison / global screen) for the current search.
 * Switching stage restores that stage's pick instead of carrying a tier-2 id into the tier-1 list.
 */
interface TierMemory {
  searchId: string | null;
  byTier: { 1: string | null; 2: string | null };
}

export const useTierMemory = create<TierMemory>(() => ({ searchId: null, byTier: { 1: null, 2: null } }));

/** Switch the active stage and restore the candidate last chosen there (none if never chosen). */
export function switchTier(tier: 1 | 2) {
  const app = useApp.getState();
  if (app.tier === tier) return;
  app.set({ tier, candidateId: useTierMemory.getState().byTier[tier] });
}

/** Select a candidate; when it belongs to the other stage, switch the stage too. */
export function chooseCandidate(id: string | null) {
  const t = tierOf(id);
  useApp.getState().set(t ? { candidateId: id, tier: t } : { candidateId: id });
}

/** Records every candidate change into the per-tier memory; resets when a new search arrives. Mount once. */
export function useTierMemorySync() {
  const searchId = useApp((s) => s.search?.id ?? null);
  const candidateId = useApp((s) => s.candidateId);
  useEffect(() => {
    const m = useTierMemory.getState();
    const byTier = m.searchId === searchId ? { ...m.byTier } : { 1: null, 2: null };
    const t = tierOf(candidateId);
    if (t) byTier[t] = candidateId;
    useTierMemory.setState({ searchId, byTier });
  }, [searchId, candidateId]);
}
