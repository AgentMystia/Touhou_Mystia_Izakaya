/**
 * Title screen: the izakaya at full glow, with the menu on a hanging plate.
 */

import { MYSTIA } from '../art/cast';
import { LAMP, UI, alpha, shade } from '../art/palette';
import { drawCharacter, characterRim } from '../art/characters';
import {
  defaultLayout,
  drawNightForeground,
  drawNightLights,
  drawNightScene,
  drawSteam,
  lanternPositions,
  type SceneLayout,
} from '../art/scenery';
import { EMITTERS, ParticleSystem } from '../gfx/particles';
import { GOTHIC, SERIF, drawText } from '../gfx/text';
import { fillRoundRect, strokeRoundRect, withState } from '../gfx/vector';
import { t } from '../i18n';
import { hitTest } from '../core/input';
import { easeOutCubic, clamp01 } from '../core/tween';
import type { Scene, SceneContext } from '../core/scene';

export interface TitleAction {
  id: string;
  key: 'title.start' | 'title.continue' | 'title.album' | 'title.settings';
}

const ACTIONS: Array<{ id: string; key: TitleAction['key'] }> = [
  { id: 'new', key: 'title.start' },
  { id: 'continue', key: 'title.continue' },
  { id: 'album', key: 'title.album' },
  { id: 'settings', key: 'title.settings' },
];

const BUTTON_W = 330;
const BUTTON_H = 68;
const BUTTON_GAP = 14;

export class TitleScene implements Scene {
  readonly name = 'title';

  private layout: SceneLayout = defaultLayout(1920, 1080);
  private readonly particles = new ParticleSystem(900);
  private elapsed = 0;
  private hovered = -1;
  private fireflyTimer = 0;
  private emberTimer = 0;

  constructor(private readonly onChoose: (action: string) => void) {}

  enter(ctx: SceneContext): void {
    this.layout = defaultLayout(ctx.renderer.width, ctx.renderer.height);
    this.elapsed = 0;
  }

  private buttonRect(index: number): { x: number; y: number; w: number; h: number } {
    // Down the right-hand side, clear of the stall front and of Mystia.
    const total = ACTIONS.length * BUTTON_H + (ACTIONS.length - 1) * BUTTON_GAP;
    const top = this.layout.height * 0.56 - total / 2;
    return {
      x: this.layout.width * 0.985 - BUTTON_W,
      y: top + index * (BUTTON_H + BUTTON_GAP),
      w: BUTTON_W,
      h: BUTTON_H,
    };
  }

  update(ctx: SceneContext, dt: number): void {
    this.elapsed += dt;

    // Ambient life: fireflies drifting near the treeline, embers off the grill.
    this.fireflyTimer -= dt;
    if (this.fireflyTimer <= 0) {
      this.fireflyTimer = 0.5;
      this.particles.emit(
        EMITTERS.firefly,
        Math.random() * this.layout.width,
        this.layout.groundY - Math.random() * 160,
        1,
      );
    }
    this.emberTimer -= dt;
    if (this.emberTimer <= 0) {
      this.emberTimer = 0.14;
      this.particles.emit(
        EMITTERS.ember,
        this.layout.stallLeft + 118 + (Math.random() - 0.5) * 70,
        this.layout.counterY - 30,
        1,
      );
    }
    this.particles.update(dt);

    this.hovered = -1;
    for (let i = 0; i < ACTIONS.length; i++) {
      const r = this.buttonRect(i);
      if (hitTest(ctx.input.pointer, r.x, r.y, r.w, r.h)) {
        this.hovered = i;
        if (ctx.input.pressed) this.onChoose((ACTIONS[i] as TitleAction).id);
      }
    }

    if (ctx.input.anyPressed('Enter', 'Space')) this.onChoose('new');
  }

  render(ctx: SceneContext): void {
    const { renderer } = ctx;
    const g = renderer.ctx;
    const light = renderer.light;
    const t = this.elapsed;

    drawNightScene(g, this.layout, t);

    // Mystia behind the counter, tending the grill.
    const mx = this.layout.width * 0.38;
    const my = this.layout.counterY + 16;
    drawCharacter(g, MYSTIA, mx, my, { time: t, height: 260, mood: 0.85, rimFrom: -1 });
    drawSteam(g, this.layout.stallLeft + 118, this.layout.counterY - 54, t, 0.9);

    this.particles.render(g, false);
    // Bamboo frames the shot, so it goes in front of everything in the scene.
    drawNightForeground(g, this.layout, t);

    // --- lighting pass
    drawNightLights(light, this.layout, t);
    characterRim(light, MYSTIA, mx, my, { time: t, height: 260 });
    this.particles.render(light, true);

    const u = renderer.ui;
    this.renderTitle(u);
    this.renderMenu(u);
    this.renderFooter(u);
  }

  private renderTitle(g: CanvasRenderingContext2D): void {
    const cx = this.layout.width * 0.5;
    const y = this.layout.height * 0.088;
    const rise = easeOutCubic(clamp01(this.elapsed / 1.1));

    withState(g, () => {
      g.globalAlpha = rise;
      g.translate(0, (1 - rise) * -30);

      drawText(g, '東方夜雀食堂', cx, y, {
        size: 84,
        font: SERIF,
        weight: 800,
        color: '#ffe3b0',
        align: 'center',
        baseline: 'middle',
        letterSpacing: 14,
        shadow: alpha(LAMP.deep, 0.85),
        shadowBlur: 42,
        outline: shade(0.55),
        outlineWidth: 8,
      });

      drawText(g, "Touhou Mystia's Izakaya", cx, y + 60, {
        size: 26,
        font: GOTHIC,
        weight: 500,
        color: alpha(UI.paper, 0.86),
        align: 'center',
        baseline: 'middle',
        letterSpacing: 6,
        shadow: shade(0.7),
        shadowBlur: 12,
      });
    });
  }

  private renderMenu(g: CanvasRenderingContext2D): void {
    ACTIONS.forEach((action, i) => {
      const r = this.buttonRect(i);
      const active = this.hovered === i;
      const appear = easeOutCubic(clamp01((this.elapsed - 0.35 - i * 0.09) / 0.5));
      if (appear <= 0) return;

      withState(g, () => {
        g.globalAlpha = appear;
        g.translate((1 - appear) * 26, 0);

        // Lacquer plate with a gold rim; the hovered one warms up.
        fillRoundRect(g, r.x, r.y, r.w, r.h, 12, alpha(active ? '#3a2028' : UI.lacquer, 0.88));
        strokeRoundRect(
          g,
          r.x,
          r.y,
          r.w,
          r.h,
          12,
          active ? UI.goldBright : alpha(UI.gold, 0.55),
          active ? 3 : 2,
        );

        if (active) {
          withState(g, () => {
            g.globalCompositeOperation = 'lighter';
            const wash = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y);
            wash.addColorStop(0, alpha(LAMP.warm, 0.16));
            wash.addColorStop(1, alpha(LAMP.warm, 0));
            fillRoundRect(g, r.x, r.y, r.w, r.h, 12, wash);
          });
        }

        drawText(g, t(action.key), r.x + r.w / 2, r.y + r.h / 2, {
          size: 30,
          font: SERIF,
          weight: 700,
          color: active ? '#ffeccb' : UI.paper,
          align: 'center',
          baseline: 'middle',
          letterSpacing: 6,
        });
      });
    });
  }

  private renderFooter(g: CanvasRenderingContext2D): void {
    drawText(
      g,
      t('title.disclaimer'),
      this.layout.width * 0.5,
      this.layout.height - 34,
      {
        size: 17,
        font: GOTHIC,
        color: alpha(UI.paperDim, 0.4),
        align: 'center',
        baseline: 'middle',
        letterSpacing: 1.5,
      },
    );
  }

  /** Exposed so a debug harness can point at the lanterns. */
  get lanterns(): ReturnType<typeof lanternPositions> {
    return lanternPositions(this.layout);
  }
}
