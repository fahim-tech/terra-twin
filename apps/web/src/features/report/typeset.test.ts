import { describe, expect, it } from "vitest";
import { PLANETARY_DIFFERENCES } from "../comparison/science";
import { cssSafeId, dossierPrintCss } from "./print";
import { indexLabel, splitDesignation, splitNumerals } from "./typeset";

const nums = (t: string) => splitNumerals(t).filter((s) => s.num).map((s) => s.text);

describe("splitNumerals", () => {
  it("sets numbers, with their sign or approximation mark, apart from words and units", () => {
    expect(splitNumerals("3.71 m/s²")).toEqual([{ text: "3.71", num: true }, { text: " m/s²", num: false }]);
    expect(nums("~0.6 kPa (variable)")).toEqual(["~0.6"]);
    expect(nums("78 % N₂, 21 % O₂")).toEqual(["78", "21"]);
    expect(nums("249,165 land cells")).toEqual(["249,165"]);
    expect(nums("Δ −0.02 and +1.5")).toEqual(["−0.02", "+1.5"]);
    expect(nums("Tie · 3 equivalent windows")).toEqual(["3"]);
  });

  it("leaves words with hyphens, subscripts and superscripts alone", () => {
    expect(nums("planetocentric, east-positive")).toEqual([]);
    expect(nums("~95 % CO₂")).toEqual(["~95"]);
    expect(splitNumerals("No known biosphere")).toEqual([{ text: "No known biosphere", num: false }]);
  });

  it("always reassembles to the original text", () => {
    for (const p of PLANETARY_DIFFERENCES) {
      for (const t of [p.factor, p.mars, p.earth]) expect(splitNumerals(t).map((s) => s.text).join("")).toBe(t);
    }
    expect(splitNumerals("")).toEqual([]);
  });

  it("splits a window designation from its qualifier for display", () => {
    expect(splitDesignation("Window 217 · roughness decile 8")).toEqual({ name: "Window 217", detail: "roughness decile 8" });
    expect(splitDesignation("Atacama Yungay")).toEqual({ name: "Atacama Yungay", detail: null });
    expect(splitDesignation("Cell near Holuhraun")).toEqual({ name: "Cell near Holuhraun", detail: null });
  });

  it("pads dossier indices to two digits", () => {
    expect(indexLabel(1)).toBe("01");
    expect(indexLabel(11)).toBe("11");
  });
});

describe("dossier print stylesheet", () => {
  it("writes only a safe analysis id into the page margins", () => {
    expect(cssSafeId('938f93c71036"; } body { display:none')).toBe("938f93c71036bodydisplaynone");
    const css = dossierPrintCss('abc"}');
    expect(css).toContain('content: "Analysis abc"');
    expect(css).not.toContain('abc"}');
  });

  it("prints black hairlines on white with page numbers", () => {
    const css = dossierPrintCss("938f93c71036");
    expect(css).toContain("--color-line: #000");
    expect(css).toContain("--color-surface: #fff");
    // The app runs in a dark colour scheme; paper is light, including the page margins.
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("counter(page)");
    expect(css).toContain("counter(pages)");
  });
});
