import { describe, expect, it } from "vitest";
import { factorValue, FactorRecord, temporalText } from "./factors";

const rec = (o: Partial<FactorRecord>): FactorRecord => FactorRecord.parse({ factor_id: "x", label: "X", status: "available", value: 1, ...o });

describe("factor display", () => {
  it("prints a value with units only when available", () => {
    expect(factorValue(rec({ value: 311, unit: "J m-2 K-1 s-1/2" }))).toBe("311 J m-2 K-1 s-1/2");
    expect(factorValue(rec({ value: 216.47, unit: "K" }))).toBe("216 K");
    expect(factorValue(rec({ value: -0.2773, unit: "consistency index (-1..1)" }))).toBe("-0.277 consistency index (-1..1)");
    expect(factorValue(rec({ value: "HNt", unit: "class" }))).toBe("HNt");
  });
  it("never prints a value for a factor that is not available, even if one is sent", () => {
    expect(factorValue(rec({ status: "outside_coverage", value: 0, reason: "60S-60N only" }))).toBeNull();
    expect(factorValue(rec({ status: "not_integrated", value: null }))).toBeNull();
  });
  it("states season and local time from the record", () => {
    expect(temporalText(rec({ temporal_context: { season_ls: 90, local_time_ltst_h: 14 } }))).toBe("Ls 90° · 14 h LTST");
    expect(temporalText(rec({ temporal_context: null }))).toBeNull();
  });
});
