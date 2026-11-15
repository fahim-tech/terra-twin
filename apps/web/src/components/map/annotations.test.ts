import { describe, expect, it } from "vitest";
import { labelY, leaderDy } from "./Annotations";

describe("annotation leader rows", () => {
  it("keeps the old placement when the point has no stem (glyph on the ground point)", () => {
    expect(labelY(400, 400, true)).toBe(400 - leaderDy());
    expect(labelY(400, 400, false)).toBe(400 + leaderDy());
    expect(labelY(400, 400, true, 120)).toBe(400 - (120 + 32));
  });

  it("clears the box around the ground point, not a stem's height beyond it", () => {
    // 3D view: the glyph stands 46 px above the point; the AOI box around the point is 120 px half-size.
    const ground = 400, glyph = 354;
    expect(labelY(ground, glyph, true, 120)).toBe(ground - (120 + 32));
    // The label still clears the glyph itself by the default reach.
    expect(labelY(ground, glyph, true, 0)).toBe(glyph - leaderDy());
    expect(labelY(ground, glyph, true, 20)).toBe(glyph - leaderDy());
  });

  it("goes below the box when the leader points south", () => {
    expect(labelY(400, 354, false, 120)).toBe(400 + 152);
    expect(labelY(400, 354, false, 0)).toBe(400 + leaderDy());
  });
});
