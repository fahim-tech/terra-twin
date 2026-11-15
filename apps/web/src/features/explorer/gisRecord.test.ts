import { describe, expect, it } from "vitest";
import { baselineText, flagText } from "./gisRecord";

describe("baselineText", () => {
  it("prints one baseline in metres", () => expect(baselineText(926.19)).toBe("926 m"));
  it("prints a set of baselines as a range", () => expect(baselineText([926.19, 2315.47, 9261.87])).toBe("926–9,262 m"));
  it("never prints a missing baseline as 0", () => {
    expect(baselineText(null)).toBe("—");
    expect(baselineText(undefined)).toBe("—");
    expect(baselineText([])).toBe("—");
  });
});

describe("flagText", () => {
  it("words a known flag and keeps an unknown one readable", () => {
    expect(flagText("mars_grid_is_binned_altimetry_not_observation")).toMatch(/^Mars grid is binned altimetry/);
    expect(flagText("polar_gap")).toBe("Polar gap");
  });
});
