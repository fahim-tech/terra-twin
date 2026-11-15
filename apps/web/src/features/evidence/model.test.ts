import { describe, expect, it } from "vitest";
import fixture from "./evidence.fixture.json";
import { buildModel, fmtStamp, niceTicks, parseStage, zoomedTicks } from "./model";

describe("evidence model", () => {
  const m = buildModel(fixture);

  it("reads the headline figures from the payload", () => {
    expect(m.key.directTop1).toBeCloseTo(0.178);
    expect(m.key.oomTop1).toBeCloseTo(0.948);
    expect(m.key.directMrr).toBeCloseTo(0.3);
    expect(m.key.oomMrr).toBeCloseTo(0.973);
  });

  it("derives the strongest alternative instead of assuming it", () => {
    expect(m.key.alt?.name).toBe("Per-site bias correction");
    expect(m.key.alt?.top1).toBeCloseTo(0.822);
    expect(m.key.alt?.mrr).toBeCloseTo(0.891, 3);
  });

  it("flags every chain where the deployed operator is worse than no correction", () => {
    expect(m.chains.filter((c) => c.adverse).map((c) => c.chain)).toEqual(["cubic"]);
    expect(m.key.adverse?.oom).toBeCloseTo(0.539, 3);
    expect(m.key.adverse?.direct).toBeCloseTo(0.652, 3);
  });

  it("ranks the five methods by MRR with intervals", () => {
    expect(m.methods.map((r) => r.code)).toEqual(["M2_OOM", "M3_debias_perEZ", "M3_debias_global", "M1_qweights", "M0_baseline"]);
    for (const r of m.methods) expect(r.lo! <= r.mrr && r.mrr <= r.hi!).toBe(true);
  });

  it("keeps abstention for real targets as leaders and ties, without accuracy", () => {
    const real = m.abstention.real;
    const total = (x: { named: number | null; ties: { size: number; count: number }[] }) => (x.named ?? 0) + x.ties.reduce((s, t) => s + t.count, 0);
    expect(total(real.report)).toBe(39);
    expect(total(real.gated)).toBe(39);
    expect(real.report.ties.every((t) => t.size >= 2)).toBe(true);
    expect(m.abstention.synthetic.total).toBe(213);
  });

  it("selects the interpolator with the lowest paired error", () => {
    const sel = m.interp.rows.find((r) => r.selected)!;
    expect(sel.interpolator).toBe("linear");
    expect(sel.halfshift).toBe(true);
  });

  it("keeps limitations verbatim and the support median near 31 %", () => {
    expect(m.limitations).toEqual(fixture.limitations);
    expect(m.support.rows).toHaveLength(39);
    expect(Math.round(m.support.median! * 100)).toBe(31);
  });

  it("parses all four documented stages", () => {
    expect(m.method.stages.map((s) => s.title)).toEqual(["Sampling", "Interpolation", "Half-pixel blend", "Warp"]);
    expect(m.method.stages[3].detail).toContain("463 m");
  });

  it("returns missing values as null, never zero", () => {
    const empty = buildModel({});
    expect(empty.key.oomTop1).toBeNull();
    expect(empty.key.alt).toBeNull();
    expect(empty.key.adverse).toBeNull();
    expect(empty.methods).toEqual([]);
    expect(empty.abstention.real.report.named).toBeNull();
  });

  it("reads the positive-control target from the control rows", () => {
    expect(m.controls.positive.length).toBeGreaterThan(0);
    expect(m.controls.positive[0].target).toBe("Cerberus");
    const noRows = buildModel({ controls: { summary: { cerberus: { "Askja|OOM": [65, 72] } } } });
    expect(noRows.controls.positive[0].target).toBeNull();
  });
});

describe("helpers", () => {
  it("parses a stage with an explicit name", () => {
    expect(parseStage("S — sampling: MEGDR bins with ≥1 shot")).toEqual({ letter: "S", title: "Sampling", detail: "MEGDR bins with ≥1 shot", raw: "S — sampling: MEGDR bins with ≥1 shot" });
  });
  it("makes nice ticks", () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it("labels the start of a zoomed axis that falls between nice ticks", () => {
    // The observation-support axis: 29 %–34 % has nice ticks at 30, 32, 34 only.
    expect(niceTicks(0.29, 0.34, 5)).toEqual([0.3, 0.32, 0.34]);
    expect(zoomedTicks(0.29, 0.34)).toEqual([0.29, 0.3, 0.32, 0.34]);
  });
  it("adds an axis end only when it is clear of the nearest nice tick", () => {
    expect(zoomedTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(zoomedTicks(0.299, 0.34)[0]).toBe(0.3);
    expect(zoomedTicks(0.3, 0.355).at(-1)).toBe(0.355);
    expect(zoomedTicks(0.5, 0.5)).toEqual([0.5]);
  });
  it("stamps import times in UTC to the minute", () => {
    expect(fmtStamp("2026-11-15T00:40:51+00:00")).toBe("2026-11-15 00:40 UTC");
    expect(fmtStamp("2026-11-15T06:10:00+05:30")).toBe("2026-11-15 00:40 UTC");
  });
  it("reads a stamp without an offset as UTC, whatever the viewer's time zone", () => {
    expect(fmtStamp("2026-11-15T00:40:51")).toBe("2026-11-15 00:40 UTC");
    expect(fmtStamp("2026-11-15 00:40")).toBe("2026-11-15 00:40 UTC");
    expect(fmtStamp("2026-11-15T23:59:59.5")).toBe("2026-11-15 23:59 UTC");
  });
  it("shows a missing stamp as a dash and an unreadable one as given", () => {
    expect(fmtStamp(null)).toBe("—");
    expect(fmtStamp("")).toBe("—");
    expect(fmtStamp("last Tuesday")).toBe("last Tuesday");
  });
});
