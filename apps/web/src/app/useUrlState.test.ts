import { describe, expect, it } from "vitest";
import { buildHash, parentStage, parseHash } from "./useUrlState";

describe("URL state", () => {
  it("round-trips a research site investigation", () => {
    const h = buildHash({ stage: "compare", site: "Jezero", lat: null, lon: null, mission: "landing_site", cand: "t2:Atacama Yungay" });
    expect(h).toBe("#/compare?site=Jezero&mission=landing_site&cand=t2%3AAtacama+Yungay");
    expect(parseHash(h)).toEqual({ stage: "compare", site: "Jezero", lat: null, lon: null, mission: "landing_site", cand: "t2:Atacama Yungay" });
  });
  it("keeps arbitrary coordinates", () => {
    const u = parseHash(buildHash({ stage: "mars", site: null, lat: -60, lon: 10, mission: null, cand: null }))!;
    expect(u.lat).toBe(-60);
    expect(u.lon).toBe(10);
  });
  it("rejects unknown stages", () => {
    expect(parseHash("#/admin")).toBeNull();
    expect(parseHash("")).toBeNull();
  });
  it("gives each stage reached by history a parent that is not itself", () => {
    expect(parentStage("report", true, "evidence")).toBe("compare");
    expect(parentStage("report", false, "evidence")).toBe("earth");
    expect(parentStage("compare", true, "report")).toBe("earth");
    expect(parentStage("earth", true, "compare")).toBe("mars");
    expect(parentStage("evidence", true, "report")).toBe("report");
    expect(parentStage("evidence", true, "evidence")).toBe("mars");
  });
});
