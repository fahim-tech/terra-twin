import { describe, expect, it } from "vitest";
import { environmentRows } from "./environment";
import { FactorRecord } from "./factors";

const fac = (factor_id: string, value: number | string, unit: string) => FactorRecord.parse({ factor_id, label: factor_id, status: "available", value, unit });
const factors = [fac("water_ice", -0.3409, "consistency index (-1..1)"), fac("surface_temperature", 217.48, "K"), fac("rock_abundance", 32, "%"), fac("thermal_inertia", 296, "J m-2 K-1 s-1/2"), fac("geologic_unit", "mNhm", "class"), fac("solar_energy", 171.076, "W m-2")];
const ctx = (perm: number | null, ai: number, kg: string, desc: string) => ({ planet: "earth", layers: {
  permafrost_probability: { layer: "permafrost_probability", source_id: "x", value: perm, units: "fraction 0-1", feature_state: perm === null ? "missing" : "modelled", missing_reason: perm === null ? "outside product coverage (Northern Hemisphere >= 25N)" : null, native_resolution: null, comparability: null },
  aridity_index: { layer: "aridity_index", source_id: "x", value: ai, units: "1", feature_state: "modelled", missing_reason: null, native_resolution: null, comparability: null },
  koppen_geiger_1991_2020: { layer: "koppen_geiger_1991_2020", source_id: "x", value: kg, units: "class", feature_state: "modelled", missing_reason: null, native_resolution: null, comparability: null, class_description: desc },
} });

describe("environmentRows", () => {
  it("states both records and calls the ice row a break when only Earth has ground ice", () => {
    const rows = environmentRows(factors, ctx(0.998, 0.1534, "ET", "Polar, tundra"), 0.9967);
    const ice = rows[0];
    expect(ice.mars).toBe("-0.34 (SWIM index, −1 to 1)");
    expect(ice.earth).toBe("permafrost probability 1.00");
    expect(ice.tone).toBe("breaks");
    expect(rows[1]).toMatchObject({ mars: "217 K", earth: "ET · Polar, tundra", tone: null });
    expect(rows[2].earth).toBe("aridity index 0.15 (P / ET₀)");
    expect(rows[3].earth).toBe("bare-like ground 99.7 % (WorldCover)");
  });
  it("never invents a value: missing records say so and give no reading", () => {
    const rows = environmentRows(undefined, ctx(null, 0, "BWh", "Arid, desert, hot"), null);
    expect(rows[0]).toMatchObject({ mars: "no record", earth: "outside product coverage (Northern Hemisphere >= 25N)", reading: null, tone: null });
    expect(rows[2].earth).toBe("aridity index < 0.0001 (P / ET₀)");
    expect(rows[3].earth).toBe("no land-cover record for this candidate");
  });
});
