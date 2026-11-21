import type { Curve, DeltaCurve } from "../types";

/**
 * Interpolate y at x. `xs` must be sorted ascending.
 */
function interpolate(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];

  let low = 0;
  let high = xs.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (xs[middle] <= x) low = middle;
    else high = middle;
  }

  const span = xs[high] - xs[low];
  if (span === 0) return ys[low];
  const ratio = (x - xs[low]) / span;
  return ys[low] + ratio * (ys[high] - ys[low]);
}

function interpolateCurve(curve: Curve, grid: number[]): { n: number[]; k: number[] } {
  return {
    n: grid.map((x) => interpolate(curve.lambda, curve.n, x)),
    k: grid.map((x) => interpolate(curve.lambda, curve.k, x)),
  };
}

/**
 * Compute crystalline minus amorphous on their shared wavelength range.
 * The denser measured grid is used as the output grid; no extrapolation.
 */
export function computeDelta(
  amorphous: Curve,
  crystalline: Curve,
): DeltaCurve | null {
  if (amorphous.lambda.length < 2 || crystalline.lambda.length < 2) return null;

  const low = Math.max(amorphous.lambda[0], crystalline.lambda[0]);
  const high = Math.min(
    amorphous.lambda[amorphous.lambda.length - 1],
    crystalline.lambda[crystalline.lambda.length - 1],
  );
  if (!(high > low)) return null;

  const denser =
    amorphous.lambda.length >= crystalline.lambda.length ? amorphous : crystalline;
  const grid = denser.lambda.filter((x) => x >= low && x <= high);
  if (grid.length < 2) return null;

  const amo = interpolateCurve(amorphous, grid);
  const cry = interpolateCurve(crystalline, grid);

  return {
    lambda: grid,
    n: grid.map((_, index) => cry.n[index] - amo.n[index]),
    k: grid.map((_, index) => cry.k[index] - amo.k[index]),
  };
}
