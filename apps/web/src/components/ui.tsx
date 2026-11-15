import type { ReactNode } from "react";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { QualityFlag } from "../types/contracts";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("eyebrow", className)}>{children}</div>;
}

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("px-5 py-3.5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, accent = "earth", size = "md", ariaLabel }: {
  value: T; options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]; onChange: (v: T) => void;
  accent?: "mars" | "earth" | "ink"; size?: "sm" | "md"; ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex divide-x divide-line-strong rounded-control border border-line-strong bg-space/70">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} role="radio" aria-checked={on} disabled={o.disabled} title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              "hit whitespace-nowrap font-semibold uppercase tracking-[0.1em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-[10.5px]" : "px-3 py-1.5 text-[11.5px]",
              on ? cx("bg-ink text-space", accent === "mars" && "shadow-[inset_0_-2px_0_var(--color-mars)]", accent === "earth" && "shadow-[inset_0_-2px_0_var(--color-earth)]") : "text-muted hover:bg-white/[0.05] hover:text-ink",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "mars" | "earth" | "warn" | "ok" | "bad"; className?: string; title?: string }) {
  const tones = {
    neutral: "text-muted ring-line-strong",
    mars: "text-mars ring-mars/45",
    earth: "text-earth ring-earth/45",
    warn: "text-warn ring-warn/45",
    ok: "text-ok ring-ok/45",
    bad: "text-bad ring-bad/45",
  };
  return <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-control px-1.5 py-[3px] font-mono text-[10.5px] uppercase leading-none tracking-[0.06em] ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "muted" | "mars" | "earth" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", muted: "bg-faint", mars: "bg-mars", earth: "bg-earth" }[tone];
  return <span className={cx("inline-block h-1.5 w-1.5 shrink-0", c)} aria-hidden />;
}

export function Note({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warning" | "critical"; className?: string }) {
  const Icon = tone === "critical" ? OctagonAlert : tone === "warning" ? AlertTriangle : Info;
  const color = tone === "critical" ? "text-bad" : tone === "warning" ? "text-warn" : "text-muted";
  return (
    <div className={cx("flex gap-2.5 text-caption text-muted", className)}>
      <Icon className={cx("mt-[2px] h-3.5 w-3.5 shrink-0", color)} strokeWidth={1.75} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Flags({ flags }: { flags: QualityFlag[] }) {
  if (!flags.length) return null;
  return <div className="space-y-2.5">{flags.map((f) => <Note key={f.code} tone={f.severity}>{f.message}</Note>)}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-caption text-muted" role="status">
      <span className="relative flex h-3 w-3 border border-line-strong">
        <span className="absolute inset-[2px] animate-pulse bg-ink/80" />
      </span>
      {label}
    </div>
  );
}

/**
 * Rectangular command button, uppercase. Primary = solid ink; the planet variants add a small square
 * marker in the planet colour (colour as signal, not as fill). Press feedback is instant.
 */
export function Button({ children, onClick, variant = "ghost", disabled, className, title, type = "button" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "primary-mars" | "primary-earth" | "ghost" | "outline"; disabled?: boolean; className?: string; title?: string; type?: "button" | "submit";
}) {
  const solid = variant === "primary" || variant === "primary-mars" || variant === "primary-earth";
  const v = solid
    ? "bg-ink text-space hover:bg-white active:bg-ink/80"
    : variant === "outline"
      ? "text-ink ring-1 ring-inset ring-line-strong hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12]"
      : "text-muted hover:text-ink hover:bg-white/[0.05] active:bg-white/[0.1]";
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={cx("hit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 py-2.5 text-[12px] font-semibold uppercase leading-none tracking-[0.12em] transition-[color,background,box-shadow] duration-150 active:duration-0 disabled:cursor-not-allowed disabled:opacity-40", v, className)}>
      {variant === "primary-mars" && <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-mars" />}
      {variant === "primary-earth" && <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-earth" />}
      {children}
    </button>
  );
}

export function fmt(v: number | null | undefined, unit?: string, digits?: number) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const d = digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : Math.abs(v) >= 1 ? 2 : 3);
  const s = v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (!unit || unit === "-") return s;
  return unit === "deg" ? `${s}°` : unit === "%" ? `${s}%` : `${s} ${unit}`;
}

export function pct(v: number | null | undefined, digits = 0) {
  return v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Horizontal 0..1 bar used for similarity components. Never drawn for missing values. */
export function Bar({ value, tone = "earth", className }: { value: number | null | undefined; tone?: "earth" | "mars" | "muted"; className?: string }) {
  const c = tone === "earth" ? "bg-earth" : tone === "mars" ? "bg-mars" : "bg-faint";
  return (
    <div className={cx("h-1 w-full overflow-hidden bg-line", className)}>
      {value !== null && value !== undefined && <div className={cx("h-full transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />}
    </div>
  );
}
