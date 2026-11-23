import type { SampleBundle, SampleSummary, SelectedSample } from "../types";

/**
 * Port of the MATLAB `increasing_color3(n)` helper: the palette for `n`
 * simultaneously plotted lines.
 *
 * For n <= 4 the colours are hand-picked (values in 0..255, divided by 256 as
 * in MATLAB); for n >= 5 a polynomial ramp runs purple -> blue -> green ->
 * yellow -> orange.
 */
const HAND_PICKED: Record<number, number[][]> = {
  1: [[64, 64, 150]],
  2: [
    [64, 64, 150],
    [217, 33, 32],
  ],
  3: [
    [64, 64, 150],
    [222, 167, 58],
    [217, 33, 32],
  ],
  4: [
    [64, 64, 150],
    [87, 163, 173],
    [222, 167, 58],
    [217, 33, 32],
  ],
};

function toHex(components: number[]): string {
  return `#${components
    .map((value) => {
      const channel = Math.max(0, Math.min(255, Math.round(value * 255)));
      return channel.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

export function increasingColors(n: number): string[] {
  if (!Number.isFinite(n) || n < 1) return [];

  const handPicked = HAND_PICKED[Math.floor(n)];
  if (handPicked) {
    return handPicked.map((rgb) => toHex(rgb.map((value) => value / 256)));
  }

  const colors: string[] = [];
  const last = n - 1;
  for (let i = 0; i < n; i += 1) {
    const x = i / last;
    const r =
      (0.472 - 0.567 * x + 4.05 * x ** 2) /
      (1 + 8.72 * x - 19.17 * x ** 2 + 14.1 * x ** 3);
    const g =
      0.108932 -
      1.22635 * x +
      27.284 * x ** 2 -
      98.577 * x ** 3 +
      163.63 * x ** 4 -
      131.395 * x ** 5 +
      40.5 * x ** 6;
    const b =
      1 /
      (1.97 +
        3.54 * x -
        68.5 * x ** 2 +
        243 * x ** 3 -
        297 * x ** 4 +
        125 * x ** 5);
    colors.push(toHex([r, g, b]));
  }
  return colors;
}

/**
 * Colours depend on how many samples are selected, exactly like calling
 * `increasing_color3(n)` in MATLAB, so every sample is recoloured whenever the
 * selection size changes.
 */
export function withPalette(
  items: Array<{ summary: SampleSummary; bundle: SampleBundle }>,
): SelectedSample[] {
  const colors = increasingColors(items.length);
  return items.map((item, index) => ({ ...item, color: colors[index] }));
}
