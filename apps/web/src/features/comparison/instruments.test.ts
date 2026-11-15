import { describe, expect, it } from "vitest";
import { DELTA_TICKS, LOG_TICKS, ratioPos, ratioRow, relationParts } from "./science";

describe("ratio chart axis", () => {
  it("puts the Mars reference 1.00 at the centre with reciprocal ticks either side", () => {
    expect(LOG_TICKS.map((t) => t.label)).toEqual(["0.50", "0.67", "1.00", "1.50", "2.00"]);
    const one = LOG_TICKS.find((t) => t.v === 1)!;
    expect(one.pos).toBeCloseTo(0.5);
    expect(LOG_TICKS[1].pos + LOG_TICKS[3].pos).toBeCloseTo(1);
    expect(LOG_TICKS[0].pos).toBeCloseTo(0);
    expect(LOG_TICKS[4].pos).toBeCloseTo(ratioPos(2));
  });

  it("labels the Hurst Δ axis with typographic signs", () => {
    expect(DELTA_TICKS.map((t) => t.label)).toEqual(["−0.30", "−0.15", "0", "+0.15", "+0.30"]);
    expect(DELTA_TICKS[2].pos).toBeCloseTo(0.5);
  });
});

describe("relation parts", () => {
  it("splits the relation into a mono figure and words, with the same rounding", () => {
    const up = ratioRow("mean_slope_deg", 2.7, 3.6, 0.3);
    expect(relationParts(up)).toEqual({ figure: "1.33×", text: "higher on Earth" });
    expect(`${relationParts(up).figure} ${relationParts(up).text}`).toBe(up.relation);
    const down = ratioRow("relative_relief_m", 986, 650, 0.2);
    expect(`${relationParts(down).figure} ${relationParts(down).text}`).toBe(down.relation);
    const hurst = ratioRow("hurst_2pt", 0.64, 0.66, 0.78);
    expect(relationParts(hurst)).toEqual({ figure: "+0.02", text: "on Earth" });
  });

  it("has no figure for equal or missing values (never a 0)", () => {
    expect(relationParts(ratioRow("mean_slope_deg", 2, 2, 1))).toEqual({ figure: null, text: "Equal on both" });
    expect(relationParts(ratioRow("mean_slope_deg", null, 2, null))).toEqual({ figure: null, text: "Not comparable — value missing" });
  });
});
