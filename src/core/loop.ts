/**
 * Fixed-timestep game loop: the simulation always advances in equal slices
 * regardless of frame rate, while rendering happens once per animation frame
 * with an interpolation factor for smooth motion.
 */

export type UpdateFn = (dtSeconds: number) => void;
export type RenderFn = (alpha: number) => void;

export interface LoopOptions {
  /** Simulation ticks per second. */
  hz?: number;
  /** Cap on catch-up work after a stall (e.g. a backgrounded tab). */
  maxFrameSeconds?: number;
}

export class GameLoop {
  private readonly step: number;
  private readonly maxFrame: number;
  private accumulator = 0;
  private lastTime = 0;
  private frameHandle = 0;
  private running = false;

  /** Wall-clock seconds since the loop started, paused time excluded. */
  elapsed = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
    options: LoopOptions = {},
  ) {
    this.step = 1 / (options.hz ?? 60);
    this.maxFrame = options.maxFrameSeconds ?? 0.25;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    // Clamping keeps a long stall from producing a burst of catch-up ticks.
    const frame = Math.min((now - this.lastTime) / 1000, this.maxFrame);
    this.lastTime = now;
    this.accumulator += frame;
    this.elapsed += frame;

    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }

    this.render(this.accumulator / this.step);
  };
}
