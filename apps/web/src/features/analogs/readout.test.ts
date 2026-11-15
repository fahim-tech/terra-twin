import { describe, expect, it } from "vitest";
import { tiedWindows, tiedWindowsListed, tieNote } from "./readout";

const tie = { type: "tied_set", members: ["rand_d8_233", "rand_d8_217", "rand_d8_224"] };

describe("tieNote", () => {
  it("names the tied set and its size for a member, in the app's one tie wording", () => {
    expect(tieNote(tie, "rand_d8_217")).toBe("One of 3 tied windows");
    expect(tieNote(tie, "rand_d8_217")).toBe(tiedWindows(3));
    expect(tiedWindowsListed(3)).toBe("One of 3 tied windows (listed west to east)");
  });
  it("gives every member the same words, so no member reads as first", () => {
    const notes = new Set(tie.members.map((id) => tieNote(tie, id)));
    expect(notes.size).toBe(1);
    expect([...notes][0]).not.toMatch(/\b\d+ of \d+\b/);
    expect(tiedWindowsListed(3)).not.toMatch(/\(\d+ of \d+\)/);
  });
  it("says nothing for a window outside the tie, a stable leader or no selection", () => {
    expect(tieNote(tie, "Atacama Yungay")).toBeNull();
    expect(tieNote({ type: "named_leader", members: ["Atacama Yungay"] }, "Atacama Yungay")).toBeNull();
    expect(tieNote(tie, null)).toBeNull();
    expect(tieNote({ type: "insufficient_evidence", members: [] }, undefined)).toBeNull();
  });
});
