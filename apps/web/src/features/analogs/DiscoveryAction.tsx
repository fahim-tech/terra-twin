import { ArrowRight } from "lucide-react";
import { Button, cx, Note } from "../../components/ui";
import { useGisStatus } from "../../services/gis";
import { useApp, type Selection } from "../../store/app";
import { SegmentedField } from "./instruments";
import { useRunDiscovery } from "./useDiscovery";

/** The window counts the server offers (status payload); only 20 and 40 are valid requests. */
export function windowChoices(choices: number[] | undefined): (20 | 40)[] {
  return (choices ?? []).filter((n): n is 20 | 40 => n === 20 || n === 40);
}

/**
 * "RUN GLOBAL DISCOVERY": a windows choice (20 / 40, from the status payload) joined to the primary command.
 * Renders nothing until /api/gis/status says discovery is available; when the server reports it unavailable,
 * the reason is shown instead of a dead button. `variant` picks the command weight: primary where discovery is
 * the main next step, outline where another command is primary.
 */
export function DiscoveryAction({ selection, variant = "primary", className, caption = true }: {
  selection: Selection; variant?: "primary" | "outline"; className?: string; caption?: boolean;
}) {
  const gis = useGisStatus();
  const n = useApp((s) => s.discoveryWindows);
  const { run, pending, error } = useRunDiscovery();
  const ds = gis.data?.discovery;
  if (!gis.data || gis.data.status !== "available" || !ds) return null;
  if (ds.status !== "available") {
    return <Note tone="info" className={className}>Global discovery is not available on this server{ds.reason ? `: ${ds.reason}` : "."}</Note>;
  }
  const choices = windowChoices(ds.n_refine_choices);
  const value = choices.includes(n) ? n : choices[0] ?? 20;
  const set = (v: 20 | 40) => useApp.getState().set({ discoveryWindows: v });
  return (
    <div className={className}>
      {error && <Note tone="critical" className="mb-2">Discovery could not be submitted: {error.message}</Note>}
      <div className="flex items-stretch gap-2">
        {choices.length > 1 && (
          <div className="shrink-0">
            <SegmentedField<string> label="Windows to refine" value={String(value)} onChange={(v) => set(Number(v) as 20 | 40)}
              className="h-full [&>button]:px-3 [&>button]:text-[11px]"
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
      {caption && (
        <p className="mt-2 text-caption text-faint">
          {choices.length > 1 ? "Windows refined · " : ""}global tier-1 shortlist, then {ds.window_km !== undefined ? <><span className="num">{ds.window_km}</span> km </> : ""}windows compared as MOLA would observe them. Runs on the server.
        </p>
      )}
    </div>
  );
}
