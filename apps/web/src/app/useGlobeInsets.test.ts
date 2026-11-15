import { describe, expect, it } from "vitest";
import { computeInsets } from "./useGlobeInsets";

const R = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON() {} }) as DOMRect;

describe("computeInsets", () => {
  const frame = R(0, 56, 1440, 844);
  it("assigns side panels to left and right", () => {
    expect(computeInsets(frame, [R(12, 68, 300, 820), R(1080, 68, 348, 820)])).toEqual({ top: 0, right: 360, bottom: 0, left: 312 });
  });
  it("assigns a bottom sheet to the bottom", () => {
    expect(computeInsets(frame, [R(12, 500, 1416, 388)])).toEqual({ top: 0, right: 0, bottom: 400, left: 0 });
  });
  it("treats a full-height panel on a portrait tablet as a side inset, not a top inset", () => {
    expect(computeInsets(R(0, 52, 768, 972), [R(376, 64, 380, 948)])).toEqual({ top: 0, right: 392, bottom: 0, left: 0 });
    expect(computeInsets(R(0, 52, 820, 1128), [R(428, 64, 380, 1104)])).toEqual({ top: 0, right: 392, bottom: 0, left: 0 });
  });
  it("treats a full-height panel on a landscape phone as a side inset", () => {
    expect(computeInsets(R(0, 52, 844, 338), [R(452, 64, 380, 314)])).toEqual({ top: 0, right: 392, bottom: 0, left: 0 });
  });
  it("never lets one inset take more than 60 % of the frame", () => {
    expect(computeInsets(R(0, 0, 390, 800), [R(0, 64, 390, 736)]).bottom).toBe(480);
  });
  it("ignores elements outside the frame", () => {
    expect(computeInsets(R(720, 56, 720, 844), [R(12, 68, 300, 820)])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
