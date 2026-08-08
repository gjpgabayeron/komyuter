/** Route Sign palette seed colours (used for the random new-route default). */
export const ROUTE_COLORS = [
  "#1B6DB2",
  "#1F9E6B",
  "#C98A1B",
  "#7A5FC0",
] as const;

export const DEFAULT_ROUTE_COLOR = ROUTE_COLORS[0];

/**
 * Fresh vivid random colour for a new route: random hue at a readable
 * saturation/lightness so every route gets a distinct identity while staying
 * legible on the light map base. Full 24-bit random hexes can land near-white
 * or near-black; this keeps contrast for both the line and the list dot.
 */
export function randomRouteColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 55 + Math.floor(Math.random() * 30); // 55–84%
  const lightness = 38 + Math.floor(Math.random() * 18); // 38–55%
  return hslToHex(hue, saturation, lightness);
}

/** Converts an HSL colour to a #RRGGBB hex string (round-trips isValidHexColor). */
function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    [r, g, b] = [chroma, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, chroma, 0];
  } else if (h < 180) {
    [r, g, b] = [0, chroma, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, chroma];
  } else if (h < 300) {
    [r, g, b] = [x, 0, chroma];
  } else {
    [r, g, b] = [chroma, 0, x];
  }
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Validates a #RRGGBB hex colour string. */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
