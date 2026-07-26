/**
 * UI primitives, all drawn in the game's lacquer-and-washi idiom: dark panels
 * with gold rules, paper-coloured text, and tag chips that carry the colour
 * coding the tag system depends on.
 */

import { RATING_COLORS, TAG_COLORS, UI, alpha, shift } from '../art/palette';
import { GOTHIC, SERIF, drawText, measureText } from '../gfx/text';
import { fillRoundRect, roundRect, strokeRoundRect, withState } from '../gfx/vector';
import { overlayTexture } from '../gfx/textures';
import type { Point } from '../core/input';
import type { Rating } from '../rules/rating';

type Ctx2D = CanvasRenderingContext2D;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
export const inside = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** A lacquer panel with a gold rule — the base of every UI surface. */
export function panel(ctx: Ctx2D, r: Rect, opts: { alpha?: number; radius?: number } = {}): void {
  const radius = opts.radius ?? 12;
  withState(ctx, () => {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, radius, alpha(UI.lacquer, opts.alpha ?? 0.92));
  });
  // Washi grain gives the lacquer some tooth.
  withState(ctx, () => {
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.clip();
    overlayTexture(ctx, 'paper', r.x, r.y, r.w, r.h, 0.3, 'overlay', 0.6);
  });
  strokeRoundRect(ctx, r.x, r.y, r.w, r.h, radius, alpha(UI.gold, 0.42), 1.6);
}

export interface ButtonStyle {
  label: string;
  sub?: string;
  hovered?: boolean;
  disabled?: boolean;
  accent?: string;
  size?: number;
}

export function button(ctx: Ctx2D, r: Rect, style: ButtonStyle): void {
  const accent = style.accent ?? UI.gold;
  const on = style.hovered && !style.disabled;

  withState(ctx, () => {
    if (style.disabled) ctx.globalAlpha = 0.4;
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 10, alpha(on ? '#3a2430' : UI.lacquer, 0.9));
    strokeRoundRect(ctx, r.x, r.y, r.w, r.h, 10, on ? accent : alpha(accent, 0.45), on ? 2.4 : 1.5);

    if (on) {
      withState(ctx, () => {
        ctx.globalCompositeOperation = 'lighter';
        const wash = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y);
        wash.addColorStop(0, alpha(accent, 0.14));
        wash.addColorStop(1, alpha(accent, 0));
        fillRoundRect(ctx, r.x, r.y, r.w, r.h, 10, wash);
      });
    }

    const size = style.size ?? 22;
    drawText(ctx, style.label, r.x + r.w / 2, r.y + r.h / 2 + (style.sub ? -9 : 0), {
      size,
      font: GOTHIC,
      weight: 700,
      color: on ? '#ffeccb' : UI.paper,
      align: 'center',
      baseline: 'middle',
    });
    if (style.sub) {
      drawText(ctx, style.sub, r.x + r.w / 2, r.y + r.h / 2 + 13, {
        size: size * 0.66,
        font: GOTHIC,
        color: alpha(UI.paperDim, 0.75),
        align: 'center',
        baseline: 'middle',
      });
    }
  });
}

export type ChipKind = 'innate' | 'added' | 'struck' | 'forbidden' | 'trend' | 'wanted';

/** A tag chip. Colour carries meaning, so the kind is never decorative. */
export function tagChip(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  kind: ChipKind,
  size = 15,
): number {
  const style = { size, font: GOTHIC, weight: 600 as const };
  const w = measureText(ctx, text, style) + 18;
  const h = size * 1.75;

  const fill =
    kind === 'wanted' ? UI.jade
    : kind === 'struck' ? TAG_COLORS.struck
    : kind === 'forbidden' ? TAG_COLORS.forbidden
    : kind === 'trend' ? TAG_COLORS.trend
    : kind === 'added' ? TAG_COLORS.added
    : TAG_COLORS.innate;

  withState(ctx, () => {
    if (kind === 'struck' || kind === 'forbidden') ctx.globalAlpha = 0.55;
    fillRoundRect(ctx, x, y, w, h, h / 2, alpha(fill, 0.9));
    if (kind === 'wanted') strokeRoundRect(ctx, x, y, w, h, h / 2, UI.goldBright, 2);
  });

  drawText(ctx, text, x + 9, y + h / 2, {
    ...style,
    color: kind === 'forbidden' ? alpha(UI.paper, 0.75) : '#231a19',
    baseline: 'middle',
  });

  // A struck tag is one the priority rules cancelled; show it crossed out.
  if (kind === 'struck') {
    withState(ctx, () => {
      ctx.strokeStyle = alpha('#1a1420', 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + h / 2);
      ctx.lineTo(x + w - 6, y + h / 2);
      ctx.stroke();
    });
  }
  return w;
}

/** Lays chips out in rows, wrapping at `maxWidth`. Returns the height used. */
export function chipRow(
  ctx: Ctx2D,
  chips: Array<{ text: string; kind: ChipKind }>,
  x: number,
  y: number,
  maxWidth: number,
  size = 15,
): number {
  let cx = x;
  let cy = y;
  const lineH = size * 1.75 + 7;
  for (const chip of chips) {
    const w = measureText(ctx, chip.text, { size, font: GOTHIC, weight: 600 }) + 18;
    if (cx + w > x + maxWidth && cx > x) {
      cx = x;
      cy += lineH;
    }
    tagChip(ctx, chip.text, cx, cy, chip.kind, size);
    cx += w + 7;
  }
  return cy + lineH - y;
}

/** Horizontal meter with a label, used for patience, satisfaction and bonds. */
export function meter(
  ctx: Ctx2D,
  r: Rect,
  value: number,
  color: string,
  label?: string,
): void {
  const t = Math.max(0, Math.min(1, value));
  fillRoundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2, alpha('#0d0910', 0.8));
  if (t > 0) {
    withState(ctx, () => {
      roundRect(ctx, r.x, r.y, r.w * t, r.h, r.h / 2);
      ctx.clip();
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, shift(color, 0.25));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w * t, r.h);
    });
  }
  strokeRoundRect(ctx, r.x, r.y, r.w, r.h, r.h / 2, alpha('#000', 0.45), 1.2);
  if (label) {
    drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, {
      size: r.h * 0.72,
      font: GOTHIC,
      weight: 700,
      color: UI.paper,
      align: 'center',
      baseline: 'middle',
      shadow: 'rgba(0,0,0,0.7)',
      shadowBlur: 4,
    });
  }
}

/** A speech bubble with a tail pointing down at its owner. */
export function bubble(ctx: Ctx2D, r: Rect, tailX: number, tint: string = UI.paper): void {
  withState(ctx, () => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = alpha(tint, 0.96);
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    // Tail.
    ctx.beginPath();
    ctx.moveTo(tailX - 12, r.y + r.h - 1);
    ctx.lineTo(tailX, r.y + r.h + 16);
    ctx.lineTo(tailX + 12, r.y + r.h - 1);
    ctx.closePath();
    ctx.fill();
    // Paper fibre, kept faint so the ink stays crisp.
    ctx.shadowColor = 'transparent';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.clip();
    overlayTexture(ctx, 'paper', r.x, r.y, r.w, r.h, 0.16, 'multiply', 0.45);
  });
}

/** The coloured reaction card a guest shows after being served. */
export function ratingCard(ctx: Ctx2D, x: number, y: number, rating: Rating, note: string): void {
  const color = RATING_COLORS[rating];
  const label = RATING_LABEL[rating];
  const w = Math.max(232, measureText(ctx, note, { size: 17, font: GOTHIC }) + 40);
  const h = 74;
  const r = rect(x - w / 2, y - h, w, h);

  withState(ctx, () => {
    ctx.shadowColor = alpha(color, 0.7);
    ctx.shadowBlur = 26;
    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 10, alpha('#150f18', 0.95));
  });
  strokeRoundRect(ctx, r.x, r.y, r.w, r.h, 10, color, 2.4);
  fillRoundRect(ctx, r.x, r.y, 7, r.h, 3, color);

  drawText(ctx, label, r.x + 20, r.y + 25, {
    size: 21, font: SERIF, weight: 800, color, baseline: 'middle', letterSpacing: 2,
  });
  drawText(ctx, note, r.x + 20, r.y + 51, {
    size: 17, font: GOTHIC, color: alpha(UI.paper, 0.88), baseline: 'middle',
  });
}

const RATING_LABEL: Record<Rating, string> = {
  black: '激怒',
  purple: '不满',
  green: '普通',
  orange: '满意',
  pink: '绝品',
};

/** Small counter used across the HUD: an icon glyph plus a value. */
export function stat(
  ctx: Ctx2D,
  glyph: string,
  value: string,
  x: number,
  y: number,
  color: string = UI.paper,
  size = 24,
): void {
  drawText(ctx, glyph, x, y, {
    size: size * 0.92, font: SERIF, weight: 700,
    color: alpha(UI.gold, 0.85), baseline: 'middle',
  });
  drawText(ctx, value, x + size * 1.35, y, {
    size, font: GOTHIC, weight: 700, color, baseline: 'middle',
  });
}

/** Formats seconds as m:ss. */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const yen = (amount: number): string => `${Math.round(amount).toLocaleString('en-US')}¥`;
