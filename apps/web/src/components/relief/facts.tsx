import type { Relief } from "../../types/contracts";

/**
 * A relief payload's grid in words, for captions: "108 × 108 cells of 463.09 m", every figure from the payload. Each
 * figure group stays on one line ("108 × 108", "463.09 m"), so a wrapped caption never splits a grid size or a cell
 * size from its unit.
 */
export function GridFacts({ relief }: { relief: Pick<Relief, "rows" | "cols" | "cell_m"> }) {
  return (
    <>
      <span className="num whitespace-nowrap">{relief.rows} × {relief.cols}</span> cells of{" "}
      <span className="whitespace-nowrap"><span className="num">{relief.cell_m.toFixed(2)}</span> m</span>
    </>
  );
}
