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
