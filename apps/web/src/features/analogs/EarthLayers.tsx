import { cx } from "../../components/ui";
import { useLegend } from "../../services/api";
import { useApp } from "../../store/app";

/** Layer chips for the Earth globe with the similarity-field legend. */
export function EarthLayers() {
  const overlays = useApp((s) => s.earthOverlays);
  const set = useApp((s) => s.set);
  const legend = useLegend();
  const chip = (key: keyof typeof overlays, label: string) => (
    <button key={key} type="button" aria-pressed={overlays[key]} onClick={() => set({ earthOverlays: { ...overlays, [key]: !overlays[key] } })}
      className={cx("hit rounded-full px-3 py-1.5 text-caption transition-colors", overlays[key] ? "bg-ink text-space" : "text-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] hover:text-ink")}>
      {label}
    </button>
  );
  const lg = legend.data?.tier1_similarity;
  return (
    <div className="surface rounded-[14px] p-3">
      <div className="flex flex-wrap gap-1.5">
        {chip("similarity", "Similarity field")}
        {chip("pool", "Research pool")}
        {chip("coverage", "Screened land")}
      </div>
      {overlays.similarity && lg && (
        <div className="mt-3">
          <div className="h-2 w-full rounded-full" style={{ background: `linear-gradient(to right, ${lg.stops.map(([v, c]) => `${c} ${v * 100}%`).join(", ")})` }} />
          <div className="num mt-1 flex justify-between text-num-sm text-faint"><span>0</span><span>Similarity S</span><span>1</span></div>
          <p className="mt-1 text-caption text-faint">Global screen, 25 km cells. Not a probability.</p>
        </div>
      )}
    </div>
  );
}
