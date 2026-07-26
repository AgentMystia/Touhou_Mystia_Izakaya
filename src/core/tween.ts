/** Easing curves and a tiny tween runner for UI and scene transitions. */

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => t * (2 - t);
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeOutElastic: Easing = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const easeOutBounce: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const inverseLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp01((v - a) / (b - a));
export const smoothstep = (edge0: number, edge1: number, v: number): number => {
  const t = inverseLerp(edge0, edge1, v);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach, for camera and value smoothing. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

interface Tween {
  elapsed: number;
  duration: number;
  delay: number;
  ease: Easing;
  onUpdate: (t: number) => void;
  onComplete?: (() => void) | undefined;
  done: boolean;
}

/** Drives a set of tweens from the game loop's update step. */
export class Tweener {
  private tweens: Tween[] = [];

  to(
    duration: number,
    onUpdate: (t: number) => void,
    options: { ease?: Easing; delay?: number; onComplete?: () => void } = {},
  ): void {
    this.tweens.push({
      elapsed: 0,
      duration: Math.max(1e-6, duration),
      delay: options.delay ?? 0,
      ease: options.ease ?? easeInOutQuad,
      onUpdate,
      onComplete: options.onComplete,
      done: false,
    });
  }

  update(dt: number): void {
    if (this.tweens.length === 0) return;
    for (const tween of this.tweens) {
      if (tween.delay > 0) {
        tween.delay -= dt;
        continue;
      }
      tween.elapsed += dt;
      const t = clamp01(tween.elapsed / tween.duration);
      tween.onUpdate(tween.ease(t));
      if (t >= 1) {
        tween.done = true;
        tween.onComplete?.();
      }
    }
    this.tweens = this.tweens.filter((tween) => !tween.done);
  }

  get active(): boolean {
    return this.tweens.length > 0;
  }

  clear(): void {
    this.tweens = [];
  }
}
