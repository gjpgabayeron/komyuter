import { activeRoute } from "@/lib/colors";

/** Route Sign palette seed colours (used for the random new-route default).
 *  First entry is the registry `activeRoute` token — no duplicated hex. */
export const ROUTE_COLORS = [
  activeRoute,
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

/** Converts an HSL color to a #RRGGBB hex string (round-trips isValidHexColor). */
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

/** Converts a #RRGGBB hex colour to HSL components (h 0–360, s/l 0–100). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Detour (alternative route) line colour: the MAIN ROUTE's colour family with
 * a small, deterministic per-detour shift — visually "closely similar" to the
 * solid baseline but clearly distinguishable, and different between detours.
 * Inactive detours additionally drop to low opacity at render time.
 */
export function detourLineColorFor(
  routeColor: string,
  detourId: string,
): string {
  if (!isValidHexColor(routeColor)) {
    routeColor = DEFAULT_ROUTE_COLOR;
  }
  const { h, s, l } = hexToHsl(routeColor);
  let hash = 0;
  for (let i = 0; i < detourId.length; i += 1) {
    hash = (hash * 31 + detourId.charCodeAt(i)) >>> 0;
  }
  const step = hash % 3;
  // COMPLEMENT of the main route's hue (+180°) — maximum contrast against
  // the solid baseline — with a small ±6° per-detour spread so alternatives
  // stay distinguishable; lightness drifts slightly for legibility.
  const hue = (h + 180 + (step - 1) * 6 + 360) % 360;
  const lightness = Math.max(30, Math.min(72, l + 6 + step * 5));
  return hslToHex(hue, Math.max(35, s), lightness);
}
