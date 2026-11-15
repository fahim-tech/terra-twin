/** Placement of the glossary <Term> popover, kept pure so it can be tested. */

export interface PopoverPlacement {
  /** Viewport (position: fixed) coordinates of the popover's top-left corner, px. */
  left: number;
  top: number;
  /** True when the popover opens below its trigger instead of above it. */
  below: boolean;
}

/**
 * Where a term popover goes, in viewport coordinates. It is rendered at a fixed position (in a portal), so
 * no scrolling panel or clipped strip can cut it. It opens above the trigger, `gap` px away, when it fits
 * there; otherwise below when it fits there; otherwise on whichever side has more room, pinned inside the
 * viewport. Horizontally it starts at the trigger's left edge and moves left as far as needed to keep a
 * `margin` from the right edge (never past the left margin).
 */
export function termPopoverPlacement(
  trigger: { left: number; top: number; bottom: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  gap = 8,
  margin = 12,
): PopoverPlacement {
  const roomAbove = trigger.top - gap - margin;
  const roomBelow = viewport.h - margin - (trigger.bottom + gap);
  const below = size.h > roomAbove && (size.h <= roomBelow || roomBelow > roomAbove);
  const top = below
    ? Math.max(margin, Math.min(trigger.bottom + gap, viewport.h - margin - size.h))
    : Math.max(margin, trigger.top - gap - size.h);
  const left = Math.max(margin, Math.min(trigger.left, viewport.w - margin - size.w));
  return { left, top, below };
}
