import { describe, expect, it } from "vitest";
import { decisionG5Label, G5, GLOSSARY, keepsTermCase, zoneName } from "./glossary";

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

describe("zoneName", () => {
  it("typesets ids without renaming them", () => {
    expect(zoneName("Jezero")).toBe("Jezero");
    expect(zoneName("Arcadia_Planitia")).toBe("Arcadia Planitia");
    expect(zoneName("Deuteronilus1_2")).toBe("Deuteronilus 1–2");
    expect(zoneName("Hellas3")).toBe("Hellas 3");
    expect(zoneName("Hellas_Hellas2")).toBe("Hellas Hellas 2");
    expect(zoneName("Coprates_EMelas_Chasm")).toBe("Coprates E Melas Chasm");
  });
  it("fixes only the spelling the data itself gives (Planitia), and guesses no other name", () => {
    expect(zoneName("Acidalia_Plantia")).toBe("Acidalia Planitia");
    expect(zoneName("S_Meridiani_Sinus_Planium")).toBe("S Meridiani Sinus Planium");
    expect(zoneName("Noactis_Landing")).toBe("Noactis Landing");
  });
  it("leaves compass prefixes the ids already separate, and names that merely start with N, S, E or W", () => {
    expect(zoneName("SE_Marineris")).toBe("SE Marineris");
    expect(zoneName("NE_Marineris_Crater")).toBe("NE Marineris Crater");
    expect(zoneName("S_Nectaris_Fossae")).toBe("S Nectaris Fossae");
    expect(zoneName("Newton_Crater")).toBe("Newton Crater");
    expect(zoneName("Erebus_Montes")).toBe("Erebus Montes");
    expect(zoneName("McLaughlin_Crater")).toBe("McLaughlin Crater");
  });
  it("is idempotent, so a display name can be passed through again", () => {
    for (const id of ["Deuteronilus1_2", "Hellas_Hellas2", "Coprates_EMelas_Chasm", "Acidalia_Plantia", "SE_Marineris"]) {
      expect(zoneName(zoneName(id))).toBe(zoneName(id));
    }
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
