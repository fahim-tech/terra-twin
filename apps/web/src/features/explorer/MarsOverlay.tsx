import { AnnotationLayer } from "../../components/map/Annotations";
import { formatLat, formatLon } from "../../lib/geodesy";
import { useApp } from "../../store/app";

/** Selection annotation pinned to the planet with a leader line. */
export function MarsOverlay() {
  const selection = useApp((s) => s.selection);
  if (!selection) return null;
  return (
    <AnnotationLayer planet="mars" items={[{
      id: "selection", lat: selection.lat, lon: selection.lon, tone: "mars",
      content: (
        <div className="on-imagery whitespace-nowrap">
          <div className="toponym text-[19px] leading-tight text-ink">{selection.label}</div>
          <div className="num text-num-sm text-ink/85">{formatLat(selection.lat, 2)} {formatLon(selection.lon, 2)}</div>
        </div>
      ),
    }]} />
  );
}
