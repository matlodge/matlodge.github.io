import type { WavelengthRange } from "../types";

/** X-axis unit for the optical plots. */
export type XUnit = "nm" | "eV";

/** h·c in eV·nm, used to convert wavelength to photon energy. */
const HC_EV_NM = 1239.841984;

export const X_UNIT_TITLES: Record<XUnit, string> = {
  nm: "λ (nm)",
  eV: "E (eV)",
};

export const X_UNIT_HOVER: Record<XUnit, string> = {
  nm: "λ %{x:.2f} nm",
  eV: "E %{x:.3f} eV",
};

/** Returns the x values for one curve in the requested unit. */
export function toXValues(lambda: number[], unit: XUnit): number[] {
  if (unit === "nm") return lambda;
  return lambda.map((value) =>
    value > 0 ? HC_EV_NM / value : Number.NaN,
  );
}

/**
 * Wavelength window shared by the amorphous and crystalline data, i.e. the
 * domain the Δ curves are computed on. Falls back to the only phase that has
 * data; returns null when neither exists or the phases do not overlap.
 */
export function commonRange(
  amorphous: WavelengthRange | null,
  crystalline: WavelengthRange | null,
): WavelengthRange | null {
  if (!amorphous) return crystalline;
  if (!crystalline) return amorphous;
  const low = Math.max(amorphous.min, crystalline.min);
  const high = Math.min(amorphous.max, crystalline.max);
  return high > low ? { min: low, max: high } : null;
}

/** Formats a wavelength range for display, e.g. "400–1700 nm". */
export function formatLambdaRange(range: WavelengthRange | null): string | null {
  if (!range) return null;
  const low = Math.round(range.min);
  const high = Math.round(range.max);
  return low === high ? `${low} nm` : `${low}–${high} nm`;
}
