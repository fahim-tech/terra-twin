import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../lib/glossary";
import {
  DECISION_WORDS, decisionWord, legendKinds, NEAR_ANALOG, OUTCOME_MARKS, OUTCOME_ORDER, OutcomeMark, outcomeKind, type OutcomeKind, STATUS_MARKS, StatusMark, type StatusKind,
} from "./marks";

const OUTCOMES: OutcomeKind[] = ["leader", "tie", "none", "screening", "not_loaded"];
const STATUSES: StatusKind[] = ["on", "off", "partial", "caution", "fault", "struck"];

describe("decision outcome marks", () => {
  it("maps every research decision type to its mark", () => {
    expect(outcomeKind("named_leader")).toBe("leader");
    expect(outcomeKind("tied_set")).toBe("tie");
    // Abstention is a result: no analog named, never the "not loaded" dash.
    expect(outcomeKind("no_convincing_analog")).toBe("none");
    expect(outcomeKind("insufficient_evidence")).toBe("none");
    // Nothing loaded (or no research configuration for the mission).
    expect(outcomeKind(undefined)).toBe("not_loaded");
    expect(outcomeKind(null)).toBe("not_loaded");
    expect(outcomeKind("")).toBe("not_loaded");
    // A type this build does not know is loaded but names no analog.
    expect(outcomeKind("some_new_type")).toBe("none");
  });

  it("gives each outcome its own shape: solid, nested, hollow, brackets, dash", () => {
    expect(Object.fromEntries(OUTCOMES.map((k) => [k, OUTCOME_MARKS[k].shape])))
      .toEqual({ leader: "solid", tie: "nested", none: "hollow", screening: "brackets", not_loaded: "dash" });
    expect(new Set(OUTCOMES.map((k) => OUTCOME_MARKS[k].shape)).size).toBe(OUTCOMES.length);
  });

  it("draws decisions in ink: a tie is a valid outcome, not a caution", () => {
    for (const k of OUTCOMES) expect(["ink", "muted", "faint"]).toContain(OUTCOME_MARKS[k].ink);
    expect(OUTCOME_MARKS.tie.ink).toBe("ink");
    expect(OUTCOME_MARKS.leader.ink).toBe(OUTCOME_MARKS.tie.ink);
  });

  it("is drawn as an aria-hidden SVG with the shape's own parts, never a typed glyph", () => {
    const html = (k: OutcomeKind) => renderToStaticMarkup(createElement(OutcomeMark, { kind: k }));
    for (const k of OUTCOMES) {
      const h = html(k);
      expect(h.startsWith("<svg")).toBe(true);
      expect(h).toContain('aria-hidden="true"');
      expect(h).toContain(`data-mark="${k}"`);
      expect(h.replace(/<[^>]*>/g, "")).toBe(""); // no text content at all
    }
    // The tie is two nested squares: an outline and a smaller filled square inside it.
    expect(html("tie").match(/<rect/g)).toHaveLength(2);
    expect(html("leader").match(/<rect/g)).toHaveLength(1);
    expect(html("none")).toContain('fill="none"');
    expect(html("screening")).toContain("<path");
  });
});

describe("outcome legends", () => {
  it("name only the marks on screen, each once, in the one legend order", () => {
    expect(OUTCOME_ORDER).toEqual(["leader", "tie", "none", "screening", "not_loaded"]);
    expect(legendKinds(["tie", "leader", "tie", "leader"])).toEqual(["leader", "tie"]);
    expect(legendKinds(["not_loaded", "none"])).toEqual(["none", "not_loaded"]);
    expect(legendKinds([])).toEqual([]);
    // Real research decisions, as the Mars list draws them: two kinds, never the hollow mark nobody shows.
    expect(legendKinds(["named_leader", "tied_set", "named_leader"].map(outcomeKind))).toEqual(["leader", "tie"]);
  });
});

describe("status marks", () => {
  it("gives every status its own shape, so colour is never the only cue", () => {
    expect(new Set(STATUSES.map((k) => STATUS_MARKS[k].shape)).size).toBe(STATUSES.length);
    expect(STATUS_MARKS.caution.shape).toBe("triangle");
    expect(STATUS_MARKS.fault.shape).toBe("crossed");
  });

  it("keeps amber for cautions and red for faults only", () => {
    expect(STATUS_MARKS.caution.tone).toBe("warn");
    expect(STATUS_MARKS.fault.tone).toBe("bad");
    for (const k of STATUSES.filter((s) => s !== "caution" && s !== "fault")) expect(["ink", "faint"]).toContain(STATUS_MARKS[k].tone);
  });

  it("is drawn as an aria-hidden SVG, with a planet tone only where asked", () => {
    const h = renderToStaticMarkup(createElement(StatusMark, { state: "on", tone: "mars" }));
    expect(h).toContain('aria-hidden="true"');
    expect(h).toContain("text-mars");
    // A caution keeps its amber whatever tone is passed.
    expect(renderToStaticMarkup(createElement(StatusMark, { state: "caution", tone: "earth" }))).toContain("text-warn");
  });
});

describe("words", () => {
  it("names each decision the way the glossary does", () => {
    expect(DECISION_WORDS.named_leader).toBe(GLOSSARY.stableLeader.label);
    expect(DECISION_WORDS.tied_set).toBe(GLOSSARY.tie.label);
    expect(DECISION_WORDS.insufficient_evidence).toBe(GLOSSARY.notEnough.label);
    expect(DECISION_WORDS.no_convincing_analog).toBe("No convincing analog");
    expect(decisionWord("tied_set")).toBe("Tie");
    expect(decisionWord("some_new_type")).toBe("some new type");
  });

  it("has one wording for a cell near a documented analog of the reference set", () => {
    expect(NEAR_ANALOG).toBe("Near documented analog");
  });
});
