import { describe, expect, it } from "vitest";
import { decisionG5Label, G5, GLOSSARY, keepsTermCase } from "./glossary";

describe("decisionG5Label", () => {
  it("always uses the G5 strings for leader and tie, whatever the API label says", () => {
    expect(decisionG5Label({ type: "named_leader", label: "something else" })).toBe(G5.leader);
    expect(decisionG5Label({ type: "tied_set", label: "something else" })).toBe(G5.tied);
  });
  it("uses the API label for the other decision types, and null when there is none", () => {
    expect(decisionG5Label({ type: "no_convincing_analog", label: "API text" })).toBe("API text");
    expect(decisionG5Label({ type: "insufficient_evidence", label: null })).toBeNull();
  });
});

describe("glossary", () => {
  it("serves the method-evidence chart terms through the shared glossary", () => {
    for (const k of ["mrr", "megdr", "aeqd", "rho", "kappa"] as const) {
      expect(GLOSSARY[k].label.length).toBeGreaterThan(0);
      expect(GLOSSARY[k].definition.length).toBeGreaterThan(20);
    }
    expect(GLOSSARY.rho.label).toBe("ρ");
    expect(GLOSSARY.kappa.label).toBe("κ");
  });
  it("keeps Greek terms as written instead of upper-casing them", () => {
    expect(keepsTermCase(GLOSSARY.rho.term)).toBe(true);
    expect(keepsTermCase(GLOSSARY.kappa.term)).toBe(true);
    expect(keepsTermCase(GLOSSARY.mrr.term)).toBe(false);
    expect(keepsTermCase(GLOSSARY.operator.term)).toBe(false);
  });
  it("defines the G5-backed entries with the verbatim G5 strings", () => {
    expect(GLOSSARY.stableLeader.definition).toBe(G5.leader);
    expect(GLOSSARY.tie.definition).toBe(G5.tied);
    expect(GLOSSARY.operator.definition).toBe(G5.operator);
    expect(GLOSSARY.synthetic.definition).toBe(G5.validation);
  });
});
