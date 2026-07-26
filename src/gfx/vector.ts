/**
 * Drawing helpers shared by every piece of art in the game.
 *
 * All artwork is authored as code rather than as image files, so these are the
 * primitives that authoring leans on: gradient paints, rounded and organic
 * shapes, soft glows, and shorthand for saving/restoring transform state.
 */

type Ctx2D = CanvasRenderingContext2D;

export interface GradientStop {
  at: number;
  color: string;
}

/** A vertical gradient between two points, in current user space. */
export function linearPaint(
  ctx: Ctx2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: GradientStop[],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of stops) g.addColorStop(s.at, s.color);
  return g;
}

export function radialPaint(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  stops: GradientStop[],
): CanvasGradient {
  const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  for (const s of stops) g.addColorStop(s.at, s.color);
  return g;
}

/** Runs `draw` inside a save/restore pair. */
export function withState(ctx: Ctx2D, draw: () => void): void {
  ctx.save();
  draw();
  ctx.restore();
}

/** Runs `draw` translated, rotated and scaled, then restores. */
export function withTransform(
  ctx: Ctx2D,
  x: number,
  y: number,
  draw: () => void,
  options: { rotate?: number; scale?: number; scaleX?: number; scaleY?: number; alpha?: number } = {},
): void {
  ctx.save();
  ctx.translate(x, y);
  if (options.rotate) ctx.rotate(options.rotate);
  const sx = options.scaleX ?? options.scale ?? 1;
  const sy = options.scaleY ?? options.scale ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  draw();
  ctx.restore();
}

/** Rounded rectangle path. Radius is clamped to the smaller half-dimension. */
export function roundRect(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(Math.abs(w), Math.abs(h)) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string | CanvasGradient,
): void {
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRoundRect(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  stroke: string | CanvasGradient,
  width = 2,
): void {
  roundRect(ctx, x, y, w, h, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function ellipse(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rotation, 0, Math.PI * 2);
}

export function fillEllipse(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  rotation = 0,
): void {
  ellipse(ctx, cx, cy, rx, ry, rotation);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function fillCircle(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.abs(r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Closed polygon through a flat [x, y, x, y, ...] list. */
export function polygon(ctx: Ctx2D, points: readonly number[], close = true): void {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(points[0] as number, points[1] as number);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i] as number, points[i + 1] as number);
  }
  if (close) ctx.closePath();
}

export function fillPolygon(
  ctx: Ctx2D,
  points: readonly number[],
  fill: string | CanvasGradient,
): void {
  polygon(ctx, points);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * A closed blob through the given points using Catmull-Rom smoothing, which is
 * how most of the organic shapes (hair, food, foliage) are drawn.
 */
export function blob(ctx: Ctx2D, points: readonly [number, number][], tension = 0.5): void {
  const n = points.length;
  if (n < 3) return;
  const at = (i: number) => points[((i % n) + n) % n] as [number, number];

  ctx.beginPath();
  const start = at(0);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  ctx.closePath();
}

export function fillBlob(
  ctx: Ctx2D,
  points: readonly [number, number][],
  fill: string | CanvasGradient,
  tension = 0.5,
): void {
  blob(ctx, points, tension);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A soft radial glow — the workhorse of the lighting layer. */
export function softGlow(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  intensity = 1,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, radius));
  g.addColorStop(0, applyAlpha(color, 0.95 * intensity));
  g.addColorStop(0.35, applyAlpha(color, 0.45 * intensity));
  g.addColorStop(1, applyAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
  ctx.fill();
}

/** Elongated glow, for light spilling along a counter or a doorway. */
export function beamGlow(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  intensity = 1,
): void {
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(1, Math.max(0.01, ry / rx));
    softGlow(ctx, 0, 0, rx, color, intensity);
  });
}

/** Applies an alpha to any CSS colour string this project produces. */
export function applyAlpha(color: string, a: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${a})`);
  if (color.startsWith('rgb')) return color.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
  if (color.startsWith('#')) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = Number.parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}

/** Drop shadow under a standing figure or object. */
export function groundShadow(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength = 0.35,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, `rgba(0,0,0,${strength})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  withState(ctx, () => {
    ctx.translate(cx, cy);
    ctx.scale(1, ry / Math.max(0.01, rx));
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Clips subsequent drawing to the current path built by `pathFn`. */
export function clipped(ctx: Ctx2D, pathFn: () => void, draw: () => void): void {
  ctx.save();
  pathFn();
  ctx.clip();
  draw();
  ctx.restore();
}
