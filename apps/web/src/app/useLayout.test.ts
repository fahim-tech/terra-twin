import { describe, expect, it } from "vitest";
import { isLandscapePhone, layoutFor } from "./useLayout";

describe("layoutFor", () => {
  it("uses both axes: a phone held sideways is still a phone", () => {
    expect(layoutFor(390, 844)).toBe("phone");
    expect(layoutFor(844, 390)).toBe("phone");
    expect(layoutFor(768, 1024)).toBe("tablet");
    expect(layoutFor(1024, 768)).toBe("tablet");
    expect(layoutFor(1440, 900)).toBe("desktop");
  });
  it("marks only short landscape windows as landscape phones", () => {
    expect(isLandscapePhone(844, 390)).toBe(true);
    expect(isLandscapePhone(390, 844)).toBe(false);
    expect(isLandscapePhone(1024, 768)).toBe(false);
  });
});
