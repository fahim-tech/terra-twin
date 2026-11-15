import type { KeyboardEvent } from "react";
import { cx } from "../../components/ui";
import { type CompareMode, type ModeSpec, nextMode } from "./modes";

export const MODE_PANEL_ID = "compare-mode-panel";
export const modeTabId = (m: CompareMode) => `compare-mode-tab-${m}`;

/**
 * Square segmented switch for the comparison modes: joined cells with 1 px dividers, the selected cell
 * inverted (ink fill), instantly. ARIA tabs with roving focus; arrows and Home/End move the selection
 * (selection follows focus). The selected tab controls the expanded panel while one is open.
 */
export function ModeSwitch({ modes, value, expanded, onChange, fill = false, className }: {
  modes: ModeSpec[];
  value: CompareMode;
  expanded: boolean;
  onChange: (m: CompareMode) => void;
  /** Stretch the cells across the available width (phones). */
  fill?: boolean;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).getAttribute("role") !== "tab") return;
    const next = nextMode(modes.map((m) => m.value), value, e.key);
    if (!next) return;
    e.preventDefault();
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`#${modeTabId(next)}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Comparison mode" onKeyDown={onKeyDown}
      className={cx("flex border border-line-strong bg-space/40", fill ? "w-full" : "w-max", className)}>
      {modes.map((m, i) => {
        const on = m.value === value;
        return (
          <button key={m.value} type="button" role="tab" id={modeTabId(m.value)} aria-selected={on}
            aria-controls={on && expanded ? MODE_PANEL_ID : undefined} tabIndex={on ? 0 : -1}
            onClick={() => onChange(m.value)}
            className={cx(
              "hit relative whitespace-nowrap font-semibold uppercase leading-none transition-colors duration-150 active:duration-0 focus-visible:z-10",
              // Strips narrowed beside the Why brief (container < 600 px) tighten the cells so all four fit.
              fill ? "flex-auto px-2 py-3 text-[10.5px] tracking-[0.08em]" : "px-3.5 py-[9px] text-[11px] tracking-[0.12em] @max-[600px]:px-2.5 @max-[600px]:tracking-[0.07em]",
              i > 0 && "border-l border-line-strong",
              on ? "bg-ink text-space" : "text-muted hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.14]",
            )}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
