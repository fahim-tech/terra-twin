import { describe, expect, it } from "vitest";
import { placeNear } from "./places";

describe("placeNear", () => {
  it("names the published discovery windows and nothing else", () => {
    expect(placeNear(37.0624, 86.2069)?.region).toBe("Xinjiang, China");
    expect(placeNear(37.2874, 97.5069)?.text).toContain("Qaidam Basin");
    expect(placeNear(0, 0)).toBeNull();
    expect(placeNear(37.5, 86.21)).toBeNull();
  });
});
