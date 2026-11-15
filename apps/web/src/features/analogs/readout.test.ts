import { describe, expect, it } from "vitest";
import { tieNote } from "./readout";

const tie = { type: "tied_set", members: ["rand_d8_233", "rand_d8_217", "rand_d8_224"] };

describe("tieNote", () => {
  it("names the tied set and its size for a member", () => {
    expect(tieNote(tie, "rand_d8_217")).toBe("One of 3 tied windows");
  });
  it("gives every member the same words, so no member reads as first", () => {
    const notes = new Set(tie.members.map((id) => tieNote(tie, id)));
    expect(notes.size).toBe(1);
    expect([...notes][0]).not.toMatch(/\b[12] of\b/);
  });
  it("says nothing for a window outside the tie, a stable leader or no selection", () => {
    expect(tieNote(tie, "Atacama Yungay")).toBeNull();
    expect(tieNote({ type: "named_leader", members: ["Atacama Yungay"] }, "Atacama Yungay")).toBeNull();
    expect(tieNote(tie, null)).toBeNull();
    expect(tieNote({ type: "insufficient_evidence", members: [] }, undefined)).toBeNull();
  });
});
