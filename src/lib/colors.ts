export const SAMPLE_COLORS = [
  "#0f766e",
  "#dc2626",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#4d7c0f",
] as const;

export function nextColor(usedColors: string[]): string {
  return (
    SAMPLE_COLORS.find((color) => !usedColors.includes(color)) ??
    SAMPLE_COLORS[usedColors.length % SAMPLE_COLORS.length]
  );
}
