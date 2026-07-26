/**
 * Text drawing. The game mixes a serif Mincho for headings and signage with a
 * rounded gothic for UI, both loaded as webfonts with system fallbacks.
 */

import { alpha } from '../art/palette';

type Ctx2D = CanvasRenderingContext2D;

export const SERIF = '"Shippori Mincho", "Noto Serif JP", "Yu Mincho", serif';
export const GOTHIC = '"Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif';

export type Align = 'left' | 'center' | 'right';

export interface TextStyle {
  size: number;
  font?: string;
  weight?: number;
  color?: string;
  align?: Align;
  baseline?: CanvasTextBaseline;
  /** Dark outline, for text over busy art. */
  outline?: string;
  outlineWidth?: number;
  /** Soft drop shadow. */
  shadow?: string;
  shadowBlur?: number;
  shadowOffset?: number;
  letterSpacing?: number;
  alpha?: number;
}

export function applyStyle(ctx: Ctx2D, style: TextStyle): void {
  ctx.font = `${style.weight ?? 500} ${style.size}px ${style.font ?? GOTHIC}`;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = style.baseline ?? 'alphabetic';
  if (style.letterSpacing !== undefined) {
    // Supported in Chromium; harmless elsewhere.
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${style.letterSpacing}px`;
  }
}

export function drawText(ctx: Ctx2D, text: string, x: number, y: number, style: TextStyle): void {
  ctx.save();
  applyStyle(ctx, style);
  if (style.alpha !== undefined) ctx.globalAlpha *= style.alpha;

  if (style.shadow) {
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = style.shadowBlur ?? 8;
    ctx.shadowOffsetY = style.shadowOffset ?? 2;
  }
  if (style.outline) {
    ctx.strokeStyle = style.outline;
    ctx.lineWidth = style.outlineWidth ?? 4;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(text, x, y);
    // The shadow has already been laid down by the stroke.
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = style.color ?? '#f4e8d0';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function measureText(ctx: Ctx2D, text: string, style: TextStyle): number {
  ctx.save();
  applyStyle(ctx, style);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** Greedy word wrap. Falls back to per-character for CJK runs with no spaces. */
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number, style: TextStyle): string[] {
  ctx.save();
  applyStyle(ctx, style);

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const hasSpaces = /\s/.test(paragraph);
    const units = hasSpaces ? paragraph.split(/(\s+)/) : [...paragraph];
    let line = '';
    for (const unit of units) {
      const candidate = line + unit;
      if (ctx.measureText(candidate).width > maxWidth && line.trim() !== '') {
        lines.push(line.trimEnd());
        line = hasSpaces ? unit.trimStart() : unit;
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }

  ctx.restore();
  return lines;
}

export function drawParagraph(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle,
  lineHeight = 1.45,
): number {
  const lines = wrapText(ctx, text, maxWidth, style);
  lines.forEach((line, i) => drawText(ctx, line, x, y + i * style.size * lineHeight, style));
  return lines.length * style.size * lineHeight;
}

/** Vertical CJK text, for signage and lantern glyphs. */
export function drawVertical(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  spacing = 1.12,
): void {
  [...text].forEach((glyph, i) => {
    drawText(ctx, glyph, x, y + i * style.size * spacing, { ...style, align: 'center', baseline: 'middle' });
  });
}

/**
 * Loads the bundled webfonts and resolves once they are ready to draw with, so
 * the first frame is not rendered in a fallback face.
 */
export async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const wanted = [
    `500 16px ${SERIF}`,
    `700 16px ${SERIF}`,
    `500 16px ${GOTHIC}`,
    `700 16px ${GOTHIC}`,
  ];
  try {
    await Promise.all(wanted.map((f) => document.fonts.load(f, '夜雀食堂 Mystia')));
    await document.fonts.ready;
  } catch {
    // Fallback faces are perfectly usable; never block boot on a font.
  }
}

/** Rounded label plate behind text, used for tags and small callouts. */
export function drawChip(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  color: string,
  style: TextStyle,
  padding = 10,
): number {
  const w = measureText(ctx, text, style) + padding * 2;
  const h = style.size * 1.7;
  ctx.save();
  ctx.fillStyle = alpha(color, 0.9);
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawText(ctx, text, x + padding, y + h / 2, { ...style, baseline: 'middle', align: 'left' });
  return w;
}
