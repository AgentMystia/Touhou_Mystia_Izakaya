/**
 * The game's colour language.
 *
 * Everything is lit by paper lanterns under a deep indigo sky, so the palette
 * is built around two poles — warm lamplight and cold night — with the UI
 * borrowing from washi paper and lacquer.
 */

export const NIGHT = {
  skyTop: '#0a0a1f',
  skyMid: '#161436',
  skyLow: '#2a1c3f',
  horizon: '#4a2a44',
  moon: '#fff3d0',
  moonGlow: '#ffe6a8',
  star: '#dfe4ff',
  fog: '#2c2748',
  hillFar: '#171531',
  hillMid: '#12102a',
  hillNear: '#0c0a1e',
} as const;

export const LAMP = {
  core: '#fff0c4',
  warm: '#ffb45c',
  deep: '#ff7a3c',
  ember: '#ff9d4d',
  paper: '#e8442f',
  paperLit: '#ff6a4a',
} as const;

export const WOOD = {
  dark: '#2a1a14',
  mid: '#4a2f22',
  light: '#6b4530',
  highlight: '#8c5c3e',
  counter: '#7a4b2e',
  counterLit: '#a86a41',
} as const;

export const CLOTH = {
  noren: '#8e1f2a',
  norenDark: '#5f131c',
  norenText: '#f5e3c4',
  tatami: '#6d7a4a',
} as const;

export const UI = {
  paper: '#f4e8d0',
  paperDim: '#dccdb0',
  ink: '#241a16',
  inkSoft: '#5a4a41',
  lacquer: '#1a1119',
  lacquerLight: '#2b1d2a',
  gold: '#d8a94a',
  goldBright: '#f4d17a',
  crimson: '#b3313c',
  jade: '#4f9d80',
  indigo: '#3a4f8a',
} as const;

/** Rating colours, matching the game's own reaction palette. */
export const RATING_COLORS = {
  black: '#3b2733',
  purple: '#7b4b9e',
  green: '#5aa86a',
  orange: '#e8913a',
  pink: '#f272a8',
} as const;

/** Tag chips are tinted by what kind of tag they are. */
export const TAG_COLORS = {
  innate: '#f0709c',
  added: '#e89340',
  struck: '#5f7fbf',
  forbidden: '#3a2a3a',
  trend: '#d8a94a',
} as const;

/** Semi-transparent black, for shadows and scrims. */
export const shade = (alpha: number): string => `rgba(0,0,0,${alpha})`;
/** Semi-transparent white, for highlights and rim light. */
export const glow = (alpha: number): string => `rgba(255,255,255,${alpha})`;

/** Mixes two hex colours. `t` of 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  const c = (i: number) => Math.round((pa[i] as number) + ((pb[i] as number) - (pa[i] as number)) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** Lightens (positive) or darkens (negative) a hex colour by a 0-1 amount. */
export const shift = (hex: string, amount: number): string =>
  amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount);

/** Hex colour with an alpha channel applied. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Parses any colour these helpers can produce, not just hex.
 *
 * `mix` and `shift` return `rgb(...)`, and they get chained constantly —
 * `shift(shift(c, a), b)`, `inkOf(shift(c, a))`. Accepting only hex made every
 * such chain silently parse to NaN and render pure black, which is how the
 * character rig ended up with black forearms and black outlines.
 */
function parseColor(color: string): [number, number, number] {
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color);
  if (rgb) {
    return [Number(rgb[1]) | 0, Number(rgb[2]) | 0, Number(rgb[3]) | 0];
  }
  let h = color.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
