import { describe, expect, it } from "vitest";
import { decisionG5Label, G5 } from "./glossary";

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
