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
import { withState } from '../gfx/vector';
import type { Scene, SceneContext } from '../core/scene';

const COLS = 13;
const CELL_H = 158;

export class GalleryScene implements Scene {
  readonly name = 'gallery';
  private elapsed = 0;
  private readonly specs: CharacterSpec[];

  constructor(mode: 'handmade' | 'all' = 'all') {
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

    drawText(g, 'Cast', 40, 54, {
      size: 40, font: SERIF, weight: 800, color: UI.gold, baseline: 'middle',
    });
    drawText(g, `${this.specs.length} characters from one rig`, 150, 56, {
      size: 20, font: GOTHIC, color: alpha(UI.paperDim, 0.7), baseline: 'middle',
    });

    const cellW = width / COLS;
    const top = 96;

    this.specs.forEach((spec, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = cellW * (col + 0.5);
      const cy = top + row * CELL_H + CELL_H - 34;

      withState(g, () => {
        g.fillStyle = i % 2 === 0 ? alpha('#ffffff', 0.02) : alpha('#000000', 0.12);
        g.fillRect(cellW * col, top + row * CELL_H, cellW, CELL_H);
      });

      drawCharacter(g, spec, cx, cy, { time: this.elapsed, height: 104, mood: 0.8 });
      characterRim(light, spec, cx, cy, { time: this.elapsed, height: 104 });

      drawText(g, spec.short, cx, cy + 18, {
        size: 14, font: GOTHIC, weight: 500,
        color: alpha(UI.paper, 0.8), align: 'center', baseline: 'middle',
      });
    });
  }
}
