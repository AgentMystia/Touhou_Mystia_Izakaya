/**
 * Photographic grain overlays.
 *
 * Two small CC0 textures from ambientCG — crumpled washi and wood grain —
 * are tiled at low alpha over the flat vector fills to give surfaces tooth.
 * They are pure polish: if loading fails the game renders exactly as before,
 * so nothing may ever block or throw here.
 */

export type TextureKey = 'paper' | 'wood';

const SOURCES: Record<TextureKey, string> = {
  paper: 'textures/paper.jpg',
  wood: 'textures/wood.jpg',
};

const images = new Map<TextureKey, HTMLImageElement>();

/** Patterns are minted per context, since a pattern belongs to its canvas. */
const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/** Kicks off loading; resolves once every texture has loaded or failed. */
export function loadTextures(): Promise<void> {
  const base = import.meta.env.BASE_URL ?? '/';
  return Promise.all(
    (Object.entries(SOURCES) as [TextureKey, string][]).map(
      ([key, rel]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(key, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = base + rel;
        }),
    ),
  ).then(() => undefined);
}

function patternFor(
  ctx: CanvasRenderingContext2D,
  key: TextureKey,
  scale: number,
): CanvasPattern | null {
  const img = images.get(key);
  if (!img) return null;

  let byKey = patternCache.get(ctx);
  if (!byKey) {
    byKey = new Map();
    patternCache.set(ctx, byKey);
  }
  const cacheKey = `${key}:${scale}`;
  let pattern = byKey.get(cacheKey);
  if (!pattern) {
    const made = ctx.createPattern(img, 'repeat');
    if (!made) return null;
    made.setTransform(new DOMMatrix().scale(scale));
    byKey.set(cacheKey, pattern = made);
  }
  return pattern;
}

/**
 * Tiles a texture over the given rectangle. Callers set up any clip first;
 * the fill itself is axis-aligned and anchored to the canvas origin so
 * neighbouring surfaces share one continuous grain.
 */
export function overlayTexture(
  ctx: CanvasRenderingContext2D,
  key: TextureKey,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
  blend: GlobalCompositeOperation = 'overlay',
  scale = 0.5,
): void {
  const pattern = patternFor(ctx, key, scale);
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = blend;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
