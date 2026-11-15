import { describe, expect, it } from "vitest";
import { clock, formatAltitude, marsTime, nearestSite, niceScale } from "./instruments";

describe("niceScale", () => {
  it("chooses a 1-2-5 length that fits", () => {
    const s = niceScale(2410.8, 120)!; // 2.41 km/px → ≤ 289 km → 200 km
    expect(s.meters).toBe(200_000);
    expect(s.label).toBe("200 km");
    expect(s.px).toBeCloseTo(200_000 / 2410.8, 6);
    expect(s.px).toBeLessThanOrEqual(120);
  });
  it("handles metres", () => {
    expect(niceScale(3, 120)!.label).toBe("200 m");
  });
  it("is null off-planet", () => {
    expect(niceScale(null)).toBeNull();
  });
});

describe("formatAltitude", () => {
  it("formats ranges", () => {
    expect(formatAltitude(1100)).toBe("1,100 km");
    expect(formatAltitude(17_543)).toBe("17,500 km");
    expect(formatAltitude(12.34)).toBe("12.3 km");
    expect(formatAltitude(0.5)).toBe("500 m");
    expect(formatAltitude(null)).toBe("—");
  });
});

describe("nearestSite", () => {
  it("finds the closest site on the Mars sphere", () => {
    const sites = [
      { id: "a", name: "A", lat: 0, lon: 0 },
      { id: "b", name: "B", lat: -55, lon: 15 },
    ];
    const n = nearestSite(sites, -60, 10)!;
    expect(n.site.id).toBe("b");
    expect(n.km).toBeGreaterThan(250);
    expect(n.km).toBeLessThan(400);
  });
});

describe("marsTime", () => {
  it("matches the Mars24 worked example (2000-01-06 00:00 UTC → MSD 44795.9998, MTC 23:59:39)", () => {
    const t = marsTime(Date.UTC(2000, 0, 6, 0, 0, 0), 32);
    expect(t.msd).toBeCloseTo(44795.9998, 4);
    expect(clock(t.mtcHours)).toBe("23:59:39");
  });
  it("advances one sol per 88,775.244 s", () => {
    const a = marsTime(Date.UTC(2026, 10, 15, 12));
    const b = marsTime(Date.UTC(2026, 10, 15, 12) + 88_775_244);
    expect(b.msd - a.msd).toBeCloseTo(1, 6);
  });
});

describe("clock", () => {
  it("formats fractional hours", () => {
    expect(clock(0)).toBe("00:00:00");
    expect(clock(13.5)).toBe("13:30:00");
  });
});
