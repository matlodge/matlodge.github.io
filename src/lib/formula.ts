const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

/**
 * Renders a chemical formulation with Unicode subscript digits, e.g.
 * `Ge2Sb2Te5` becomes `Ge₂Sb₂Te₅`. Unicode is used because native `<select>`
 * options can only contain text, and it works in chips, cards and prose too.
 * Stored formulations stay ASCII; only display text is converted.
 */
export function formatFormula(formula: string): string {
  return formula.replace(/\d/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit);
}
