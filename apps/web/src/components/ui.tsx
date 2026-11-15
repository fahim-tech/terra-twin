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
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[8px] bg-space/80 p-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} role="radio" aria-checked={on} disabled={o.disabled} title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              "hit whitespace-nowrap rounded-[6px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97]",
              size === "sm" ? "px-2.5 py-1 text-caption" : "px-3 py-1.5 text-label",
              on ? cx("bg-elevated text-ink shadow-sm", accent === "mars" && "text-mars", accent === "earth" && "text-earth") : "text-muted hover:text-ink",
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
    neutral: "bg-elevated text-muted ring-line",
    mars: "bg-mars/10 text-mars ring-mars/25",
    earth: "bg-earth/10 text-earth ring-earth/25",
    warn: "bg-warn/10 text-warn ring-warn/25",
    ok: "bg-ok/10 text-ok ring-ok/25",
    bad: "bg-bad/10 text-bad ring-bad/25",
  };
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-caption leading-none ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "muted" | "mars" | "earth" }) {
  const c = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", muted: "bg-faint", mars: "bg-mars", earth: "bg-earth" }[tone];
  return <span className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", c)} aria-hidden />;
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
      <span className="relative flex h-3 w-3">
        <span className="absolute inset-0 animate-ping rounded-full bg-earth/40" />
        <span className="relative m-auto h-1.5 w-1.5 rounded-full bg-earth" />
      </span>
      {label}
    </div>
  );
}

export function Button({ children, onClick, variant = "ghost", disabled, className, title, type = "button" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary-mars" | "primary-earth" | "ghost" | "outline"; disabled?: boolean; className?: string; title?: string; type?: "button" | "submit";
}) {
  const v = {
    "primary-mars": "bg-mars text-space hover:brightness-110 font-semibold",
    "primary-earth": "bg-earth text-space hover:brightness-110 font-semibold",
    ghost: "text-muted hover:text-ink hover:bg-elevated",
    outline: "text-ink ring-1 ring-inset ring-line hover:bg-elevated",
  }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={cx("hit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-3.5 py-2 text-label transition-[color,background,filter,transform] duration-150 active:scale-[0.97] active:duration-75 disabled:cursor-not-allowed disabled:opacity-40", v, className)}>
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
    <div className={cx("h-1 w-full overflow-hidden rounded-full bg-line/60", className)}>
      {value !== null && value !== undefined && <div className={cx("h-full rounded-full transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />}
    </div>
  );
}
