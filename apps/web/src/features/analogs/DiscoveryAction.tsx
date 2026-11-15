import { ArrowRight } from "lucide-react";
import { Button, cx, Note } from "../../components/ui";
import { useGisStatus } from "../../services/gis";
import { type NRefine, useApp, type Selection } from "../../store/app";
import { SegmentedField } from "./instruments";
import { useRunDiscovery } from "./useDiscovery";

/** The window counts the server offers (status payload), kept to the values the API accepts (20, 30, 40). */
export function windowChoices(choices: number[] | undefined): NRefine[] {
  return (choices ?? []).filter((n): n is NRefine => n === 20 || n === 30 || n === 40);
}

/**
 * "RUN GLOBAL DISCOVERY": a windows choice (from the status payload's n_refine_choices) and the research-pool
 * option joined to the primary command, so the published runs' parameter sets can be reproduced (for example 40
 * windows with the research pool; a cached run with the same parameters comes back at once). Renders nothing until
 * /api/gis/status says discovery is available; when the server reports it unavailable, the reason is shown instead
 * of a dead button. `variant` picks the command weight: primary where discovery is the main next step, outline
 * where another command is primary.
 */
export function DiscoveryAction({ selection, variant = "primary", className, caption = true }: {
  selection: Selection; variant?: "primary" | "outline"; className?: string; caption?: boolean;
}) {
  const gis = useGisStatus();
  const n = useApp((s) => s.discoveryWindows);
  const pool = useApp((s) => s.discoveryPool);
  const { run, pending, error } = useRunDiscovery();
  const ds = gis.data?.discovery;
  if (!gis.data || gis.data.status !== "available" || !ds) return null;
  if (ds.status !== "available") {
    return <Note tone="info" className={className}>Global discovery is not available on this server{ds.reason ? `: ${ds.reason}` : "."}</Note>;
  }
  const choices = windowChoices(ds.n_refine_choices);
  const value = choices.includes(n) ? n : choices[0] ?? 20;
  const set = (v: NRefine) => useApp.getState().set({ discoveryWindows: v });
  return (
    <div className={className}>
      {error && <Note tone="critical" className="mb-2">Discovery could not be submitted: {error.message}</Note>}
      <div className="flex items-stretch gap-2">
        {choices.length > 1 && (
          <div className="shrink-0">
            <SegmentedField<string> label="Windows to refine" value={String(value)} onChange={(v) => set(Number(v) as NRefine)}
              className="h-full [&>button]:px-3 [&>button]:text-[11px] max-xs:[&>button]:px-2"
              options={choices.map((c) => ({ value: String(c), label: <span className="num">{c}</span>, title: `${c} Earth windows refined` }))} />
          </div>
        )}
        <Button variant={variant === "primary" ? "primary" : "outline"} className={cx("h-11 min-w-0 flex-1 justify-start! py-0")} onClick={() => { set(value); run(selection); }} disabled={pending}>
          {pending ? (
            <span role="status" className="flex flex-1 items-center justify-between">
              Submitting…
              <span aria-hidden className="relative h-2.5 w-2.5 border border-current/45"><span className="absolute inset-[2px] animate-pulse bg-current/80 motion-reduce:animate-none" /></span>
            </span>
          ) : <>Run global discovery <ArrowRight className="ml-auto h-4 w-4" aria-hidden /></>}
        </Button>
      </div>
      <PoolToggle on={pool} />
      {caption && (
        <p className="mt-2 text-caption text-faint">
          {choices.length > 1 ? "Windows refined · " : ""}global tier-1 shortlist{pool ? " plus the fixed research pool" : ""}, then {ds.window_km !== undefined ? <><span className="num">{ds.window_km}</span> km </> : ""}windows compared as MOLA would observe them. Runs on the server.
        </p>
      )}
    </div>
  );
}

/** "Include research pool": a square check (never a pill), labelled in words. */
function PoolToggle({ on }: { on: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => useApp.getState().set({ discoveryPool: !on })}
      className="hit mt-2 flex items-center gap-2.5 py-1 text-left text-caption text-muted transition-colors hover:text-ink active:text-ink/70 active:duration-0">
      <span aria-hidden className={cx("grid h-3 w-3 shrink-0 place-items-center rounded-[2px] border", on ? "border-ink" : "border-line-strong")}>
        {on && <span className="h-1.5 w-1.5 bg-ink" />}
      </span>
      <span><span className="label-caps text-ink/90">Include research pool</span><span className="ml-2 text-faint">also refine the fixed research sample</span></span>
    </button>
  );
}

/**
 * Compare and Report for the selected live discovery window, for its detail panel and the Earth footer. Compare and
 * Report follow the Live discovery tab's selection (store liveCompareActive), so these only change the stage.
 */
export function DiscoveryCompareActions({ className, compact = false }: { className?: string; compact?: boolean }) {
  const go = useApp((s) => s.go);
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <Button variant="primary-earth" className={cx("h-10 flex-1 justify-between!", compact && "h-9")} onClick={() => go("compare")}>
        Compare <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      <Button variant="outline" className={cx("h-10", compact && "h-9")} onClick={() => go("report")}>Report</Button>
    </div>
  );
}
