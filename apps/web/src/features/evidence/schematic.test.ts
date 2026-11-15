import { describe, expect, it } from "vitest";
import { BINS, binCentres, binKey, blend, delaunay, observedBins, TRACKS, type Pt } from "./schematic";

/** Deterministic pseudo-random points (LCG), so the test never flakes. */
function points(n: number, seed = 7): Pt[] {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, () => ({ x: r(), y: r() }));
}

/** Convex hull vertex count (monotone chain, collinear points excluded). */
function hullSize(pts: Pt[]): number {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return half(p).length + half([...p].reverse()).length;
}

const area2 = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

describe("process schematic geometry", () => {
  it("marks exactly the bins that hold a shot", () => {
    const obs = observedBins();
    for (const t of TRACKS) for (const s of t.shots) expect(obs.has(binKey(Math.floor(s.x), Math.floor(s.y)))).toBe(true);
    const total = BINS.cols * BINS.rows;
    // Most bins stay empty, as in the real counts mask.
    expect(obs.size).toBeGreaterThan(0);
    expect(obs.size).toBeLessThan(total / 2);
  });

  it("keeps every track inside the grid and running north to south", () => {
    for (const t of TRACKS) {
      expect(t.start.y).toBeLessThan(t.end.y);
      for (const s of t.shots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThan(BINS.cols);
        expect(s.y).toBeLessThan(BINS.rows);
      }
    }
  });

  it("returns bin centres north to south, then west to east", () => {
    expect(binCentres(["2,1", "0,1", "3,0"])).toEqual([{ x: 3.5, y: 0.5 }, { x: 0.5, y: 1.5 }, { x: 2.5, y: 1.5 }]);
  });

  it("blends each column with its eastern neighbour", () => {
    expect(blend([2, 4, 6, 6])).toEqual([3, 5, 6]);
    expect(blend([5])).toEqual([]);
    const z = [3, 9, 1, 7];
    blend(z).forEach((b, i) => {
      expect(b).toBeGreaterThanOrEqual(Math.min(z[i], z[i + 1]));
      expect(b).toBeLessThanOrEqual(Math.max(z[i], z[i + 1]));
    });
  });
});

describe("delaunay", () => {
  it("splits a quadrilateral into two triangles", () => {
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1.2 }, { x: 0, y: 1 }])).toHaveLength(2);
  });

  it("returns nothing for fewer than three points", () => {
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });

  it("satisfies the empty-circumcircle property and the triangle count 2n − 2 − h", () => {
    const pts = points(40);
    const tris = delaunay(pts);
    expect(tris).toHaveLength(2 * pts.length - 2 - hullSize(pts));
    for (const [a, b, c] of tris) {
      const A = pts[a], B = pts[b], C = pts[c];
      expect(Math.abs(area2(A, B, C))).toBeGreaterThan(0);
      const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
      const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;
      const r2 = (A.x - ux) ** 2 + (A.y - uy) ** 2;
      pts.forEach((p, i) => {
        if (i === a || i === b || i === c) return;
        expect((p.x - ux) ** 2 + (p.y - uy) ** 2).toBeGreaterThan(r2 * (1 - 1e-9));
      });
    }
  });

  it("triangulates the observed bin centres of the schematic", () => {
    const centres = binCentres(observedBins());
    const tris = delaunay(centres);
    expect(tris.length).toBeGreaterThan(centres.length - 3);
    const used = new Set(tris.flat());
    expect(used.size).toBe(centres.length);
  });
});
