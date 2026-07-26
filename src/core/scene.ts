/**
 * Scene stack with cross-fade transitions.
 *
 * Scenes are pushed and popped rather than swapped so transient screens (the
 * album, a shop, a dialogue) can sit on top of the scene that opened them and
 * hand control back on close.
 */

import type { Input } from './input';
import type { Renderer } from '../gfx/renderer';
import { clamp01 } from './tween';

export interface SceneContext {
  renderer: Renderer;
  input: Input;
  /** Seconds since the game started. */
  time: number;
  manager: SceneManager;
}

export interface Scene {
  readonly name: string;
  enter?(ctx: SceneContext): void;
  exit?(ctx: SceneContext): void;
  /** Called when another scene is pushed on top of this one. */
  suspend?(ctx: SceneContext): void;
  /** Called when the scene above this one is popped. */
  resume?(ctx: SceneContext, result?: unknown): void;
  update(ctx: SceneContext, dt: number): void;
  render(ctx: SceneContext, alpha: number): void;
  /** Scenes below a translucent scene keep rendering. */
  readonly translucent?: boolean;
}

type PendingAction =
  | { kind: 'push'; scene: Scene }
  | { kind: 'pop'; result?: unknown }
  | { kind: 'replace'; scene: Scene }
  | { kind: 'reset'; scene: Scene };

const FADE_SECONDS = 0.35;

export class SceneManager {
  private stack: Scene[] = [];
  private pending: PendingAction | null = null;
  /** 0 = fully visible, 1 = fully covered by the transition veil. */
  private fade = 0;
  private phase: 'idle' | 'out' | 'in' = 'idle';

  constructor(private readonly context: () => SceneContext) {}

  get current(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  get transitioning(): boolean {
    return this.phase !== 'idle';
  }

  /** Starts the stack without a transition. */
  boot(scene: Scene): void {
    this.stack = [scene];
    scene.enter?.(this.context());
  }

  push(scene: Scene): void {
    this.queue({ kind: 'push', scene });
  }

  pop(result?: unknown): void {
    this.queue({ kind: 'pop', result });
  }

  /** Swaps the top scene. */
  replace(scene: Scene): void {
    this.queue({ kind: 'replace', scene });
  }

  /** Clears the whole stack and starts over — used by "return to title". */
  reset(scene: Scene): void {
    this.queue({ kind: 'reset', scene });
  }

  private queue(action: PendingAction): void {
    if (this.pending) return; // ignore input during a transition
    this.pending = action;
    this.phase = 'out';
  }

  update(dt: number): void {
    const ctx = this.context();

    if (this.phase === 'out') {
      this.fade = clamp01(this.fade + dt / FADE_SECONDS);
      if (this.fade >= 1) {
        this.applyPending(ctx);
        this.phase = 'in';
      }
    } else if (this.phase === 'in') {
      this.fade = clamp01(this.fade - dt / FADE_SECONDS);
      if (this.fade <= 0) this.phase = 'idle';
    }

    // The covered scene keeps ticking so its animations stay live.
    this.current?.update(ctx, dt);
  }

  private applyPending(ctx: SceneContext): void {
    const action = this.pending;
    this.pending = null;
    if (!action) return;

    switch (action.kind) {
      case 'push': {
        this.current?.suspend?.(ctx);
        this.stack.push(action.scene);
        action.scene.enter?.(ctx);
        break;
      }
      case 'pop': {
        const leaving = this.stack.pop();
        leaving?.exit?.(ctx);
        this.current?.resume?.(ctx, action.result);
        break;
      }
      case 'replace': {
        const leaving = this.stack.pop();
        leaving?.exit?.(ctx);
        this.stack.push(action.scene);
        action.scene.enter?.(ctx);
        break;
      }
      case 'reset': {
        for (const scene of [...this.stack].reverse()) scene.exit?.(ctx);
        this.stack = [action.scene];
        action.scene.enter?.(ctx);
        break;
      }
    }
  }

  render(alpha: number): void {
    const ctx = this.context();

    // Render from the deepest opaque scene upward, so overlays composite.
    let base = this.stack.length - 1;
    while (base > 0 && this.stack[base]?.translucent) base--;
    for (let i = base; i < this.stack.length; i++) {
      this.stack[i]?.render(ctx, alpha);
    }

    if (this.fade > 0) ctx.renderer.veil(this.fade);
  }
}
