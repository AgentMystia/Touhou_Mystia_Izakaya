/**
 * Pointer and keyboard input, reported in the game's virtual coordinate space
 * rather than in CSS pixels so scenes never deal with canvas scaling.
 */

export interface Point {
  x: number;
  y: number;
}

export type CoordinateMapper = (clientX: number, clientY: number) => Point;

export class Input {
  readonly pointer: Point = { x: -1, y: -1 };
  /** True while the primary button is held. */
  down = false;
  /** True only on the frame the button went down. */
  pressed = false;
  /** True only on the frame the button came up. */
  released = false;
  /** True only on the frame the secondary button went down. */
  rightPressed = false;
  /** Accumulated wheel delta since the last frame. */
  wheel = 0;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly detach: Array<() => void> = [];

  constructor(
    target: HTMLElement,
    private readonly toWorld: CoordinateMapper,
  ) {
    this.listen(target, 'pointermove', (e) => this.movePointer(e as PointerEvent));
    this.listen(target, 'pointerdown', (e) => {
      const event = e as PointerEvent;
      this.movePointer(event);
      if (event.button === 2) {
        this.rightPressed = true;
        return;
      }
      if (event.button !== 0) return;
      this.down = true;
      this.pressed = true;
      target.setPointerCapture?.(event.pointerId);
    });
    // The right button is a game action, not a place to open the browser menu.
    this.listen(target, 'contextmenu', (e) => e.preventDefault());
    this.listen(window, 'pointerup', (e) => {
      const event = e as PointerEvent;
      if (event.button !== 0) return;
      this.down = false;
      this.released = true;
    });
    this.listen(target, 'pointerleave', () => {
      this.pointer.x = -1;
      this.pointer.y = -1;
    });
    this.listen(
      target,
      'wheel',
      (e) => {
        this.wheel += (e as WheelEvent).deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    this.listen(window, 'keydown', (e) => {
      const event = e as KeyboardEvent;
      if (!this.keysDown.has(event.code)) this.keysPressed.add(event.code);
      this.keysDown.add(event.code);
      // Stop the page scrolling out from under the game.
      if (SCROLL_KEYS.has(event.code)) event.preventDefault();
    });
    this.listen(window, 'keyup', (e) => this.keysDown.delete((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => {
      this.keysDown.clear();
      this.down = false;
    });
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.detach.push(() => target.removeEventListener(type, handler, options));
  }

  private movePointer(event: PointerEvent): void {
    const p = this.toWorld(event.clientX, event.clientY);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** True only on the frame the key first went down. */
  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  anyPressed(...codes: string[]): boolean {
    return codes.some((code) => this.keysPressed.has(code));
  }

  /** Call once at the end of every frame to clear edge-triggered state. */
  endFrame(): void {
    this.pressed = false;
    this.released = false;
    this.rightPressed = false;
    this.wheel = 0;
    this.keysPressed.clear();
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }
}

const SCROLL_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
]);

/** Axis-aligned hit test in virtual coordinates. */
export const hitTest = (
  p: Point,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;

export const hitCircle = (p: Point, cx: number, cy: number, r: number): boolean =>
  (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
