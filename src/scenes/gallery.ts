/**
 * Cast gallery. Not part of the game loop — it renders every character spec
 * side by side so the art can be reviewed in one screenshot, which is how the
 * rig gets validated as new customers are added.
 */

import { CAST, specFor } from '../art/cast';
import { UI, alpha } from '../art/palette';
import { drawCharacter, characterRim, type CharacterSpec } from '../art/characters';
import { RARE_CUSTOMERS } from '../data';
import { GOTHIC, SERIF, drawText } from '../gfx/text';
import { customerName, t } from '../i18n';
import { withState } from '../gfx/vector';
import type { Scene, SceneContext } from '../core/scene';

const COLS = 13;
const CELL_H = 158;
/** `?big=1` shows a handful at portrait size, for judging the art up close. */
const BIG_COLS = 5;
const BIG_CELL_H = 460;

export class GalleryScene implements Scene {
  readonly name = 'gallery';
  private elapsed = 0;
  private readonly specs: CharacterSpec[];

  constructor(mode: 'handmade' | 'all' = 'all', private readonly big = false) {
    if (mode === 'handmade') {
      this.specs = CAST;
    } else {
      // Every rare customer in the database, handmade or procedurally derived.
      const seen = new Set(CAST.map((c) => c.name));
      const derived = Object.values(RARE_CUSTOMERS)
        .filter((c) => !seen.has(c.name))
        .map((c) => specFor(c.name, c.shortName));
      this.specs = [...CAST, ...derived];
    }
  }

  update(_ctx: SceneContext, dt: number): void {
    this.elapsed += dt;
  }

  render(ctx: SceneContext): void {
    const g = ctx.renderer.ctx;
    const light = ctx.renderer.light;
    const { width, height } = ctx.renderer;

    g.fillStyle = '#171226';
    g.fillRect(0, 0, width, height);

    drawText(g, t('gallery.title'), 40, 54, {
      size: 40, font: SERIF, weight: 800, color: UI.gold, baseline: 'middle',
    });
    drawText(g, t('gallery.subtitle', { count: this.specs.length }), 190, 56, {
      size: 20, font: GOTHIC, color: alpha(UI.paperDim, 0.7), baseline: 'middle',
    });

    const cols = this.big ? BIG_COLS : COLS;
    const cellH = this.big ? BIG_CELL_H : CELL_H;
    const figure = this.big ? 380 : 104;
    const cellW = width / cols;
    const top = 96;

    const shown = this.big ? this.specs.slice(0, BIG_COLS * 2) : this.specs;
    shown.forEach((spec, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = cellW * (col + 0.5);
      const cy = top + row * cellH + cellH - 46;

      withState(g, () => {
        g.fillStyle = i % 2 === 0 ? alpha('#ffffff', 0.02) : alpha('#000000', 0.12);
        g.fillRect(cellW * col, top + row * cellH, cellW, cellH);
      });

      // Half the row walks, so the walk cycle is visible in the same shot.
      const walking = this.big && col % 2 === 1;
      drawCharacter(g, spec, cx, cy, {
        time: this.elapsed,
        height: figure,
        mood: 0.85,
        ...(walking ? { walk: (this.elapsed * 1.6) % 1 } : {}),
      });
      characterRim(light, spec, cx, cy, { time: this.elapsed, height: figure });

      drawText(g, customerName(spec.name), cx, cy + (this.big ? 30 : 18), {
        size: this.big ? 20 : 14, font: GOTHIC, weight: 500,
        color: alpha(UI.paper, 0.8), align: 'center', baseline: 'middle',
      });
    });
  }
}
