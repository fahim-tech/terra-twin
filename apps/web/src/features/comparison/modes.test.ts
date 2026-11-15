import { describe, expect, it } from "vitest";
import { COMPARE_MODES, nextMode, visibleModes } from "./modes";
import { ReliefViewer } from "./relief";

describe("comparison modes", () => {
  it("keeps a 3D relief slot in the registry", () => {
    const relief = COMPARE_MODES.find((m) => m.value === "relief");
    expect(relief?.label).toBe("3D relief");
  });

  it("never offers 3D relief without a viewer (no placeholder state)", () => {
    expect(visibleModes({ relief: false }).map((m) => m.value)).toEqual(["spatial", "measurements", "evidence", "relevance"]);
  });

  it("offers 3D relief, last, now that the relief viewer is wired", () => {
    expect(ReliefViewer).not.toBeNull();
    const modes = visibleModes({ relief: ReliefViewer !== null }).map((m) => m.value);
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

  it("reaches 3D relief from the keyboard once it is offered, and wraps from it", () => {
    const m = visibleModes({ relief: true }).map((x) => x.value);
    expect(nextMode(m, "relevance", "ArrowRight")).toBe("relief");
    expect(nextMode(m, "relief", "ArrowRight")).toBe("spatial");
    expect(nextMode(m, "spatial", "ArrowLeft")).toBe("relief");
    expect(nextMode(m, "measurements", "End")).toBe("relief");
  });
});
