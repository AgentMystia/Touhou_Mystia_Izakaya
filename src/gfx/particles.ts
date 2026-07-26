/**
 * Particle system.
 *
 * State lives in one flat Float32Array so a few thousand particles cost no
 * allocations and no GC pauses. Emitters are declarative specs; the named ones
 * at the bottom are the vocabulary the scenes draw from.
 */

import { alpha } from '../art/palette';

type Ctx2D = CanvasRenderingContext2D;

export type ParticleShape = 'soft' | 'spark' | 'petal' | 'note' | 'star';

export interface EmitterSpec {
  shape: ParticleShape;
  /** Drawn into the light buffer rather than the colour buffer. */
  additive: boolean;
  life: [number, number];
  size: [number, number];
  speed: [number, number];
  /** Radians; 0 points right, -PI/2 points up. */
  angle: [number, number];
  gravity: number;
  drag: number;
  spin: [number, number];
  /** Sideways drift, for things that float. */
  wander: number;
  colors: string[];
  /** Multiplied into alpha over the particle's life, 0 = start, 1 = end. */
  fade?: (t: number) => number;
}

const FIELDS = 12;
const X = 0, Y = 1, VX = 2, VY = 3, LIFE = 4, MAX_LIFE = 5, SIZE = 6, ROT = 7, SPIN = 8,
  SHAPE = 9, COLOR = 10, FLAGS = 11;

const defaultFade = (t: number) => 1 - t;

const SHAPE_IDS: Record<ParticleShape, number> = { soft: 0, spark: 1, petal: 2, note: 3, star: 4 };

export class ParticleSystem {
  private readonly data: Float32Array;
  private readonly palette: string[] = [];
  private readonly paletteIndex = new Map<string, number>();
  private readonly fades: Array<(t: number) => number> = [defaultFade];
  private count = 0;

  constructor(readonly capacity = 2200) {
    this.data = new Float32Array(capacity * FIELDS);
  }

  get alive(): number {
    return this.count;
  }

  private colorId(color: string): number {
    let id = this.paletteIndex.get(color);
    if (id === undefined) {
      id = this.palette.length;
      this.palette.push(color);
      this.paletteIndex.set(color, id);
    }
    return id;
  }

  emit(spec: EmitterSpec, x: number, y: number, n = 1): void {
    const fadeId = this.fadeId(spec.fade ?? defaultFade);
    for (let i = 0; i < n && this.count < this.capacity; i++) {
      const o = this.count * FIELDS;
      const d = this.data;
      const angle = rand(spec.angle[0], spec.angle[1]);
      const speed = rand(spec.speed[0], spec.speed[1]);
      const life = rand(spec.life[0], spec.life[1]);

      d[o + X] = x;
      d[o + Y] = y;
      d[o + VX] = Math.cos(angle) * speed;
      d[o + VY] = Math.sin(angle) * speed;
      d[o + LIFE] = life;
      d[o + MAX_LIFE] = life;
      d[o + SIZE] = rand(spec.size[0], spec.size[1]);
      d[o + ROT] = Math.random() * Math.PI * 2;
      d[o + SPIN] = rand(spec.spin[0], spec.spin[1]);
      d[o + SHAPE] = SHAPE_IDS[spec.shape];
      d[o + COLOR] = this.colorId(
        spec.colors[Math.floor(Math.random() * spec.colors.length)] as string,
      );
      // Pack the emitter's physics into a side table keyed by index.
      this.physics[this.count] = spec;
      this.fadeOf[this.count] = fadeId;
      this.count++;
    }
  }

  private readonly physics: EmitterSpec[] = [];
  private readonly fadeOf: number[] = [];

  private fadeId(fade: (t: number) => number): number {
    const found = this.fades.indexOf(fade);
    if (found >= 0) return found;
    this.fades.push(fade);
    return this.fades.length - 1;
  }

  update(dt: number): void {
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const o = i * FIELDS;
      const life = (d[o + LIFE] as number) - dt;
      if (life <= 0) {
        this.swapRemove(i);
        i--;
        continue;
      }
      const spec = this.physics[i] as EmitterSpec;
      d[o + LIFE] = life;

      let vx = d[o + VX] as number;
      let vy = d[o + VY] as number;
      vy += spec.gravity * dt;
      if (spec.wander) {
        vx += Math.sin((d[o + ROT] as number) + life * 2.4) * spec.wander * dt;
      }
      const drag = Math.exp(-spec.drag * dt);
      vx *= drag;
      vy *= drag;

      d[o + VX] = vx;
      d[o + VY] = vy;
      d[o + X] = (d[o + X] as number) + vx * dt;
      d[o + Y] = (d[o + Y] as number) + vy * dt;
      d[o + ROT] = (d[o + ROT] as number) + (d[o + SPIN] as number) * dt;
      d[o + FLAGS] = spec.additive ? 1 : 0;
    }
  }

  private swapRemove(i: number): void {
    const last = this.count - 1;
    if (i !== last) {
      this.data.copyWithin(i * FIELDS, last * FIELDS, (last + 1) * FIELDS);
      this.physics[i] = this.physics[last] as EmitterSpec;
      this.fadeOf[i] = this.fadeOf[last] as number;
    }
    this.count = last;
  }

  /** Draws the particles matching `additive`; call once per buffer. */
  render(ctx: Ctx2D, additive: boolean): void {
    const d = this.data;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.count; i++) {
      const o = i * FIELDS;
      if ((d[o + FLAGS] === 1) !== additive) continue;

      const t = 1 - (d[o + LIFE] as number) / (d[o + MAX_LIFE] as number);
      const fade = this.fades[this.fadeOf[i] as number] as (t: number) => number;
      const a = Math.max(0, Math.min(1, fade(t)));
      if (a <= 0.004) continue;

      const x = d[o + X] as number;
      const y = d[o + Y] as number;
      const size = d[o + SIZE] as number;
      const color = this.palette[d[o + COLOR] as number] as string;
      ctx.globalAlpha = a;

      switch (d[o + SHAPE]) {
        case 1: { // spark: a short streak along its velocity
          const vx = d[o + VX] as number;
          const vy = d[o + VY] as number;
          const len = Math.min(14, Math.hypot(vx, vy) * 0.05);
          ctx.strokeStyle = color;
          ctx.lineWidth = size * 0.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (vx / (Math.hypot(vx, vy) || 1)) * len, y - (vy / (Math.hypot(vx, vy) || 1)) * len);
          ctx.stroke();
          break;
        }
        case 2: { // petal
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(d[o + ROT] as number);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 3: { // music note
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((d[o + ROT] as number) * 0.2);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.62, size * 0.46, -0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(size * 0.45, -size * 1.7, size * 0.2, size * 1.7);
          ctx.restore();
          break;
        }
        case 4: { // four-point star
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(d[o + ROT] as number);
          ctx.fillStyle = color;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a1 = (k / 4) * Math.PI * 2;
            const a2 = a1 + Math.PI / 4;
            ctx.lineTo(Math.cos(a1) * size, Math.sin(a1) * size);
            ctx.lineTo(Math.cos(a2) * size * 0.32, Math.sin(a2) * size * 0.32);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        default: { // soft blob
          const g = ctx.createRadialGradient(x, y, 0, x, y, size);
          g.addColorStop(0, color);
          g.addColorStop(1, alpha(color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.restore();
  }

  clear(): void {
    this.count = 0;
  }
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

// ------------------------------------------------------------- vocabulary

const UP = -Math.PI / 2;

export const EMITTERS = {
  firefly: {
    shape: 'soft', additive: true,
    life: [4, 9], size: [3, 6], speed: [4, 14], angle: [0, Math.PI * 2],
    gravity: -1, drag: 0.4, spin: [0, 0], wander: 26,
    colors: ['#b8f08a', '#d8ff9a', '#8ee07a'],
    fade: (t) => Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.sin(t * 24)),
  },
  ember: {
    shape: 'soft', additive: true,
    life: [1.1, 2.6], size: [1.8, 4], speed: [16, 42], angle: [UP - 0.5, UP + 0.5],
    gravity: -22, drag: 0.7, spin: [0, 0], wander: 16,
    colors: ['#ffb45c', '#ff8a3c', '#ffd58a'],
  },
  steam: {
    shape: 'soft', additive: false,
    life: [1.4, 2.6], size: [10, 22], speed: [12, 26], angle: [UP - 0.28, UP + 0.28],
    gravity: -9, drag: 0.9, spin: [0, 0], wander: 12,
    colors: ['rgba(206,216,232,0.5)', 'rgba(228,232,240,0.42)'],
    fade: (t) => Math.sin(t * Math.PI) * 0.8,
  },
  sakura: {
    shape: 'petal', additive: false,
    life: [6, 11], size: [4, 8], speed: [10, 26], angle: [0.5, 1.1],
    gravity: 5, drag: 0.25, spin: [-2, 2], wander: 22,
    colors: ['#f7c6d8', '#f2aec6', '#ffdbe6'],
    fade: (t) => Math.min(1, (1 - t) * 3),
  },
  sparkle: {
    shape: 'star', additive: true,
    life: [0.5, 1.1], size: [4, 11], speed: [40, 150], angle: [0, Math.PI * 2],
    gravity: 90, drag: 2.4, spin: [-6, 6], wander: 0,
    colors: ['#fff0c4', '#ffd17a', '#ffffff'],
    fade: (t) => (1 - t) ** 1.6,
  },
  note: {
    shape: 'note', additive: true,
    life: [1.3, 2.4], size: [8, 14], speed: [26, 54], angle: [UP - 0.7, UP + 0.7],
    gravity: -8, drag: 0.9, spin: [-1.5, 1.5], wander: 30,
    colors: ['#ffd8ea', '#ffb0d4', '#fff0f6'],
    fade: (t) => Math.sin(t * Math.PI) * 0.95,
  },
  coin: {
    shape: 'star', additive: true,
    life: [0.7, 1.2], size: [5, 9], speed: [70, 170], angle: [UP - 0.9, UP + 0.9],
    gravity: 340, drag: 0.6, spin: [-8, 8], wander: 0,
    colors: ['#f4d17a', '#ffe9a8', '#d8a94a'],
    fade: (t) => 1 - t ** 2,
  },
  smoke: {
    shape: 'soft', additive: false,
    life: [1.6, 3], size: [14, 30], speed: [10, 30], angle: [UP - 0.4, UP + 0.4],
    gravity: -6, drag: 1.1, spin: [0, 0], wander: 18,
    colors: ['rgba(60,48,64,0.7)', 'rgba(38,30,44,0.6)'],
    fade: (t) => Math.sin(t * Math.PI) * 0.75,
  },
} satisfies Record<string, EmitterSpec>;
