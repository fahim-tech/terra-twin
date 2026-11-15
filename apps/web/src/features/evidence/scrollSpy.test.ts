import { describe, expect, it } from "vitest";
import { activeSection, READING_LINE } from "./scrollSpy";
import { SECTION_IDS, SECTIONS, sectionLabel, sectionNo } from "./sections";

describe("activeSection", () => {
  const boxes = [
    { id: "a", top: -900 },
    { id: "b", top: -120 },
    { id: "c", top: 240 },
    { id: "d", top: 1100 },
  ];

  it("is the last section whose top has crossed the reading line", () => {
    expect(activeSection(boxes, 200)).toBe("b");
    expect(activeSection(boxes, 240)).toBe("c");
  });

  it("is nothing while the reader is above the first section", () => {
    expect(activeSection([{ id: "a", top: 400 }, { id: "b", top: 900 }], 250)).toBeNull();
  });

  it("is the last section at the end of the scroll", () => {
    expect(activeSection(boxes, 200, true)).toBe("d");
  });

  it("does not depend on the order the boxes arrive in", () => {
    expect(activeSection([...boxes].reverse(), 200)).toBe("b");
  });

  it("is nothing without sections", () => {
    expect(activeSection([], 200, true)).toBeNull();
  });

  it("keeps the reading line below a jumped-to section's scroll margin on a phone", () => {
    // Phone stage height (844 − 52 px top bar) × line must clear the 76 px scroll margin.
    expect((844 - 52) * READING_LINE).toBeGreaterThan(76);
  });
});

describe("sections", () => {
  it("numbers the sections 01–10 in reading order", () => {
    expect(SECTIONS).toHaveLength(10);
    expect(sectionNo("ev-process")).toBe("01");
    expect(sectionNo("ev-provenance")).toBe("10");
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
  });

  it("labels each section", () => {
    expect(sectionLabel("ev-support")).toBe("Observation support");
  });
});
