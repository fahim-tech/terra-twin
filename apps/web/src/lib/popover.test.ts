import { describe, expect, it } from "vitest";
import { termPopoverPlacement } from "./popover";

const desk = { w: 1440, h: 900 };
const pop = { w: 320, h: 120 };

describe("term popover placement", () => {
  it("opens above the trigger, starting at its left edge, when it fits", () => {
    expect(termPopoverPlacement({ left: 400, top: 500, bottom: 518 }, pop, desk)).toEqual({ left: 400, top: 500 - 8 - 120, below: false });
  });

  it("opens below a trigger near the top of the screen (a term at the top of a scrolling panel)", () => {
    expect(termPopoverPlacement({ left: 1068, top: 190, bottom: 208 }, { w: 320, h: 190 }, desk)).toEqual({ left: 1068, top: 216, below: true });
  });

  it("takes the side with more room when it fits on neither, and stays inside the viewport", () => {
    const phone = { w: 390, h: 300 };
    const p = termPopoverPlacement({ left: 40, top: 120, bottom: 138 }, { w: 312, h: 260 }, phone);
    expect(p.below).toBe(true); // 142 px of room below vs 100 px above
    expect(p.top).toBe(300 - 12 - 260); // pinned to the bottom margin
    const q = termPopoverPlacement({ left: 40, top: 200, bottom: 218 }, { w: 312, h: 260 }, phone);
    expect(q.below).toBe(false); // 180 px of room above vs 62 px below
    expect(q.top).toBe(12); // pinned to the top margin
  });

  it("moves left so it ends a margin inside the right edge, never past the left margin", () => {
    expect(termPopoverPlacement({ left: 1300, top: 500, bottom: 518 }, pop, desk).left).toBe(1440 - 12 - 320);
    expect(termPopoverPlacement({ left: 4, top: 500, bottom: 518 }, pop, desk).left).toBe(12);
    // A popover as wide as a narrow screen allows: left margin wins.
    expect(termPopoverPlacement({ left: 200, top: 500, bottom: 518 }, { w: 366, h: 120 }, { w: 390, h: 844 }).left).toBe(12);
  });
});
