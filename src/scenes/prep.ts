/**
 * Prep — what happens before the doors open.
 *
 * The night is decided here as much as on the floor: only dishes on tonight's
 * menu can be cooked, only drinks on the drink list can be poured, and a dish
 * is uncookable unless its cookware came along. All three lists are capped by
 * the izakaya's level, so the screen is really a question of coverage — which
 * tags can you put in front of a guest tonight?
 */

import { BEVERAGES, CUISINES, type Cuisine } from '../data';
import { UI, alpha } from '../art/palette';
import { GOTHIC, SERIF, drawText } from '../gfx/text';
import { fillRoundRect, strokeRoundRect, withState } from '../gfx/vector';
import { type ChipKind, type Rect, button, chipRow, inside, panel, rect } from '../ui/widgets';
import { canCook, capsFor, stockOf } from '../sim/state';
import {
  beverageName,
  dishName,
  kitchenwareName,
  locationName,
  money,
  t,
  tagName,
} from '../i18n';
import type { GameState } from '../sim/state';
import type { Scene, SceneContext } from '../core/scene';

/** Every station kind the player can bring, in the order the game lists them. */
const COOKWARE = ['Grill', 'Boiling Pot', 'Frying Pan', 'Steamer', 'Cutting Board'] as const;

const COLUMN = { dishes: 40, drinks: 700, cookware: 1236 };
const ROW_H = 56;
const LIST_TOP = 214;
const LIST_H = 660;

export class PrepScene implements Scene {
  readonly name = 'prep';

  private width = 1920;
  private height = 1080;
  private hover: string | null = null;
  private scroll = 0;
  private elapsed = 0;

  constructor(
    private readonly state: GameState,
    private readonly onStart: () => void,
  ) {
    // A save from an earlier level may carry more than tonight's caps allow.
    const caps = capsFor(state.level);
    state.menu.dishes = state.menu.dishes.slice(0, caps.menuDishes);
    state.menu.drinks = state.menu.drinks.slice(0, caps.menuDrinks);
    state.stations = state.stations.slice(0, caps.stations);
    if (state.menu.dishes.length === 0) this.suggest();
  }

  enter(ctx: SceneContext): void {
    this.width = ctx.renderer.width;
    this.height = ctx.renderer.height;
  }

  private get caps() {
    return capsFor(this.state.level);
  }

  /** Recipes the player knows, cookable ones first. */
  private get recipes(): string[] {
    return [...this.state.recipes].sort((a, b) => {
      const ca = canCook(this.state, a) ? 0 : 1;
      const cb = canCook(this.state, b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (CUISINES[a]?.level ?? 0) - (CUISINES[b]?.level ?? 0);
    });
  }

  private get drinks(): string[] {
    return Object.keys(BEVERAGES).filter((name) => stockOf(this.state, name) > 0);
  }

  // ------------------------------------------------------------ selection

  private toggleDish(name: string): void {
    const menu = this.state.menu.dishes;
    const at = menu.indexOf(name);
    if (at >= 0) menu.splice(at, 1);
    else if (menu.length < this.caps.menuDishes) menu.push(name);
  }

  private toggleDrink(name: string): void {
    const menu = this.state.menu.drinks;
    const at = menu.indexOf(name);
    if (at >= 0) menu.splice(at, 1);
    else if (menu.length < this.caps.menuDrinks) menu.push(name);
  }

  private toggleStation(kind: string): void {
    const at = this.state.stations.indexOf(kind);
    if (at >= 0) this.state.stations.splice(at, 1);
    else if (this.state.stations.length < this.caps.stations) this.state.stations.push(kind);
  }

  /**
   * Fills all three lists with something workable: the cookware that serves the
   * most cookable recipes, then the recipes those stations can actually make.
   */
  private suggest(): void {
    const cookable = this.recipes.filter((name) => canCook(this.state, name));
    const demand = new Map<string, number>();
    for (const name of cookable) {
      const kind = CUISINES[name]?.kitchenware;
      if (!kind || kind === 'Any') continue;
      demand.set(kind, (demand.get(kind) ?? 0) + 1);
    }
    this.state.stations = [...COOKWARE]
      .sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0))
      .slice(0, this.caps.stations);

    const usable = cookable.filter((name) => this.servedBy(CUISINES[name]));
    this.state.menu.dishes = usable.slice(0, this.caps.menuDishes);
    this.state.menu.drinks = this.drinks.slice(0, this.caps.menuDrinks);
  }

  private servedBy(dish: Cuisine | undefined): boolean {
    if (!dish) return false;
    return dish.kitchenware === 'Any' || this.state.stations.includes(dish.kitchenware);
  }

  /** Everything wrong with the current loadout, worst first. */
  private problems(): string[] {
    const out: string[] = [];
    if (this.state.menu.dishes.length === 0) out.push(t('prep.needDish'));
    if (this.state.menu.drinks.length === 0) out.push(t('prep.needDrink'));
    if (this.state.stations.length === 0) out.push(t('prep.needStation'));
    for (const name of this.state.menu.dishes) {
      const dish = CUISINES[name];
      if (!dish) continue;
      if (!this.servedBy(dish)) {
        out.push(t('prep.warnNoStation', {
          dish: dishName(name),
          station: kitchenwareName(dish.kitchenware),
        }));
      } else if (!canCook(this.state, name)) {
        out.push(t('prep.warnNoStock', { dish: dishName(name) }));
      }
    }
    return out;
  }

  private get blocked(): boolean {
    return (
      this.state.menu.dishes.length === 0 ||
      this.state.menu.drinks.length === 0 ||
      this.state.stations.length === 0
    );
  }

  // --------------------------------------------------------------- layout

  private dishRows(): Array<{ name: string; r: Rect }> {
    return this.recipes.map((name, i) => ({
      name,
      r: rect(COLUMN.dishes + 18, LIST_TOP + 12 + i * ROW_H - this.scroll, 606, ROW_H - 8),
    }));
  }

  private drinkRows(): Array<{ name: string; r: Rect }> {
    return this.drinks.map((name, i) => ({
      name,
      r: rect(COLUMN.drinks + 18, LIST_TOP + 12 + i * ROW_H, 482, ROW_H - 8),
    }));
  }

  private cookwareCards(): Array<{ kind: string; r: Rect }> {
    return COOKWARE.map((kind, i) => ({
      kind,
      r: rect(COLUMN.cookware + 20, LIST_TOP + 12 + i * 78, 604, 68),
    }));
  }

  private startButton(): Rect {
    return rect(this.width - 372, this.height - 108, 332, 68);
  }

  private suggestButton(): Rect {
    return rect(this.width - 372 - 208, this.height - 108, 190, 68);
  }

  // --------------------------------------------------------------- update

  update(ctx: SceneContext, dt: number): void {
    this.elapsed += dt;
    this.hover = null;
    const p = ctx.input.pointer;
    const click = ctx.input.pressed;

    // Only the recipe column scrolls; it is the one that can outgrow the panel.
    if (p.x > COLUMN.dishes && p.x < COLUMN.drinks && ctx.input.wheel !== 0) {
      const span = Math.max(0, this.recipes.length * ROW_H - LIST_H + 24);
      this.scroll = Math.max(0, Math.min(span, this.scroll + ctx.input.wheel * 0.6));
    }

    for (const { name, r } of this.dishRows()) {
      if (r.y < LIST_TOP || r.y + r.h > LIST_TOP + LIST_H) continue;
      if (!inside(p, r)) continue;
      this.hover = `dish:${name}`;
      if (click) this.toggleDish(name);
    }
    for (const { name, r } of this.drinkRows()) {
      if (!inside(p, r)) continue;
      this.hover = `drink:${name}`;
      if (click) this.toggleDrink(name);
    }
    for (const { kind, r } of this.cookwareCards()) {
      if (!inside(p, r)) continue;
      this.hover = `ware:${kind}`;
      if (click) this.toggleStation(kind);
    }

    if (inside(p, this.suggestButton())) {
      this.hover = 'suggest';
      if (click) this.suggest();
    }
    if (inside(p, this.startButton())) {
      this.hover = 'start';
      if (click && !this.blocked) this.onStart();
    }
    if (ctx.input.anyPressed('Space', 'Enter') && !this.blocked) this.onStart();
  }

  // --------------------------------------------------------------- render

  render(ctx: SceneContext): void {
    const g = ctx.renderer.ctx;
    this.renderBackdrop(g);

    const u = ctx.renderer.ui;
    this.renderHeader(u);
    this.renderDishes(u);
    this.renderDrinks(u);
    this.renderCookware(u);
    this.renderFooter(u);
  }

  private renderBackdrop(g: CanvasRenderingContext2D): void {
    const bg = g.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, '#120b16');
    bg.addColorStop(0.55, '#1c1220');
    bg.addColorStop(1, '#0d080f');
    g.fillStyle = bg;
    g.fillRect(0, 0, this.width, this.height);

    // A wash of lamplight from the top corners, so it feels like the same shop.
    withState(g, () => {
      g.globalCompositeOperation = 'lighter';
      for (const x of [this.width * 0.16, this.width * 0.84]) {
        const glow = g.createRadialGradient(x, -60, 20, x, -60, 620);
        glow.addColorStop(0, alpha('#ff9440', 0.2));
        glow.addColorStop(1, alpha('#ff7a30', 0));
        g.fillStyle = glow;
        g.fillRect(0, 0, this.width, this.height);
      }
    });

    // Faint vertical rule between the columns.
    withState(g, () => {
      g.globalAlpha = 0.12;
      g.fillStyle = UI.gold;
      for (const x of [COLUMN.drinks - 20, COLUMN.cookware - 22]) {
        g.fillRect(x, LIST_TOP - 40, 1.5, LIST_H + 60);
      }
    });
  }

  private renderHeader(g: CanvasRenderingContext2D): void {
    drawText(g, t('prep.title'), 44, 78, {
      size: 54, font: SERIF, weight: 800, color: UI.goldBright, baseline: 'middle', letterSpacing: 8,
    });
    drawText(g, t('prep.subtitle'), 46, 126, {
      size: 19, font: GOTHIC, color: alpha(UI.paperDim, 0.8), baseline: 'middle',
    });

    const facts = [
      t('prep.day', { day: this.state.day }),
      locationName(this.state.location),
      t('prep.level', { level: this.state.level }),
      money(this.state.money),
    ];
    let x = this.width - 44;
    for (const fact of facts.reverse()) {
      g.font = '700 19px "Zen Maru Gothic", sans-serif';
      const w = g.measureText(fact).width + 34;
      x -= w;
      fillRoundRect(g, x, 52, w, 42, 21, alpha('#1c1119', 0.85));
      strokeRoundRect(g, x, 52, w, 42, 21, alpha(UI.gold, 0.35), 1.4);
      drawText(g, fact, x + w / 2, 73, {
        size: 19, font: GOTHIC, weight: 700, color: UI.paper, align: 'center', baseline: 'middle',
      });
      x -= 12;
    }
  }

  private columnHeading(g: CanvasRenderingContext2D, x: number, w: number, label: string, used: number, max: number): void {
    drawText(g, label, x + 20, LIST_TOP - 26, {
      size: 26, font: SERIF, weight: 800, color: UI.paper, baseline: 'middle', letterSpacing: 3,
    });
    const badge = t('prep.slots', { used, max });
    const full = used >= max;
    g.font = '800 18px "Zen Maru Gothic", sans-serif';
    const bw = g.measureText(badge).width + 26;
    fillRoundRect(g, x + w - bw - 18, LIST_TOP - 42, bw, 32, 16, alpha(full ? UI.gold : '#2a1d2a', full ? 0.9 : 0.85));
    drawText(g, badge, x + w - bw / 2 - 18, LIST_TOP - 26, {
      size: 18, font: GOTHIC, weight: 800,
      color: full ? '#241a16' : UI.paperDim, align: 'center', baseline: 'middle',
    });
  }

  private renderDishes(g: CanvasRenderingContext2D): void {
    const w = 642;
    panel(g, rect(COLUMN.dishes, LIST_TOP, w, LIST_H), { alpha: 0.5, radius: 14 });
    this.columnHeading(g, COLUMN.dishes, w, t('prep.dishes'), this.state.menu.dishes.length, this.caps.menuDishes);

    withState(g, () => {
      g.beginPath();
      g.rect(COLUMN.dishes, LIST_TOP, w, LIST_H);
      g.clip();

      for (const { name, r } of this.dishRows()) {
        if (r.y + r.h < LIST_TOP || r.y > LIST_TOP + LIST_H) continue;
        const dish = CUISINES[name];
        if (!dish) continue;
        const picked = this.state.menu.dishes.indexOf(name);
        const stocked = canCook(this.state, name);
        const served = this.servedBy(dish);
        const bad = picked >= 0 && (!stocked || !served);

        // Tags go in the sub-line rather than a chip row: the row is only so
        // wide, and a centred label with chips beside it collides at 3 tags.
        const tags = dish.props.slice(0, 3).map((tag) => tagName(String(tag))).join('/');
        button(g, r, {
          label: dishName(name),
          sub: `${kitchenwareName(dish.kitchenware)} · ${dish.cookTime.toFixed(1)}s · ${money(dish.cost)}${
            tags ? ` · ${tags}` : ''
          }${stocked ? '' : ` · ${t('cook.outOfStock')}`}`,
          hovered: this.hover === `dish:${name}` || picked >= 0,
          disabled: !stocked && picked < 0,
          accent: bad ? UI.crimson : picked >= 0 ? UI.goldBright : UI.gold,
          size: 19,
        });

        if (picked >= 0) {
          fillRoundRect(g, r.x + r.w - 44, r.y + 12, 30, 30, 15, bad ? UI.crimson : UI.goldBright);
          drawText(g, bad ? '!' : `${picked + 1}`, r.x + r.w - 29, r.y + 27, {
            size: 17, font: GOTHIC, weight: 800, color: '#241a16', align: 'center', baseline: 'middle',
          });
        }
      }
    });

    // Scroll indicator.
    const span = Math.max(0, this.recipes.length * ROW_H - LIST_H + 24);
    if (span > 0) {
      const track = LIST_H - 40;
      const thumb = Math.max(40, track * (LIST_H / (this.recipes.length * ROW_H)));
      const at = (this.scroll / span) * (track - thumb);
      fillRoundRect(g, COLUMN.dishes + w - 10, LIST_TOP + 20 + at, 4, thumb, 2, alpha(UI.gold, 0.5));
    }
  }

  private renderDrinks(g: CanvasRenderingContext2D): void {
    const w = 518;
    panel(g, rect(COLUMN.drinks, LIST_TOP, w, LIST_H), { alpha: 0.5, radius: 14 });
    this.columnHeading(g, COLUMN.drinks, w, t('prep.drinks'), this.state.menu.drinks.length, this.caps.menuDrinks);

    withState(g, () => {
      g.beginPath();
      g.rect(COLUMN.drinks, LIST_TOP, w, LIST_H);
      g.clip();
      for (const { name, r } of this.drinkRows()) {
        if (r.y > LIST_TOP + LIST_H) break;
        const drink = BEVERAGES[name];
        if (!drink) continue;
        const picked = this.state.menu.drinks.includes(name);
        button(g, r, {
          label: beverageName(name),
          sub: `${t('prep.stock', { count: stockOf(this.state, name) })} · ${drink.props
            .slice(0, 3)
            .map((x) => tagName(String(x)))
            .join(' · ')}`,
          hovered: this.hover === `drink:${name}` || picked,
          accent: picked ? UI.jade : UI.gold,
          size: 19,
        });
        if (picked) {
          fillRoundRect(g, r.x + r.w - 42, r.y + 13, 28, 28, 14, UI.jade);
          drawText(g, '✓', r.x + r.w - 28, r.y + 27, {
            size: 17, font: GOTHIC, weight: 800, color: '#0f1a15', align: 'center', baseline: 'middle',
          });
        }
      }
    });
  }

  private renderCookware(g: CanvasRenderingContext2D): void {
    const w = 644;
    panel(g, rect(COLUMN.cookware, LIST_TOP, w, 420), { alpha: 0.5, radius: 14 });
    this.columnHeading(g, COLUMN.cookware, w, t('prep.stations'), this.state.stations.length, this.caps.stations);

    for (const { kind, r } of this.cookwareCards()) {
      const picked = this.state.stations.indexOf(kind);
      // How much of tonight's menu this station would unlock.
      const serves = this.recipes.filter((n) => CUISINES[n]?.kitchenware === kind).length;
      button(g, r, {
        label: kitchenwareName(kind),
        sub: t('prep.usedBy', { count: serves }),
        hovered: this.hover === `ware:${kind}` || picked >= 0,
        accent: picked >= 0 ? UI.goldBright : UI.gold,
        size: 22,
      });
      if (picked >= 0) {
        fillRoundRect(g, r.x + r.w - 46, r.y + 19, 30, 30, 15, UI.goldBright);
        drawText(g, `${picked + 1}`, r.x + r.w - 31, r.y + 34, {
          size: 17, font: GOTHIC, weight: 800, color: '#241a16', align: 'center', baseline: 'middle',
        });
      }
    }

    // Coverage and warnings share the space below the cookware cards.
    const info = rect(COLUMN.cookware, LIST_TOP + 440, w, LIST_H - 440);
    panel(g, info, { alpha: 0.5, radius: 14 });
    drawText(g, t('prep.coverage'), info.x + 20, info.y + 30, {
      size: 20, font: SERIF, weight: 700, color: UI.paper, baseline: 'middle',
    });

    const tags = new Set<string>();
    for (const name of this.state.menu.dishes) {
      for (const tag of CUISINES[name]?.props ?? []) tags.add(String(tag));
    }
    for (const name of this.state.menu.drinks) {
      for (const tag of BEVERAGES[name]?.props ?? []) tags.add(String(tag));
    }
    if (tags.size === 0) {
      drawText(g, t('prep.noCoverage'), info.x + 20, info.y + 66, {
        size: 17, font: GOTHIC, color: alpha(UI.paperDim, 0.6), baseline: 'middle',
      });
    } else {
      chipRow(
        g,
        [...tags].map((tag) => ({ text: tagName(tag), kind: 'innate' as ChipKind })),
        info.x + 20,
        info.y + 54,
        w - 40,
        15,
      );
    }

    const problems = this.problems();
    let y = info.y + info.h - 26 - Math.min(4, problems.length) * 26;
    if (problems.length === 0) {
      drawText(g, `✓ ${t('prep.ready')}`, info.x + 20, info.y + info.h - 30, {
        size: 18, font: GOTHIC, weight: 700, color: UI.jade, baseline: 'middle',
      });
      return;
    }
    for (const problem of problems.slice(0, 4)) {
      drawText(g, `⚠ ${problem}`, info.x + 20, y, {
        size: 17, font: GOTHIC, color: UI.crimson, baseline: 'middle',
      });
      y += 26;
    }
  }

  private renderFooter(g: CanvasRenderingContext2D): void {
    drawText(g, t('prep.hint'), 46, this.height - 74, {
      size: 17, font: GOTHIC, color: alpha(UI.paperDim, 0.6), baseline: 'middle',
    });

    button(g, this.suggestButton(), {
      label: t('prep.auto'),
      hovered: this.hover === 'suggest',
      accent: UI.indigo,
      size: 22,
    });

    const start = this.startButton();
    const pulse = this.blocked ? 0 : 0.5 + 0.5 * Math.sin(this.elapsed * 2.4);
    if (!this.blocked) {
      withState(g, () => {
        g.globalAlpha = 0.28 + pulse * 0.22;
        strokeRoundRect(g, start.x - 5, start.y - 5, start.w + 10, start.h + 10, 16, UI.goldBright, 3);
      });
    }
    button(g, start, {
      label: t('prep.start'),
      hovered: this.hover === 'start',
      disabled: this.blocked,
      accent: UI.goldBright,
      size: 26,
    });
  }
}
