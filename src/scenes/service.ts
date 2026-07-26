/**
 * Night service — the core loop.
 *
 * Guests take the stools, their orders appear above them, and you cook on the
 * stations along the bottom. The cook panel is where the tag system is taught:
 * adding an ingredient previews the tags it contributes, strikes the ones the
 * priority rules cancel, and warns before a forbidden tag ruins the dish.
 */

import { BEVERAGES, CUISINES, INGREDIENTS, type CuisineTag } from '../data';
import { MYSTIA } from '../art/cast';
import { LAMP, RATING_COLORS, UI, alpha } from '../art/palette';
import { characterRim, drawCharacter } from '../art/characters';
import {
  defaultLayout,
  drawNightBack,
  drawNightForeground,
  drawNightFront,
  drawNightLights,
  drawSteam,
  seatPositions,
  type SceneLayout,
} from '../art/scenery';
import { EMITTERS, ParticleSystem } from '../gfx/particles';
import { GOTHIC, SERIF, drawText, wrapText } from '../gfx/text';
import { fillRoundRect, strokeRoundRect, withState } from '../gfx/vector';
import {
  type ChipKind,
  type Rect,
  bubble,
  button,
  chipRow,
  inside,
  meter,
  panel,
  ratingCard,
  rect,
  stat,
} from '../ui/widgets';
import { NIGHT_SECONDS, NightService, type Guest, type Station } from '../sim/night';
import { canCook, stockOf } from '../sim/state';
import { freeSlots, previewAddition, resolveDishTags } from '../rules/tags';
import {
  beverageName,
  dishName,
  ingredientName,
  kitchenwareName,
  money,
  t,
  tagName,
  timer,
} from '../i18n';
import { clamp01, easeOutCubic } from '../core/tween';
import type { Scene, SceneContext } from '../core/scene';

const STATION_W = 168;
const STATION_H = 96;

type Panel = { kind: 'none' } | { kind: 'cook'; station: number } | { kind: 'drinks' };

export class ServiceScene implements Scene {
  readonly name = 'service';

  private layout: SceneLayout = defaultLayout(1920, 1080);
  private readonly particles = new ParticleSystem(1400);
  private elapsed = 0;
  private open: Panel = { kind: 'none' };
  /** Recipe chosen inside the cook panel, before ingredients are added. */
  private picked: string | null = null;
  private extras: string[] = [];
  private toast: { text: string; left: number } | null = null;
  private hover: string | null = null;

  constructor(
    private readonly night: NightService,
    private readonly onFinished: () => void,
  ) {}

  enter(ctx: SceneContext): void {
    this.layout = defaultLayout(ctx.renderer.width, ctx.renderer.height);
  }

  /** Exposed for the scripted end-to-end test. */
  get simulation(): NightService {
    return this.night;
  }

  // ------------------------------------------------------------- geometry

  private stationRect(i: number): Rect {
    const count = this.night.stations.length;
    const total = count * STATION_W + (count - 1) * 16;
    const left = this.layout.width / 2 - total / 2;
    return rect(left + i * (STATION_W + 16), this.layout.height - STATION_H - 26, STATION_W, STATION_H);
  }

  private trayRect(): Rect {
    return rect(this.layout.width - 320, this.layout.height - STATION_H - 26, 290, STATION_H);
  }

  private seatRect(seat: number): Rect {
    const p = seatPositions(this.layout, this.night.seats)[seat];
    if (!p) return rect(-999, -999, 0, 0);
    return rect(p.x - 74, this.layout.counterY - 190, 148, 200);
  }

  // --------------------------------------------------------------- update

  update(ctx: SceneContext, dt: number): void {
    this.elapsed += dt;
    this.night.update(dt);
    this.particles.update(dt);

    if (this.toast) {
      this.toast.left -= dt;
      if (this.toast.left <= 0) this.toast = null;
    }

    // Embers off the grill keep the scene alive.
    if (Math.random() < dt * 7) {
      this.particles.emit(
        EMITTERS.ember,
        this.layout.stallLeft + 118 + (Math.random() - 0.5) * 70,
        this.layout.counterY - 30,
        1,
      );
    }

    this.handleInput(ctx);

    if (this.night.finished) this.onFinished();
  }

  private handleInput(ctx: SceneContext): void {
    const p = ctx.input.pointer;
    const click = ctx.input.pressed;
    this.hover = null;

    if (ctx.input.anyPressed('Escape')) {
      this.open = { kind: 'none' };
      this.picked = null;
      this.extras = [];
    }

    if (this.open.kind === 'cook') {
      this.cookPanelInput(ctx, this.open.station);
      return;
    }
    if (this.open.kind === 'drinks') {
      this.drinkPanelInput(ctx);
      return;
    }

    // Stations: open the cook panel, or collect a finished dish.
    this.night.stations.forEach((station, i) => {
      const r = this.stationRect(i);
      if (!inside(p, r)) return;
      this.hover = `station:${i}`;
      if (!click) return;
      if (station.ready) {
        if (this.night.carrying) this.say(t('msg.handsFull'));
        else {
          this.night.collect(i);
          this.burst(r.x + r.w / 2, r.y, 'sparkle', 8);
        }
      } else if (!station.job) {
        this.open = { kind: 'cook', station: i };
        this.picked = null;
        this.extras = [];
      } else {
        this.say(t('station.busy'));
      }
    });

    // The tray: pour a drink to go with the dish in hand.
    const tray = this.trayRect();
    if (inside(p, tray)) {
      this.hover = 'tray';
      if (click) {
        if (!this.night.carrying) this.say(t('msg.cookFirst'));
        else if (this.night.pouring) this.night.discard();
        else this.open = { kind: 'drinks' };
      }
    }

    // Guests: serve whoever is clicked.
    for (let seat = 0; seat < this.night.seats; seat++) {
      const guest = this.night.guestAt(seat);
      if (!guest || guest.state !== 'waiting') continue;
      const r = this.seatRect(seat);
      if (!inside(p, r)) continue;
      this.hover = `seat:${seat}`;
      if (!click) continue;

      if (!this.night.carrying) this.say(t('msg.nothingToServe'));
      else if (!this.night.pouring) this.say(t('msg.needDrink'));
      else {
        const event = this.night.serve(seat);
        if (event?.rating) {
          const pos = seatPositions(this.layout, this.night.seats)[seat];
          const color = RATING_COLORS[event.rating];
          this.burst(pos?.x ?? 0, this.layout.counterY - 120, event.rating === 'pink' ? 'sparkle' : 'coin', 18, color);
        }
      }
    }
  }

  private cookPanelInput(ctx: SceneContext, stationId: number): void {
    const p = ctx.input.pointer;
    const click = ctx.input.pressed;
    const station = this.night.stations[stationId];
    if (!station) return;

    const layout = this.cookLayout();
    if (click && !inside(p, layout.panel)) {
      this.open = { kind: 'none' };
      return;
    }

    layout.recipes.forEach(({ name, r }) => {
      if (!inside(p, r)) return;
      this.hover = `recipe:${name}`;
      if (click) {
        this.picked = this.picked === name ? null : name;
        this.extras = [];
      }
    });

    if (this.picked) {
      layout.ingredients.forEach(({ name, r }) => {
        if (!inside(p, r)) return;
        this.hover = `ing:${name}`;
        if (!click) return;
        const idx = this.extras.indexOf(name);
        if (idx >= 0) this.extras.splice(idx, 1);
        else if (this.extras.length < freeSlots(CUISINES[this.picked as string] as never)) {
          if (stockOf(this.night.state, name) > this.extras.filter((e) => e === name).length) {
            this.extras.push(name);
          } else this.say(t('msg.noneLeft', { item: ingredientName(name) }));
        } else this.say(t('msg.noRoom'));
      });

      if (inside(p, layout.confirm)) {
        this.hover = 'confirm';
        if (click) {
          const error = this.night.startCooking(stationId, this.picked, this.extras);
          if (error) this.say(error);
          else {
            this.open = { kind: 'none' };
            this.picked = null;
            this.extras = [];
          }
        }
      }
    }
  }

  private drinkPanelInput(ctx: SceneContext): void {
    const p = ctx.input.pointer;
    const click = ctx.input.pressed;
    const layout = this.drinkLayout();
    if (click && !inside(p, layout.panel)) {
      this.open = { kind: 'none' };
      return;
    }
    layout.drinks.forEach(({ name, r }) => {
      if (!inside(p, r)) return;
      this.hover = `drink:${name}`;
      if (!click) return;
      if (this.night.pour(name)) this.open = { kind: 'none' };
      else this.say(t('msg.noneLeft', { item: beverageName(name) }));
    });
  }

  private say(text: string): void {
    this.toast = { text, left: 2.2 };
  }

  private burst(x: number, y: number, kind: 'sparkle' | 'coin', n: number, color?: string): void {
    const base = EMITTERS[kind];
    this.particles.emit(color ? { ...base, colors: [color, ...base.colors] } : base, x, y, n);
  }

  // --------------------------------------------------------------- render

  render(ctx: SceneContext): void {
    const g = ctx.renderer.ctx;
    const light = ctx.renderer.light;
    const t = this.elapsed;

    drawNightBack(g, this.layout, t);

    // Guests sit behind the counter so the slab crops them at the chest.
    const seats = seatPositions(this.layout, this.night.seats);
    for (let seat = 0; seat < this.night.seats; seat++) {
      const guest = this.night.guestAt(seat);
      const pos = seats[seat];
      if (!guest || !pos) continue;
      const mood = guest.verdict
        ? { black: 0.05, purple: 0.25, green: 0.55, orange: 0.85, pink: 1 }[guest.verdict.rating]
        : 0.35 + guest.patience * 0.35;
      const leaving = guest.state === 'leaving' ? 1 - clamp01(guest.reactionLeft / 2.4) : 0;
      withState(g, () => {
        g.globalAlpha = 1 - leaving * 0.85;
        g.translate(0, leaving * 40);
        drawCharacter(g, guest.spec, pos.x, pos.y, { time: t, height: 280, mood });
      });
      characterRim(light, guest.spec, pos.x, pos.y, { time: t, height: 280 });
    }

    // Mystia works the grill end of the counter.
    const mx = this.layout.stallLeft + 126;
    const my = this.layout.counterY + 40;
    drawCharacter(g, MYSTIA, mx, my, { time: t, height: 300, mood: 0.8, rimFrom: -1 });
    characterRim(light, MYSTIA, mx, my, { time: t, height: 300 });

    drawNightFront(g, this.layout, t);
    drawSteam(g, this.layout.stallLeft + 118, this.layout.counterY - 56, t, 0.9);
    for (const station of this.night.stations) {
      if (station.job) {
        const r = this.stationRect(station.id);
        drawSteam(g, r.x + r.w / 2, r.y - 6, t + station.id, 0.7);
      }
    }

    this.particles.render(g, false);
    drawNightForeground(g, this.layout, t);

    drawNightLights(light, this.layout, t);
    this.particles.render(light, true);

    // Interface goes on the UI layer so bloom does not wash it out.
    const u = ctx.renderer.ui;
    this.renderOrders(u);
    this.renderHud(u);
    this.renderStations(u);
    this.renderTray(u);

    if (this.open.kind === 'cook') this.renderCookPanel(u, this.open.station);
    if (this.open.kind === 'drinks') this.renderDrinkPanel(u);
    this.renderToast(u);
  }

  private renderOrders(g: CanvasRenderingContext2D): void {
    const seats = seatPositions(this.layout, this.night.seats);
    for (let seat = 0; seat < this.night.seats; seat++) {
      const guest = this.night.guestAt(seat);
      const pos = seats[seat];
      if (!guest || !pos) continue;

      if (guest.verdict) {
        ratingCard(g, pos.x, this.layout.counterY - 210, guest.verdict.rating, guest.verdict.note);
        if (guest.verdict.paid > 0) {
          drawText(g, `+${money(guest.verdict.paid + guest.verdict.tip)}`, pos.x, this.layout.counterY - 222, {
            size: 25, font: GOTHIC, weight: 800, color: UI.goldBright,
            align: 'center', baseline: 'bottom',
            shadow: 'rgba(0,0,0,0.8)', shadowBlur: 8,
          });
        }
        continue;
      }
      this.renderOrderBubble(g, guest, pos.x);
    }
  }

  private renderOrderBubble(g: CanvasRenderingContext2D, guest: Guest, cx: number): void {
    const wanted: Array<{ text: string; kind: ChipKind }> = [];
    if (guest.order.dishTag) wanted.push({ text: tagName(String(guest.order.dishTag)), kind: 'wanted' });
    if (guest.order.drinkTag) wanted.push({ text: tagName(String(guest.order.drinkTag)), kind: 'wanted' });

    const w = 268;
    const lines = wrapText(g, guest.request, w - 28, { size: 16, font: GOTHIC });
    const h = 44 + lines.length * 21 + (wanted.length ? 34 : 0);
    const top = this.layout.counterY - 214 - h;
    // Clamp so a guest near either edge still gets a fully visible bubble.
    const x = Math.max(14, Math.min(cx - w / 2, this.layout.width - w - 14));
    const r = rect(x, top, w, h);

    bubble(g, r, cx, guest.kind === 'rare' ? '#f6e6cc' : UI.paper);

    drawText(g, guest.shortName, r.x + 14, r.y + 20, {
      size: 17, font: SERIF, weight: 800,
      color: guest.kind === 'rare' ? UI.crimson : '#3a2b26', baseline: 'middle',
    });
    if (guest.budget !== null) {
      drawText(g, `≤ ${money(guest.budget)}`, r.x + r.w - 14, r.y + 20, {
        size: 15, font: GOTHIC, weight: 700,
        color: '#7a5a30', align: 'right', baseline: 'middle',
      });
    }
    lines.forEach((line, i) => {
      drawText(g, line, r.x + 14, r.y + 42 + i * 21, {
        size: 16, font: GOTHIC, color: '#4a3a33', baseline: 'middle',
      });
    });
    if (wanted.length) {
      chipRow(g, wanted, r.x + 14, r.y + h - 32, w - 28, 14);
    }

    // Patience ring doubles as the bubble's border colour cue.
    const patience = guest.patience;
    const color = patience > 0.5 ? UI.jade : patience > 0.25 ? UI.gold : UI.crimson;
    meter(g, rect(r.x + 14, r.y + h - 9, r.w - 28, 5), patience, color);
  }

  private renderHud(g: CanvasRenderingContext2D): void {
    const bar = rect(24, 20, 470, 66);
    panel(g, bar, { alpha: 0.82 });

    const closing = this.night.timeLeft < 30;
    stat(g, '时', timer(this.night.timeLeft), bar.x + 20, bar.y + 33,
      closing ? UI.crimson : UI.paper);
    stat(g, '钱', money(this.night.revenue + this.night.tips), bar.x + 172, bar.y + 33, UI.goldBright);
    stat(g, '连', `${this.night.combo}`, bar.x + 358, bar.y + 33,
      this.night.combo > 0 ? UI.jade : UI.paperDim);

    // Night progress along the bottom of the HUD.
    meter(
      g,
      rect(bar.x + 14, bar.y + bar.h - 12, bar.w - 28, 5),
      1 - this.night.timeLeft / NIGHT_SECONDS,
      closing ? UI.crimson : UI.gold,
    );

    // Satisfaction, on the right.
    const sat = rect(this.layout.width - 300, 20, 276, 66);
    panel(g, sat, { alpha: 0.82 });
    drawText(g, t('hud.reputation'), sat.x + 18, sat.y + 22, {
      size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.85), baseline: 'middle',
    });
    meter(g, rect(sat.x + 18, sat.y + 36, sat.w - 36, 16), this.night.satisfaction / 100,
      this.night.satisfaction > 60 ? UI.jade : this.night.satisfaction > 30 ? UI.gold : UI.crimson,
      `${Math.round(this.night.satisfaction)}`);

    // Tonight's trends, so the player can plan around them.
    const trends = this.night.trendState;
    if (trends.popular || trends.unpopular) {
      const chips: Array<{ text: string; kind: ChipKind }> = [];
      if (trends.popular) chips.push({ text: `▲ ${tagName(String(trends.popular))}`, kind: 'trend' });
      if (trends.unpopular) chips.push({ text: `▼ ${tagName(String(trends.unpopular))}`, kind: 'struck' });
      chipRow(g, chips, sat.x, sat.y + sat.h + 10, sat.w, 14);
    }
  }

  private renderStations(g: CanvasRenderingContext2D): void {
    this.night.stations.forEach((station, i) => {
      const r = this.stationRect(i);
      const hovered = this.hover === `station:${i}`;
      const ready = station.ready !== null;

      panel(g, r, { alpha: 0.9 });
      if (hovered || ready) {
        strokeRoundRect(g, r.x, r.y, r.w, r.h, 12,
          ready ? UI.goldBright : alpha(UI.gold, 0.8), ready ? 2.6 : 2);
      }

      drawText(g, kitchenwareName(station.kind), r.x + r.w / 2, r.y + 22, {
        size: 18, font: SERIF, weight: 700, color: alpha(UI.gold, 0.9),
        align: 'center', baseline: 'middle',
      });

      if (station.job) {
        const progress = 1 - station.job.remaining / station.job.total;
        drawText(g, dishName(station.job.cuisine.name), r.x + r.w / 2, r.y + 48, {
          size: 14, font: GOTHIC, color: UI.paper, align: 'center', baseline: 'middle',
        });
        meter(g, rect(r.x + 16, r.y + 64, r.w - 32, 14), progress, LAMP.warm,
          `${station.job.remaining.toFixed(1)}s`);
      } else if (station.ready) {
        const label = dishName(station.ready.darkMatter ? 'Dark Matter' : station.ready.cuisine.name);
        drawText(g, label, r.x + r.w / 2, r.y + 50, {
          size: 15, font: GOTHIC, weight: 700,
          color: station.ready.darkMatter ? UI.crimson : UI.goldBright,
          align: 'center', baseline: 'middle',
        });
        drawText(g, t('station.take'), r.x + r.w / 2, r.y + 72, {
          size: 13, font: GOTHIC, color: alpha(UI.paperDim, 0.8),
          align: 'center', baseline: 'middle',
        });
      } else {
        drawText(g, t('station.empty'), r.x + r.w / 2, r.y + 58, {
          size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.55),
          align: 'center', baseline: 'middle',
        });
      }
    });
  }

  private renderTray(g: CanvasRenderingContext2D): void {
    const r = this.trayRect();
    panel(g, r, { alpha: 0.9 });
    if (this.hover === 'tray') strokeRoundRect(g, r.x, r.y, r.w, r.h, 12, UI.gold, 2);

    drawText(g, t('tray.title'), r.x + 16, r.y + 22, {
      size: 17, font: SERIF, weight: 700, color: alpha(UI.gold, 0.9), baseline: 'middle',
    });

    const dish = this.night.carrying;
    const drink = this.night.pouring;
    if (!dish) {
      drawText(g, t('tray.empty'), r.x + 16, r.y + 56, {
        size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.55), baseline: 'middle',
      });
      return;
    }

    drawText(g, dishName(dish.darkMatter ? 'Dark Matter' : dish.cuisine.name), r.x + 16, r.y + 48, {
      size: 16, font: GOTHIC, weight: 700,
      color: dish.darkMatter ? UI.crimson : UI.paper, baseline: 'middle',
    });
    drawText(g, drink ? beverageName(drink.name) : t('tray.pour'), r.x + 16, r.y + 72, {
      size: 14, font: GOTHIC,
      color: drink ? UI.jade : alpha(UI.goldBright, 0.9), baseline: 'middle',
    });
  }

  // ----------------------------------------------------------- cook panel

  private cookLayout() {
    const w = 1140;
    const h = 620;
    const p = rect(this.layout.width / 2 - w / 2, this.layout.height / 2 - h / 2 - 30, w, h);

    const recipes = this.night.state.menu.dishes.map((name, i) => ({
      name,
      r: rect(p.x + 26, p.y + 84 + i * 52, 350, 46),
    }));

    const pool = Object.values(INGREDIENTS)
      .filter((ing) => stockOf(this.night.state, ing.name) > 0)
      .slice(0, 24);
    const ingredients = pool.map((ing, i) => ({
      name: ing.name,
      r: rect(p.x + 404 + (i % 4) * 178, p.y + 84 + Math.floor(i / 4) * 52, 168, 46),
    }));

    return {
      panel: p,
      recipes,
      ingredients,
      confirm: rect(p.x + w - 260, p.y + h - 74, 230, 52),
    };
  }

  private renderCookPanel(g: CanvasRenderingContext2D, stationId: number): void {
    const station = this.night.stations[stationId];
    if (!station) return;
    const l = this.cookLayout();

    withState(g, () => {
      g.fillStyle = alpha('#05040a', 0.66);
      g.fillRect(0, 0, this.layout.width, this.layout.height);
    });
    panel(g, l.panel, { alpha: 0.97, radius: 16 });

    drawText(g, `${t('cook.title')}  ${kitchenwareName(station.kind)}`, l.panel.x + 26, l.panel.y + 40, {
      size: 27, font: SERIF, weight: 800, color: UI.goldBright, baseline: 'middle', letterSpacing: 3,
    });
    drawText(g, t('cook.close'), l.panel.x + l.panel.w - 26, l.panel.y + 40, {
      size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.6), align: 'right', baseline: 'middle',
    });

    drawText(g, t('cook.menu'), l.panel.x + 26, l.panel.y + 70, {
      size: 14, font: GOTHIC, color: alpha(UI.paperDim, 0.7), baseline: 'middle',
    });
    drawText(g, t('cook.addHint'), l.panel.x + 404, l.panel.y + 70, {
      size: 14, font: GOTHIC, color: alpha(UI.paperDim, 0.7), baseline: 'middle',
    });

    // Recipes.
    for (const { name, r } of l.recipes) {
      const dish = CUISINES[name];
      if (!dish) continue;
      const fits = dish.kitchenware === 'Any' || dish.kitchenware === station.kind;
      const stocked = canCook(this.night.state, name);
      const usable = fits && stocked;
      button(g, r, {
        label: dishName(name),
        sub: usable
          ? `${kitchenwareName(dish.kitchenware)} · ${dish.cookTime.toFixed(1)}s · ${money(dish.cost)}`
          : !fits
            ? t('cook.needsStation', { station: kitchenwareName(dish.kitchenware) })
            : t('cook.outOfStock'),
        hovered: this.hover === `recipe:${name}` || this.picked === name,
        disabled: !usable,
        accent: this.picked === name ? UI.goldBright : UI.gold,
        size: 18,
      });
    }

    // Ingredients, only once a recipe is chosen.
    const chosen = this.picked ? CUISINES[this.picked] : null;
    if (!chosen) {
      drawText(g, t('cook.pickFirst'), l.panel.x + 404, l.panel.y + 140, {
        size: 18, font: GOTHIC, color: alpha(UI.paperDim, 0.6), baseline: 'middle',
      });
      return;
    }

    const room = freeSlots(chosen);
    for (const { name, r } of l.ingredients) {
      const ing = INGREDIENTS[name];
      if (!ing) continue;
      const used = this.extras.filter((e) => e === name).length;
      const preview = previewAddition(resolveDishTags(chosen, this.extras.map((e) => INGREDIENTS[e]!), this.night.trendState), ing);
      const ruins = preview.ruins.length > 0;
      button(g, r, {
        label: used > 0 ? `${ingredientName(name)} ×${used}` : ingredientName(name),
        sub: ruins
          ? t('cook.ruins', { tags: preview.ruins.map((x) => tagName(String(x))).join('、') })
          : ing.props.map((x) => tagName(String(x))).join(' · '),
        hovered: this.hover === `ing:${name}` || used > 0,
        disabled: this.extras.length >= room && used === 0,
        accent: ruins ? UI.crimson : used > 0 ? UI.jade : UI.gold,
        size: 16,
      });
    }

    this.renderPreview(g, l.panel, chosen);
    button(g, l.confirm, {
      label: t('cook.confirm'),
      hovered: this.hover === 'confirm',
      accent: UI.goldBright,
      size: 21,
    });
  }

  /** The live tag readout — this is what teaches the tag system. */
  private renderPreview(g: CanvasRenderingContext2D, p: Rect, chosen: (typeof CUISINES)[string]): void {
    const added = this.extras.map((e) => INGREDIENTS[e]).filter(Boolean) as never[];
    const resolved = resolveDishTags(chosen, added, this.night.trendState);

    const y = p.y + p.h - 190;
    const heading = `${dishName(chosen.name)}  —  ${t('cook.added', { count: this.extras.length, max: freeSlots(chosen) })}`;
    drawText(g, heading, p.x + 26, y, {
      size: 19, font: SERIF, weight: 700, color: UI.paper, baseline: 'middle',
    });

    if (resolved.darkMatter) {
      const spoiled = resolved.violated.map((x) => tagName(String(x))).join('、');
      drawText(g, `⚠ ${t('cook.darkMatter', { tags: spoiled })}`, p.x + 26, y + 34, {
        size: 19, font: GOTHIC, weight: 700, color: UI.crimson, baseline: 'middle',
      });
      return;
    }

    const chips: Array<{ text: string; kind: ChipKind }> = [];
    for (const tag of resolved.tags) {
      chips.push({
        text: tagName(String(tag)),
        kind: resolved.addedTags.has(tag as CuisineTag) ? 'added' : 'innate',
      });
    }
    for (const tag of resolved.struck) chips.push({ text: tagName(String(tag)), kind: 'struck' });
    for (const tag of chosen.xprops) {
      if (!resolved.tags.has(tag)) chips.push({ text: `✕ ${tagName(String(tag))}`, kind: 'forbidden' });
    }
    chipRow(g, chips, p.x + 26, y + 20, p.w - 300, 15);
  }

  // ---------------------------------------------------------- drink panel

  private drinkLayout() {
    const w = 720;
    const h = 420;
    const p = rect(this.layout.width / 2 - w / 2, this.layout.height / 2 - h / 2, w, h);
    const drinks = this.night.state.menu.drinks.map((name, i) => ({
      name,
      r: rect(p.x + 26 + (i % 2) * 336, p.y + 84 + Math.floor(i / 2) * 62, 320, 54),
    }));
    return { panel: p, drinks };
  }

  private renderDrinkPanel(g: CanvasRenderingContext2D): void {
    const l = this.drinkLayout();
    withState(g, () => {
      g.fillStyle = alpha('#05040a', 0.66);
      g.fillRect(0, 0, this.layout.width, this.layout.height);
    });
    panel(g, l.panel, { alpha: 0.97, radius: 16 });

    drawText(g, t('drinks.title'), l.panel.x + 26, l.panel.y + 42, {
      size: 27, font: SERIF, weight: 800, color: UI.goldBright, baseline: 'middle', letterSpacing: 3,
    });

    for (const { name, r } of l.drinks) {
      const drink = BEVERAGES[name];
      if (!drink) continue;
      const stock = stockOf(this.night.state, name);
      button(g, r, {
        label: `${beverageName(name)}  ×${stock}`,
        sub: drink.props.slice(0, 4).map((x) => tagName(String(x))).join(' · '),
        hovered: this.hover === `drink:${name}`,
        disabled: stock <= 0,
        accent: UI.jade,
        size: 18,
      });
    }
  }

  private renderToast(g: CanvasRenderingContext2D): void {
    if (!this.toast) return;
    const fade = easeOutCubic(clamp01(this.toast.left / 0.4));
    withState(g, () => {
      g.globalAlpha = fade;
      const w = 460;
      const r = rect(this.layout.width / 2 - w / 2, this.layout.height - 220, w, 50);
      fillRoundRect(g, r.x, r.y, r.w, r.h, 10, alpha('#1a1119', 0.94));
      strokeRoundRect(g, r.x, r.y, r.w, r.h, 10, alpha(UI.crimson, 0.7), 1.6);
      drawText(g, this.toast?.text ?? '', r.x + r.w / 2, r.y + r.h / 2, {
        size: 19, font: GOTHIC, color: UI.paper, align: 'center', baseline: 'middle',
      });
    });
  }
}


export type { Station };
