import { describe, expect, it } from "vitest";
import { buildHash, parseHash } from "./useUrlState";

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
});
