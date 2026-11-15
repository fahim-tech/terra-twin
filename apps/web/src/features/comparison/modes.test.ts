import { describe, expect, it } from "vitest";
import { COMPARE_MODES, nextMode, visibleModes } from "./modes";
import { ReliefViewer } from "./relief";

describe("comparison modes", () => {
  it("keeps a 3D relief slot in the registry", () => {
    const relief = COMPARE_MODES.find((m) => m.value === "relief");
    expect(relief?.label).toBe("3D relief");
  });

  it("does not offer 3D relief until a viewer is wired (no placeholder state)", () => {
    expect(visibleModes({ relief: false }).map((m) => m.value)).toEqual(["spatial", "measurements", "evidence", "relevance"]);
    expect(visibleModes({ relief: ReliefViewer !== null }).some((m) => m.value === "relief")).toBe(ReliefViewer !== null);
  });

  it("offers 3D relief last once wired", () => {
    const modes = visibleModes({ relief: true }).map((m) => m.value);
    expect(modes).toEqual(["spatial", "measurements", "evidence", "relevance", "relief"]);
  });

  it("moves through the switch with arrows (wrapping) and Home/End", () => {
    const m = visibleModes({ relief: false }).map((x) => x.value);
    expect(nextMode(m, "spatial", "ArrowRight")).toBe("measurements");
    expect(nextMode(m, "relevance", "ArrowRight")).toBe("spatial");
    expect(nextMode(m, "spatial", "ArrowLeft")).toBe("relevance");
    expect(nextMode(m, "evidence", "Home")).toBe("spatial");
    expect(nextMode(m, "measurements", "End")).toBe("relevance");
    expect(nextMode(m, "measurements", "Enter")).toBeNull();
    // A mode that is not offered never moves the selection.
    expect(nextMode(m, "relief", "ArrowRight")).toBeNull();
  });
});
