import { describe, expect, it } from "vitest";
import { parseCoordinate } from "./MarsSearch";

describe("parseCoordinate", () => {
  it("accepts decimal pairs and hemispheres", () => {
    expect(parseCoordinate("18.4, 77.5")).toEqual({ lat: 18.4, lon: 77.5 });
    expect(parseCoordinate("4.6 S 137.4 E")).toEqual({ lat: -4.6, lon: 137.4 });
    expect(parseCoordinate("10N 200")).toEqual({ lat: 10, lon: -160 });
  });
  it("rejects names and out-of-range values", () => {
    expect(parseCoordinate("Jezero")).toBeNull();
    expect(parseCoordinate("95, 10")).toBeNull();
  });
});
