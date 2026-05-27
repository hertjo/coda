/**
 * Bioluminescent palette: deep ocean blue floor, cyan mid, bright pink
 * peaks for high-frequency cells. Matches the rest of the project family
 * (persephone, cortex) while reading as "underwater".
 */
export type RGB = readonly [number, number, number];

const STOPS: RGB[] = [
  [0.020, 0.035, 0.080],
  [0.040, 0.180, 0.420],
  [0.150, 0.580, 0.950],
  [0.620, 0.940, 1.000],
  [0.980, 0.420, 0.880],
  [1.000, 0.880, 1.000],
];

export function biolumin(t: number): RGB {
  const x = Math.max(0, Math.min(1, t));
  const s = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(s));
  const f = s - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

export function rgbToCss([r, g, b]: RGB, alpha = 1): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

export const ACCENT_CYAN = "#56e0ff";
export const ACCENT_PINK = "#ff7adb";
