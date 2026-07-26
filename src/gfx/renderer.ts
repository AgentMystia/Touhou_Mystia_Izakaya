/**
 * The rendering surface and its post-processing chain.
 *
 * Scenes draw into two offscreen buffers: `ctx` for ordinary colour and `light`
 * for anything that glows (lanterns, the moon, spell-card flashes). At the end
 * of the frame `present()` blurs the light buffer into a bloom, composites it
 * additively over the scene, then applies a warm grade, a vignette and a little
 * animated grain. That chain is what turns flat Canvas2D fills into something
 * that reads as a warm stall under a night sky.
 */

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

/** The bloom buffer runs at a fraction of the scene size; blurring is cheap there. */
const BLOOM_DIVISOR = 8;

export interface RendererOptions {
  width?: number;
  height?: number;
  /** Drops the bloom chain and grain on weak hardware. */
  lowQuality?: boolean;
  /**
   * Stops the animated grain. Bloom is a pure function of the light buffer and
   * stays on, so screenshots keep the lighting while remaining reproducible.
   */
  deterministic?: boolean;
}

type Ctx2D = CanvasRenderingContext2D;

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

const context2d = (canvas: HTMLCanvasElement, alpha = true): Ctx2D => {
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
};

export class Renderer {
  readonly width: number;
  readonly height: number;

  /** Base colour layer — draw the world here. */
  readonly ctx: Ctx2D;
  /** Emissive layer — draw glows here; it is blurred and added on top. */
  readonly light: Ctx2D;

  private readonly display: Ctx2D;
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly bloomA: HTMLCanvasElement;
  private readonly bloomB: HTMLCanvasElement;
  private readonly bloomCtxA: Ctx2D;
  private readonly bloomCtxB: Ctx2D;

  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private frame = 0;

  lowQuality: boolean;
  deterministic: boolean;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: RendererOptions = {},
  ) {
    this.width = options.width ?? VIRTUAL_WIDTH;
    this.height = options.height ?? VIRTUAL_HEIGHT;
    this.lowQuality = options.lowQuality ?? false;
    this.deterministic = options.deterministic ?? false;

    this.display = context2d(canvas, false);

    this.sceneCanvas = makeCanvas(this.width, this.height);
    this.ctx = context2d(this.sceneCanvas, false);

    this.lightCanvas = makeCanvas(this.width, this.height);
    this.light = context2d(this.lightCanvas, true);

    const bw = Math.ceil(this.width / BLOOM_DIVISOR);
    const bh = Math.ceil(this.height / BLOOM_DIVISOR);
    this.bloomA = makeCanvas(bw, bh);
    this.bloomB = makeCanvas(bw, bh);
    this.bloomCtxA = context2d(this.bloomA, true);
    this.bloomCtxB = context2d(this.bloomB, true);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Fits the virtual canvas into the window, preserving aspect ratio. */
  readonly resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const availableW = this.canvas.clientWidth || window.innerWidth;
    const availableH = this.canvas.clientHeight || window.innerHeight;

    this.canvas.width = Math.max(1, Math.round(availableW * dpr));
    this.canvas.height = Math.max(1, Math.round(availableH * dpr));

    this.scale = Math.min(this.canvas.width / this.width, this.canvas.height / this.height);
    this.offsetX = (this.canvas.width - this.width * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.height * this.scale) / 2;
  };

  /** Maps a client-space point into virtual game coordinates. */
  toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = this.canvas.getBoundingClientRect();
    const dprX = this.canvas.width / rect.width;
    const dprY = this.canvas.height / rect.height;
    return {
      x: ((clientX - rect.left) * dprX - this.offsetX) / this.scale,
      y: ((clientY - rect.top) * dprY - this.offsetY) / this.scale,
    };
  };

  /** Clears both buffers for a new frame. */
  begin(background = '#07060f'): void {
    this.frame++;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.light.setTransform(1, 0, 0, 1, 0, 0);
    this.light.clearRect(0, 0, this.width, this.height);
  }

  /** Runs the post chain and blits to the visible canvas. */
  present(): void {
    if (!this.lowQuality) this.compositeBloom();
    this.grade();

    const d = this.display;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.fillStyle = '#000';
    d.fillRect(0, 0, this.canvas.width, this.canvas.height);
    d.imageSmoothingEnabled = true;
    d.imageSmoothingQuality = 'high';
    d.drawImage(
      this.sceneCanvas,
      this.offsetX,
      this.offsetY,
      this.width * this.scale,
      this.height * this.scale,
    );
  }

  /**
   * Downscales the light buffer, box-blurs it by repeated offset draws, then
   * adds it back over the scene. Cheap, and at this scale indistinguishable
   * from a proper gaussian.
   */
  private compositeBloom(): void {
    const { bloomCtxA, bloomCtxB, bloomA, bloomB } = this;
    const w = bloomA.width;
    const h = bloomA.height;

    bloomCtxA.setTransform(1, 0, 0, 1, 0, 0);
    bloomCtxA.clearRect(0, 0, w, h);
    bloomCtxA.drawImage(this.lightCanvas, 0, 0, w, h);

    // Two ping-pong passes of a 5-tap blur widen the halo convincingly.
    for (let pass = 0; pass < 2; pass++) {
      const from = pass % 2 === 0 ? bloomA : bloomB;
      const to = pass % 2 === 0 ? bloomCtxB : bloomCtxA;
      to.setTransform(1, 0, 0, 1, 0, 0);
      to.clearRect(0, 0, w, h);
      to.globalAlpha = 0.25;
      const r = 1 + pass;
      for (const [dx, dy] of [
        [0, 0],
        [-r, 0],
        [r, 0],
        [0, -r],
        [0, r],
      ] as const) {
        to.drawImage(from, dx, dy);
      }
      to.globalAlpha = 1;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // Two draws at different strengths give a tight core and a wide halo.
    // Kept well under 1 in total: the light buffer is added again below, and
    // stacking all three at full strength blows every lamp out to white.
    ctx.globalAlpha = 0.42;
    ctx.drawImage(bloomA, 0, 0, this.width, this.height);
    ctx.globalAlpha = 0.26;
    ctx.drawImage(bloomB, 0, 0, this.width, this.height);
    ctx.restore();

    // A little of the un-blurred light keeps highlight cores from going soft.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(this.lightCanvas, 0, 0);
    ctx.restore();
  }

  /** Warm grade, vignette, and a touch of grain. */
  private grade(): void {
    const ctx = this.ctx;
    const { width: w, height: h } = this;

    ctx.save();
    // Lift the warm end slightly; the scene is lantern-lit.
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 176, 92, 0.06)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    const vignette = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.28, w / 2, h / 2, h * 0.92);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (this.lowQuality || this.deterministic) return;

    // Grain: a sparse scatter of faint dots, re-seeded every few frames so it
    // shimmers without costing a full-resolution noise texture.
    ctx.save();
    ctx.globalAlpha = 0.028;
    ctx.fillStyle = '#fff';
    const seed = this.frame >> 1;
    for (let i = 0; i < 700; i++) {
      const n = Math.sin((i * 12.9898 + seed * 4.1414) * 43758.5453);
      const m = Math.sin((i * 78.233 + seed * 2.7182) * 43758.5453);
      ctx.fillRect(((n % 1) + 1) % 1 * w, ((m % 1) + 1) % 1 * h, 1.5, 1.5);
    }
    ctx.restore();
  }

  /** Full-screen black veil, used for scene transitions. */
  veil(alpha: number): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
  }
}
