/**
 * Closing time: the night's takings on a paper scroll.
 */

import { RATING_COLORS, UI, alpha } from '../art/palette';
import { defaultLayout, drawNightBack, drawNightFront, drawNightLights, type SceneLayout } from '../art/scenery';
import { EMITTERS, ParticleSystem } from '../gfx/particles';
import { GOTHIC, SERIF, drawText } from '../gfx/text';
import { withState } from '../gfx/vector';
import { button, inside, meter, panel, rect, type Rect } from '../ui/widgets';
import { customerName, locationName, money, t } from '../i18n';
import { bondOf, capsFor, expForLevel, saveGame, type GameState } from '../sim/state';
import type { NightService } from '../sim/night';
import type { Rating } from '../rules/rating';
import { clamp01, easeOutCubic } from '../core/tween';
import type { Scene, SceneContext } from '../core/scene';

const RATINGS: Rating[] = ['pink', 'orange', 'green', 'purple', 'black'];

export class ResultsScene implements Scene {
  readonly name = 'results';

  private layout: SceneLayout = defaultLayout(1920, 1080);
  private readonly particles = new ParticleSystem(500);
  private elapsed = 0;
  private hover = false;
  private readonly summary: ReturnType<NightService['summary']>;
  private readonly bondsBefore: Record<string, number>;

  constructor(
    private readonly night: NightService,
    private readonly state: GameState,
    private readonly onClose: () => void,
  ) {
    // Snapshot bonds before the summary so level-ups can be shown.
    this.bondsBefore = Object.fromEntries(
      Object.entries(state.bonds).map(([k, v]) => [k, v.level]),
    );
    this.summary = night.summary();
    saveGame(state);
  }

  enter(ctx: SceneContext): void {
    this.layout = defaultLayout(ctx.renderer.width, ctx.renderer.height);
  }

  private closeRect(): Rect {
    return rect(this.layout.width / 2 - 150, this.layout.height - 148, 300, 62);
  }

  update(ctx: SceneContext, dt: number): void {
    this.elapsed += dt;
    this.particles.update(dt);

    // A slow drift of coins while the ledger settles.
    if (this.elapsed < 1.6 && Math.random() < dt * 12) {
      this.particles.emit(EMITTERS.coin, this.layout.width / 2 + (Math.random() - 0.5) * 420, 420, 1);
    }

    this.hover = inside(ctx.input.pointer, this.closeRect());
    if ((this.hover && ctx.input.pressed) || ctx.input.anyPressed('Enter', 'Space', 'Escape')) {
      this.onClose();
    }
  }

  render(ctx: SceneContext): void {
    const g = ctx.renderer.ctx;
    const u = ctx.renderer.ui;
    const t0 = this.elapsed;

    drawNightBack(g, this.layout, t0);
    drawNightFront(g, this.layout, t0);
    drawNightLights(ctx.renderer.light, this.layout, t0);
    this.particles.render(g, false);

    withState(u, () => {
      u.fillStyle = alpha('#05040a', 0.72);
      u.fillRect(0, 0, this.layout.width, this.layout.height);
    });

    const rise = easeOutCubic(clamp01(this.elapsed / 0.7));
    const w = 900;
    const h = 660;
    const r = rect(this.layout.width / 2 - w / 2, this.layout.height / 2 - h / 2 - 30, w, h);

    withState(u, () => {
      u.globalAlpha = rise;
      u.translate(0, (1 - rise) * 34);
      panel(u, r, { alpha: 0.96, radius: 18 });

      drawText(u, t('results.title'), r.x + r.w / 2, r.y + 54, {
        size: 40, font: SERIF, weight: 800, color: UI.goldBright,
        align: 'center', baseline: 'middle', letterSpacing: 6,
      });
      drawText(u, `第 ${this.state.day} 夜  ·  ${locationName(this.state.location)}`, r.x + r.w / 2, r.y + 92, {
        size: 17, font: GOTHIC, color: alpha(UI.paperDim, 0.7),
        align: 'center', baseline: 'middle',
      });

      this.renderLedger(u, r);
      this.renderHistogram(u, r);
      this.renderBonds(u, r);
      this.renderLevel(u, r);
    });

    button(u, this.closeRect(), {
      label: t('results.continue'),
      hovered: this.hover,
      accent: UI.goldBright,
      size: 24,
    });
  }

  private renderLedger(u: CanvasRenderingContext2D, r: Rect): void {
    const rows: Array<[string, string, string]> = [
      [t('results.revenue'), money(this.summary.revenue), UI.paper],
      [t('results.tips'), money(this.summary.tips), UI.jade],
      [t('results.served'), `${this.summary.served}`, UI.paper],
      [t('results.walkouts'), `${this.summary.walkouts}`, this.summary.walkouts > 0 ? UI.crimson : UI.paperDim],
      [t('results.bestCombo'), `${this.summary.bestCombo}`, UI.gold],
    ];

    rows.forEach(([label, value, color], i) => {
      const y = r.y + 148 + i * 42;
      drawText(u, label, r.x + 56, y, {
        size: 20, font: GOTHIC, color: alpha(UI.paperDim, 0.85), baseline: 'middle',
      });
      drawText(u, value, r.x + 400, y, {
        size: 24, font: GOTHIC, weight: 700, color, align: 'right', baseline: 'middle',
      });
      withState(u, () => {
        u.globalAlpha = 0.14;
        u.strokeStyle = UI.gold;
        u.lineWidth = 1;
        u.beginPath();
        u.moveTo(r.x + 56, y + 20);
        u.lineTo(r.x + 400, y + 20);
        u.stroke();
      });
    });

    // Total, set apart.
    const total = this.summary.revenue + this.summary.tips;
    const y = r.y + 148 + rows.length * 42 + 16;
    drawText(u, '合计', r.x + 56, y, {
      size: 23, font: SERIF, weight: 700, color: UI.goldBright, baseline: 'middle',
    });
    drawText(u, money(total), r.x + 400, y, {
      size: 32, font: GOTHIC, weight: 800, color: UI.goldBright,
      align: 'right', baseline: 'middle',
    });
  }

  private renderHistogram(u: CanvasRenderingContext2D, r: Rect): void {
    const counts = this.state.stats.ratings;
    const max = Math.max(1, ...RATINGS.map((k) => counts[k]));
    const x = r.x + 480;

    drawText(u, '评价分布', x, r.y + 148, {
      size: 18, font: SERIF, weight: 700, color: alpha(UI.paper, 0.85), baseline: 'middle',
    });

    RATINGS.forEach((rating, i) => {
      const y = r.y + 182 + i * 34;
      drawText(u, t(`rating.${rating}`), x, y, {
        size: 16, font: GOTHIC,
        // The badge colour for black is near-black; lift it so the label reads.
        color: rating === 'black' ? '#9a7c8c' : RATING_COLORS[rating],
        baseline: 'middle',
      });
      meter(u, rect(x + 84, y - 8, 220, 16), counts[rating] / max, RATING_COLORS[rating]);
      drawText(u, `${counts[rating]}`, x + 320, y, {
        size: 16, font: GOTHIC, weight: 700, color: alpha(UI.paper, 0.8),
        align: 'right', baseline: 'middle',
      });
    });
  }

  private renderBonds(u: CanvasRenderingContext2D, r: Rect): void {
    // Only guests actually met tonight.
    const met = [...new Set(this.night.guests.filter((g) => g.kind === 'rare').map((g) => g.name))];
    if (met.length === 0) return;

    const y = r.y + 400;
    drawText(u, '羁绊', r.x + 480, y, {
      size: 18, font: SERIF, weight: 700, color: alpha(UI.paper, 0.85), baseline: 'middle',
    });

    met.slice(0, 4).forEach((name, i) => {
      const bond = bondOf(this.state, name);
      const rose = (this.bondsBefore[name] ?? 0) < bond.level;
      const ly = y + 32 + i * 30;
      drawText(u, customerName(name), r.x + 480, ly, {
        size: 16, font: GOTHIC, color: alpha(UI.paper, 0.9), baseline: 'middle',
      });
      drawText(u, rose ? `Lv.${bond.level} ↑` : `Lv.${bond.level}`, r.x + 800, ly, {
        size: 16, font: GOTHIC, weight: 700,
        color: rose ? UI.goldBright : alpha(UI.paperDim, 0.75),
        align: 'right', baseline: 'middle',
      });
    });
  }

  private renderLevel(u: CanvasRenderingContext2D, r: Rect): void {
    const caps = capsFor(this.state.level);
    const need = expForLevel(this.state.level);
    const y = r.y + r.h - 78;

    drawText(u, `店铺等级 ${this.state.level}`, r.x + 56, y, {
      size: 19, font: SERIF, weight: 700, color: UI.gold, baseline: 'middle',
    });
    drawText(u, `菜单 ${caps.menuDishes} · 酒水 ${caps.menuDrinks} · 灶台 ${caps.stations} · 座位 ${caps.seats}`,
      r.x + r.w - 56, y, {
        size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.7),
        align: 'right', baseline: 'middle',
      });
    meter(u, rect(r.x + 56, y + 20, r.w - 112, 12), this.state.exp / need, UI.gold,
      `${this.state.exp} / ${need}`);
  }
}
