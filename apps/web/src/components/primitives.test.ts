import { describe, expect, it } from "vitest";
import { termPopoverShift, termPopoverWidth } from "./primitives";

describe("term popover placement", () => {
  it("is 320 px wide, at most 80 % of a narrow viewport", () => {
    expect(termPopoverWidth(1440)).toBe(320);
    expect(termPopoverWidth(360)).toBe(288);
  });

  it("does not move a popover that fits", () => {
    expect(termPopoverShift(100, 1440)).toBe(0);
    expect(termPopoverShift(1440 - 16 - 320, 1440)).toBe(0);
  });

  it("shifts a popover left so it ends 16 px inside the viewport", () => {
    // Term at x = 1300 on a 1440 px screen: 1300 + 320 would end at 1620.
    expect(termPopoverShift(1300, 1440)).toBe(1440 - 16 - 1620);
    // Phone: 390 px wide, popover 312 px; a term at x = 200 shifts 138 px left.
    expect(termPopoverShift(200, 390)).toBeCloseTo(390 - 16 - (200 + 312));
  });
});
