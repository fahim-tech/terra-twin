import { describe, expect, it } from "vitest";
import { rampGradient, rampPosition, rampTicks, tickDigits } from "./legend";
import { measuresText, sSpoken, sText } from "./readout";

describe("rampTicks", () => {
  it("spaces ticks evenly across the legend domain", () => {
    expect(rampTicks([0, 1], 5)).toEqual([
      { value: 0, at: 0 }, { value: 0.25, at: 0.25 }, { value: 0.5, at: 0.5 }, { value: 0.75, at: 0.75 }, { value: 1, at: 1 },
    ]);
  });
  it("places ticks of an offset domain by position, not by value", () => {
    const t = rampTicks([0.2, 1], 3);
    expect(t.map((x) => x.at)).toEqual([0, 0.5, 1]);
    expect(t[1].value).toBeCloseTo(0.6, 12);
  });
  it("draws nothing for an unusable domain", () => {
    expect(rampTicks([1, 0])).toEqual([]);
    expect(rampTicks([0, Number.NaN])).toEqual([]);
    expect(rampTicks([0, 1], 1)).toEqual([]);
  });
});

describe("tickDigits", () => {
  it("prints quarter steps with two decimals and tenths with one", () => {
    expect(tickDigits(rampTicks([0, 1], 5))).toBe(2);
    expect(tickDigits(rampTicks([0, 1], 6))).toBe(1);
    expect(tickDigits(rampTicks([0, 100], 5))).toBe(0);
  });
});

describe("rampPosition", () => {
  it("maps a display threshold onto the ramp", () => {
    expect(rampPosition([0, 1], 0.3)).toBeCloseTo(0.3, 12);
    expect(rampPosition([0.2, 1], 0.6)).toBeCloseTo(0.5, 12);
  });
  it("clamps to the ends and refuses missing values", () => {
    expect(rampPosition([0, 1], 1.4)).toBe(1);
    expect(rampPosition([0, 1], -1)).toBe(0);
    expect(rampPosition([0, 1], null)).toBeNull();
    expect(rampPosition([1, 1], 0.5)).toBeNull();
  });
});

describe("rampGradient", () => {
  it("writes the stops left to right as percentages", () => {
    expect(rampGradient([[0, "#440154"], [0.1111, "#482878"], [1, "#fde725"]])).toBe("linear-gradient(to right, #440154 0%, #482878 11.11%, #fde725 100%)");
  });
  it("has no ramp without stops", () => expect(rampGradient([])).toBeNull());
});

describe("readout text", () => {
  it("prints S with three decimals and never turns a missing value into 0", () => {
    expect(sText(0.614)).toBe("0.614");
    expect(sText(0)).toBe("0.000");
    expect(sText(null)).toBe("—");
    expect(sText(undefined)).toBe("—");
    expect(sText(Number.NaN)).toBe("—");
    expect(sSpoken(null)).toBe("not available");
    expect(sSpoken(0.7184)).toBe("0.718");
  });
  it("states the measures behind a score, or that the count is unknown", () => {
    expect(measuresText(1, 8)).toBe("8/8");
    expect(measuresText(6 / 7, 7)).toBe("6/7");
    expect(measuresText(null, 8)).toBe("—/8");
  });
});
