import { describe, expect, it } from "vitest";
import { G5 } from "../../lib/glossary";
import { scoreBasisLine } from "./basis";

describe("relief caption: the score's basis", () => {
  it("quotes the research basis verbatim for a research window (tier 2)", () => {
    expect(scoreBasisLine(2, "comparison")).toBe(`The comparison's score uses “${G5.toggleOom}”.`);
    expect(scoreBasisLine(2, "research")).toBe(`The research score uses “${G5.toggleOom}”.`);
    expect(scoreBasisLine(2, "comparison")).toContain("Earth terrain: as MOLA would observe it at this Mars site");
  });

  it("never claims the MOLA observation model for a global-screen cell (tier 1): its S is Earth as measured", () => {
    for (const who of ["comparison", "research"] as const) {
      const line = scoreBasisLine(1, who);
      expect(line).toBe("The global screen's score uses Earth terrain as measured.");
      expect(line).not.toMatch(/MOLA/);
    }
  });
});
