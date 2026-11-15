import { describe, expect, it } from "vitest";
import { instrumentWords } from "./wording";

describe("instrumentWords", () => {
  it("says the research archive instead of the file format, keeping the rest of the reason", () => {
    expect(instrumentWords("Mars 50 km window descriptors are stored only in the research pickles, which are not loaded (untrusted format)."))
      .toBe("Mars 50 km window descriptors are stored only in the research archive, which this instrument does not read.");
    expect(instrumentWords("Per-rotation scores are stored only in the research pickles, which are not loaded (untrusted format)."))
      .toBe("Per-rotation scores are stored only in the research archive, which this instrument does not read.");
    expect(instrumentWords("exists only in the research pickles, which are never loaded)")).toBe("exists only in the research archive, which this instrument does not read)");
    expect(instrumentWords("See the research pickles.")).toBe("See the research archive.");
  });
  it("leaves other reasons and missing values alone", () => {
    expect(instrumentWords("Window not cached on the server.")).toBe("Window not cached on the server.");
    expect(instrumentWords(null)).toBeNull();
    expect(instrumentWords(undefined)).toBeNull();
  });
});
