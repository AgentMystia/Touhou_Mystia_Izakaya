/**
 * Night service — the core loop, played on foot.
 *
 * Mystia walks the shop floor on WASD. The stations line the back wall, the
 * drink shelf stands at one end and guests take the tables in front. Cooking,
 * pouring and serving all happen where she is standing, so the night is a
 * routing problem as much as a menu one: press E at a station to start a dish,
 * come back for it, top it off at the shelf, then either walk it over or throw
 * it across the room with the right mouse button.
 */

import { BEVERAGES, CUISINES, INGREDIENTS, type CuisineTag } from '../data';
import { MYSTIA } from '../art/cast';
import { LAMP, RATING_COLORS, UI, alpha } from '../art/palette';
import { characterRim, drawCharacter } from '../art/characters';
import {
  drawClutter,
  drawCup,
  drawInteriorBack,
  drawInteriorLights,
  drawPlate,
  drawShelf,
  drawStation,
  drawStool,
  drawTable,
} from '../art/interior';
import {
  BODY_RADIUS,
  FLOOR,
  type FloorLayout,
  type FloorPoint,
  type SeatSlot,
  type StationSlot,
  buildLayout,
  depthScale,
  distance,
  moveWithCollision,
  nearestByApproach,
  toScreen,
} from '../sim/floor';
import { EMITTERS, ParticleSystem } from '../gfx/particles';
import { GOTHIC, SERIF, drawText, wrapText } from '../gfx/text';
import { fillRoundRect, groundShadow, strokeRoundRect, withState } from '../gfx/vector';
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
import { NIGHT_SECONDS, NightService, type Guest, type Plate, type Station } from '../sim/night';
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

/** Rig height in screen units at mid-depth. */
const GUEST_HEIGHT = 244;
const MYSTIA_HEIGHT = 268;
/** Order bubbles never reach below this line, so the stations stay readable. */
const BUBBLE_FLOOR = 438;

/** Floor units per second. */
const WALK_SPEED = 340;
/** Floor units per full stride, i.e. how fast the walk cycle turns over. */
const STRIDE = 74;
/** How far a plate can be thrown, in floor units. */
const THROW_RANGE = 780;
/** Seconds a thrown plate spends in the air, per 400 floor units. */
const THROW_SECONDS_PER_UNIT = 0.8 / 400;

type Panel = { kind: 'none' } | { kind: 'cook'; station: number } | { kind: 'drinks' };

interface FlyingPlate {
  plate: Plate;
  from: FloorPoint;
  to: FloorPoint;
  seat: number;
  elapsed: number;
  duration: number;
  spin: number;
}

/** What pressing E right now would do. */
type Action =
  | { kind: 'cook'; station: StationSlot }
  | { kind: 'collect'; station: StationSlot }
  | { kind: 'busy'; station: StationSlot }
  | { kind: 'pour' }
  | { kind: 'serve'; seat: SeatSlot }
  | null;

export class ServiceScene implements Scene {
  readonly name = 'service';

  private width = 1920;
  private height = 1080;
  private layout: FloorLayout;
  private readonly particles = new ParticleSystem(1600);
  private elapsed = 0;

  /** Mystia on the floor. */
  private pos: FloorPoint;
  private facing = 1;
  private walkPhase = 0;
  private moving = false;

  private open: Panel = { kind: 'none' };
  /** Recipe chosen inside the cook panel, before ingredients are added. */
  private picked: string | null = null;
  private extras: string[] = [];
  private toast: { text: string; left: number } | null = null;
  private hover: string | null = null;

  /** Seat currently under the throwing reticle. */
  private aim = 0;
  private readonly flights: FlyingPlate[] = [];

  constructor(
    private readonly night: NightService,
    private readonly onFinished: () => void,
  ) {
    this.layout = buildLayout(
      this.night.stations.map((s) => s.kind),
      this.night.seats,
    );
    this.pos = { ...this.layout.spawn };
  }

  enter(ctx: SceneContext): void {
    this.width = ctx.renderer.width;
    this.height = ctx.renderer.height;
  }

  /** Exposed for the scripted end-to-end test. */
  get simulation(): NightService {
    return this.night;
  }

  /** Exposed so the harness can drive Mystia without synthesising key events. */
  walkTo(x: number, y: number): void {
    this.pos = { x, y };
  }

  /** Plates currently in the air, for the scripted test. */
  get inFlight(): number {
    return this.flights.length;
  }

  /** The seat the throwing reticle is on. */
  get aimedAt(): number {
    return this.aim;
  }

  /** Where Mystia is standing, for the scripted test. */
  get where(): FloorPoint {
    return { ...this.pos };
  }

  /** The spot you have to stand on to use a station, the shelf or a seat. */
  approachOf(what: 'station' | 'seat' | 'shelf', index = 0): FloorPoint {
    if (what === 'shelf') return { ...this.layout.shelf.approach };
    const list = what === 'station' ? this.layout.stations : this.layout.seats;
    return { ...(list[index]?.approach ?? this.layout.spawn) };
  }

  // --------------------------------------------------------------- update

  update(ctx: SceneContext, dt: number): void {
    this.elapsed += dt;
    this.night.update(dt);
    this.particles.update(dt);
    this.updateFlights(dt);

    if (this.toast) {
      this.toast.left -= dt;
      if (this.toast.left <= 0) this.toast = null;
    }

    // Embers off whichever stations are lit.
    for (const station of this.night.stations) {
      if (!station.job) continue;
      const slot = this.layout.stations[station.id];
      if (!slot || Math.random() > dt * 5) continue;
      const s = toScreen({ x: slot.x + slot.w / 2, y: slot.y + slot.h });
      this.particles.emit(EMITTERS.ember, s.x + (Math.random() - 0.5) * 60, s.y - 108, 1);
    }

    const modal = this.open.kind !== 'none';
    if (!modal) this.move(ctx, dt);
    this.handleInput(ctx);

    if (this.night.finished && this.flights.length === 0) this.onFinished();
  }

  private move(ctx: SceneContext, dt: number): void {
    const held = ctx.input;
    let dx = 0;
    let dy = 0;
    if (held.isDown('KeyA') || held.isDown('ArrowLeft')) dx -= 1;
    if (held.isDown('KeyD') || held.isDown('ArrowRight')) dx += 1;
    if (held.isDown('KeyW') || held.isDown('ArrowUp')) dy -= 1;
    if (held.isDown('KeyS') || held.isDown('ArrowDown')) dy += 1;

    this.moving = dx !== 0 || dy !== 0;
    if (!this.moving) {
      // Ease the cycle back to a standing pose rather than snapping.
      this.walkPhase += dt * 0.4;
      return;
    }

    const len = Math.hypot(dx, dy) || 1;
    const step = WALK_SPEED * dt;
    const before = this.pos;
    this.pos = moveWithCollision(before, (dx / len) * step, (dy / len) * step, this.layout);
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.walkPhase += distance(before, this.pos) / STRIDE;
  }

  private handleInput(ctx: SceneContext): void {
    this.hover = null;

    if (ctx.input.anyPressed('Escape')) {
      if (this.open.kind !== 'none') {
        this.open = { kind: 'none' };
        this.picked = null;
        this.extras = [];
      }
      return;
    }

    if (this.open.kind === 'cook') {
      this.cookPanelInput(ctx, this.open.station);
      return;
    }
    if (this.open.kind === 'drinks') {
      this.drinkPanelInput(ctx);
      return;
    }

    // Aiming: the reticle follows the pointer, Q/E nudge it between seats.
    const targets = this.throwTargets();
    if (targets.length) {
      if (!targets.some((s) => s.index === this.aim)) this.aim = targets[0]?.index ?? 0;
      const pointed = this.seatUnderPointer(ctx, targets);
      if (pointed !== null) this.aim = pointed;
      if (ctx.input.anyPressed('KeyQ')) this.aim = this.cycleAim(targets, 1);
      if (ctx.input.wheel !== 0) this.aim = this.cycleAim(targets, ctx.input.wheel > 0 ? 1 : -1);
      if (ctx.input.anyPressed('KeyK') || ctx.input.rightPressed) this.throwAt(this.aim);
    } else if (ctx.input.anyPressed('KeyK') || ctx.input.rightPressed) {
      this.say(this.night.carrying ? t('msg.needDrink') : t('msg.nothingToServe'));
    }

    if (ctx.input.anyPressed('KeyE', 'Space', 'Enter')) this.act(this.contextAction());

    // Clicking on the floor is a fallback for the same context action.
    if (ctx.input.pressed) {
      const p = ctx.input.pointer;
      if (p.y > FLOOR.originY - 260) this.act(this.contextAction());
    }
  }

  private cycleAim(targets: SeatSlot[], dir: number): number {
    const at = targets.findIndex((s) => s.index === this.aim);
    const next = targets[(at + dir + targets.length * 2) % targets.length];
    return next?.index ?? this.aim;
  }

  /** Seats a full plate could currently be thrown to. */
  private throwTargets(): SeatSlot[] {
    if (!this.night.carrying || !this.night.pouring) return [];
    return this.layout.seats.filter((slot) => {
      const guest = this.night.guestAt(slot.index);
      return !!guest && guest.state === 'waiting' && distance(this.pos, slot.seat) <= THROW_RANGE;
    });
  }

  private seatUnderPointer(ctx: SceneContext, targets: SeatSlot[]): number | null {
    const p = ctx.input.pointer;
    if (p.x < 0) return null;
    let best: number | null = null;
    let bestD = 210;
    for (const slot of targets) {
      const s = toScreen(slot.seat);
      const d = Math.hypot(p.x - s.x, p.y - (s.y - 90));
      if (d < bestD) {
        bestD = d;
        best = slot.index;
      }
    }
    return best;
  }

  /** What E does from where Mystia is standing, in priority order. */
  private contextAction(): Action {
    const seat = nearestByApproach(this.pos, this.layout.seats);
    if (seat) {
      const guest = this.night.guestAt(seat.index);
      if (guest?.state === 'waiting' && this.night.carrying && this.night.pouring) {
        return { kind: 'serve', seat };
      }
    }

    const station = nearestByApproach(this.pos, this.layout.stations);
    if (station) {
      const sim = this.night.stations[station.index];
      if (sim?.ready) return { kind: 'collect', station };
      if (sim?.job) return { kind: 'busy', station };
      if (sim) return { kind: 'cook', station };
    }

    if (distance(this.pos, this.layout.shelf.approach) < 96) return { kind: 'pour' };
    if (seat) {
      const guest = this.night.guestAt(seat.index);
      if (guest?.state === 'waiting') return { kind: 'serve', seat };
    }
    return null;
  }

  private act(action: Action): void {
    if (!action) return;
    switch (action.kind) {
      case 'cook':
        this.open = { kind: 'cook', station: action.station.index };
        this.picked = null;
        this.extras = [];
        break;
      case 'busy':
        this.say(t('station.busy'));
        break;
      case 'collect': {
        if (this.night.carrying) {
          this.say(t('msg.handsFull'));
          break;
        }
        if (this.night.collect(action.station.index)) {
          const s = toScreen({ x: action.station.x + action.station.w / 2, y: action.station.y });
          this.burst(s.x, s.y - 60, 'sparkle', 9);
        }
        break;
      }
      case 'pour':
        if (!this.night.carrying) this.say(t('msg.cookFirst'));
        else if (this.night.pouring) this.say(t('msg.alreadyPoured'));
        else this.open = { kind: 'drinks' };
        break;
      case 'serve': {
        if (!this.night.carrying) this.say(t('msg.nothingToServe'));
        else if (!this.night.pouring) this.say(t('msg.needDrink'));
        else this.settle(action.seat.index, this.night.serve(action.seat.index));
        break;
      }
    }
  }

  private throwAt(seatIndex: number): void {
    const slot = this.layout.seats[seatIndex];
    const plate = slot ? this.night.takePlate() : null;
    if (!slot || !plate) return;
    const span = distance(this.pos, slot.seat);
    this.flights.push({
      plate,
      from: { x: this.pos.x, y: this.pos.y - 8 },
      to: { ...slot.tableTop },
      seat: seatIndex,
      elapsed: 0,
      duration: Math.max(0.45, span * THROW_SECONDS_PER_UNIT),
      spin: this.pos.x <= slot.seat.x ? 1 : -1,
    });
    const s = toScreen(this.pos);
    this.burst(s.x, s.y - 150, 'sparkle', 6);
  }

  private updateFlights(dt: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const flight = this.flights[i] as FlyingPlate;
      flight.elapsed += dt;
      if (flight.elapsed < flight.duration) continue;
      this.flights.splice(i, 1);
      const event = this.night.deliver(flight.seat, flight.plate);
      if (event) this.settle(flight.seat, event);
      else {
        // Nobody there any more — the plate hits the floor.
        const s = toScreen(flight.to);
        this.burst(s.x, s.y - 40, 'sparkle', 6, UI.crimson);
        this.say(t('msg.missed'));
      }
    }
  }

  private settle(seatIndex: number, event: ReturnType<NightService['serve']>): void {
    if (!event?.rating) return;
    const slot = this.layout.seats[seatIndex];
    if (!slot) return;
    const s = toScreen(slot.seat);
    this.burst(s.x, s.y - 170, event.rating === 'pink' ? 'sparkle' : 'coin', 20, RATING_COLORS[event.rating]);
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
        if (click) this.startCooking(stationId);
      }
      if (ctx.input.anyPressed('KeyE', 'Enter')) this.startCooking(stationId);
    }
  }

  private startCooking(stationId: number): void {
    if (!this.picked) return;
    const error = this.night.startCooking(stationId, this.picked, this.extras);
    if (error) {
      this.say(error);
      return;
    }
    this.open = { kind: 'none' };
    this.picked = null;
    this.extras = [];
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
    const time = this.elapsed;

    drawInteriorBack(g, this.width, this.height, time);

    this.renderFloorMarkers(g);

    // Everything on the floor is y-sorted by where it touches the boards, so
    // walking in front of a table actually puts Mystia in front of it.
    const focus = this.contextAction();
    const draws: Array<{ depth: number; paint: () => void }> = [];

    for (const slot of this.layout.stations) {
      const sim = this.night.stations[slot.index];
      draws.push({
        depth: slot.y + slot.h,
        paint: () =>
          drawStation(g, slot, time, {
            busy: !!sim?.job,
            ready: !!sim?.ready,
            ruined: sim?.ready?.darkMatter ?? false,
            progress: sim?.job ? 1 - sim.job.remaining / sim.job.total : 0,
            focus:
              (focus?.kind === 'cook' || focus?.kind === 'collect' || focus?.kind === 'busy') &&
              focus.station.index === slot.index,
          }),
      });
    }

    draws.push({
      depth: this.layout.shelf.y + this.layout.shelf.h,
      paint: () => drawShelf(g, this.layout.shelf, focus?.kind === 'pour'),
    });

    for (const slot of this.layout.seats) {
      const guest = this.night.guestAt(slot.index);
      if (guest) {
        draws.push({ depth: slot.seat.y, paint: () => this.renderGuest(g, light, guest, slot, time) });
      } else {
        draws.push({
          depth: slot.seat.y,
          paint: () => {
            const s = toScreen(slot.seat);
            drawStool(g, s.x, s.y + 6, depthScale(slot.seat.y));
          },
        });
      }
      const served = guest?.verdict && guest.verdict.paid > 0 ? { ruined: false } : null;
      draws.push({ depth: slot.y + slot.h, paint: () => drawTable(g, slot, served, time) });
    }

    for (const junk of this.layout.clutter) {
      draws.push({ depth: junk.y + junk.h, paint: () => drawClutter(g, junk) });
    }

    draws.push({ depth: this.pos.y, paint: () => this.renderMystia(g, light, time) });

    draws.sort((a, b) => a.depth - b.depth);
    for (const d of draws) d.paint();

    this.renderFlights(g);
    this.particles.render(g, false);

    drawInteriorLights(light, this.layout, this.width, time);
    this.particles.render(light, true);

    // Interface goes on the UI layer so bloom does not wash it out.
    const u = ctx.renderer.ui;
    this.renderOrders(u);
    this.renderAim(u);
    this.renderPrompt(u);
    this.renderHud(u);
    this.renderTray(u);

    if (this.open.kind === 'cook') this.renderCookPanel(u, this.open.station);
    if (this.open.kind === 'drinks') this.renderDrinkPanel(u);
    this.renderToast(u);
  }

  /** Faint marks on the boards showing where each action happens. */
  private renderFloorMarkers(g: CanvasRenderingContext2D): void {
    const spots: FloorPoint[] = [
      ...this.layout.stations.map((s) => s.approach),
      this.layout.shelf.approach,
      ...this.layout.seats.map((s) => s.approach),
    ];
    withState(g, () => {
      g.globalAlpha = 0.11;
      for (const spot of spots) {
        const s = toScreen(spot);
        const near = distance(this.pos, spot) < 96;
        g.strokeStyle = near ? '#ffd98a' : '#f0d0a0';
        g.globalAlpha = near ? 0.42 : 0.16;
        g.lineWidth = 2;
        g.setLineDash([9, 8]);
        g.beginPath();
        g.ellipse(s.x, s.y, 40, 13, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.setLineDash([]);
    });
  }

  private renderGuest(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    guest: Guest,
    slot: SeatSlot,
    time: number,
  ): void {
    const s = toScreen(slot.seat);
    const scale = depthScale(slot.seat.y);
    const height = GUEST_HEIGHT * scale;
    const mood = guest.verdict
      ? { black: 0.05, purple: 0.25, green: 0.55, orange: 0.85, pink: 1 }[guest.verdict.rating]
      : 0.32 + guest.patience * 0.4;
    const leaving = guest.state === 'leaving' ? 1 - clamp01(guest.reactionLeft / 2.4) : 0;

    drawStool(g, s.x, s.y + 6, scale);
    withState(g, () => {
      g.globalAlpha = 1 - leaving * 0.9;
      g.translate(0, leaving * 34);
      drawCharacter(g, guest.spec, s.x, s.y, { time, height, mood });
    });
    if (leaving < 0.4) characterRim(light, guest.spec, s.x, s.y, { time, height });
  }

  private renderMystia(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, time: number): void {
    const s = toScreen(this.pos);
    const scale = depthScale(this.pos.y);
    const height = MYSTIA_HEIGHT * scale;
    const carrying = !!this.night.carrying;

    groundShadow(g, s.x, s.y + 2, BODY_RADIUS * 1.5 * scale, 12 * scale, 0.5);
    drawCharacter(g, MYSTIA, s.x, s.y, {
      time,
      height,
      mood: 0.8,
      flip: this.facing < 0,
      rimFrom: -this.facing,
      carrying,
      ...(this.moving ? { walk: this.walkPhase } : {}),
    });
    characterRim(light, MYSTIA, s.x, s.y, { time, height, flip: this.facing < 0 });

    // What she is holding rides in front of her hands.
    if (carrying) {
      const bob = Math.sin(this.walkPhase * Math.PI * 2) * (this.moving ? 2.6 : 0.8);
      const hands = s.y - height * 0.33 + bob;
      drawPlate(g, s.x + this.facing * 14, hands, 0.95 * scale, this.night.carrying?.darkMatter ?? false);
      if (this.night.pouring) drawCup(g, s.x - this.facing * 22, hands - 2, 1 * scale);
    }
  }

  private renderFlights(g: CanvasRenderingContext2D): void {
    for (const flight of this.flights) {
      const p = clamp01(flight.elapsed / flight.duration);
      const x = flight.from.x + (flight.to.x - flight.from.x) * p;
      const y = flight.from.y + (flight.to.y - flight.from.y) * p;
      const s = toScreen({ x, y });
      const arc = Math.sin(p * Math.PI) * (170 + distance(flight.from, flight.to) * 0.12);
      // A shadow on the boards sells the height.
      groundShadow(g, s.x, s.y, 18 * (1 - Math.sin(p * Math.PI) * 0.4), 6, 0.32);
      withState(g, () => {
        g.translate(s.x, s.y - arc);
        g.rotate(flight.spin * p * Math.PI * 2);
        drawPlate(g, 0, 0, depthScale(y), flight.plate.dish.darkMatter);
      });
      withState(g, () => {
        // A short warm trail.
        g.globalAlpha = 0.22;
        g.strokeStyle = LAMP.core;
        g.lineWidth = 3;
        g.beginPath();
        for (let k = 0; k <= 8; k++) {
          const q = Math.max(0, p - k * 0.02);
          const qs = toScreen({
            x: flight.from.x + (flight.to.x - flight.from.x) * q,
            y: flight.from.y + (flight.to.y - flight.from.y) * q,
          });
          const qa = Math.sin(q * Math.PI) * (170 + distance(flight.from, flight.to) * 0.12);
          if (k === 0) g.moveTo(qs.x, qs.y - qa);
          else g.lineTo(qs.x, qs.y - qa);
        }
        g.stroke();
      });
    }
  }

  // ------------------------------------------------------------------- ui

  private renderOrders(g: CanvasRenderingContext2D): void {
    for (const slot of this.layout.seats) {
      const guest = this.night.guestAt(slot.index);
      if (!guest) continue;
      const s = toScreen(slot.seat);
      const top = s.y - GUEST_HEIGHT * depthScale(slot.seat.y) - 16;

      if (guest.verdict) {
        ratingCard(g, s.x, top - 14, guest.verdict.rating, guest.verdict.note);
        if (guest.verdict.paid > 0) {
          drawText(g, `+${money(guest.verdict.paid + guest.verdict.tip)}`, s.x, top - 96, {
            size: 25, font: GOTHIC, weight: 800, color: UI.goldBright,
            align: 'center', baseline: 'bottom',
            shadow: 'rgba(0,0,0,0.8)', shadowBlur: 8,
          });
        }
        continue;
      }
      this.renderOrderBubble(g, guest, s.x, top);
    }
  }

  private renderOrderBubble(g: CanvasRenderingContext2D, guest: Guest, cx: number, bottom: number): void {
    const wanted: Array<{ text: string; kind: ChipKind }> = [];
    if (guest.order.dishTag) wanted.push({ text: tagName(String(guest.order.dishTag)), kind: 'wanted' });
    if (guest.order.drinkTag) wanted.push({ text: tagName(String(guest.order.drinkTag)), kind: 'wanted' });

    const w = 262;
    const lines = wrapText(g, guest.request, w - 28, { size: 16, font: GOTHIC });
    const h = 44 + lines.length * 21 + (wanted.length ? 34 : 0);
    // Clamp so a guest near either edge still gets a fully visible bubble, and
    // keep the bubble clear of the station tops along the back wall — a ticket
    // covering a cooking pot is the one overlap that costs the player money.
    const x = Math.max(14, Math.min(cx - w / 2, this.width - w - 14));
    const top = Math.max(12, Math.min(bottom, BUBBLE_FLOOR) - h);
    const r = rect(x, top, w, h);

    // When the bubble floats free of the guest, run a leader down to them.
    if (bottom - (top + h) > 20) {
      withState(g, () => {
        g.globalAlpha = 0.5;
        g.strokeStyle = UI.paperDim;
        g.lineWidth = 2;
        g.setLineDash([4, 6]);
        g.beginPath();
        g.moveTo(cx, top + h + 14);
        g.lineTo(cx, bottom + 6);
        g.stroke();
      });
    }

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
    if (wanted.length) chipRow(g, wanted, r.x + 14, r.y + h - 32, w - 28, 14);

    // Patience doubles as the bubble's urgency cue.
    const patience = guest.patience;
    const color = patience > 0.5 ? UI.jade : patience > 0.25 ? UI.gold : UI.crimson;
    meter(g, rect(r.x + 14, r.y + h - 9, r.w - 28, 5), patience, color);
  }

  /** The throwing reticle over the aimed seat. */
  private renderAim(g: CanvasRenderingContext2D): void {
    const targets = this.throwTargets();
    if (!targets.length) return;
    const slot = targets.find((s) => s.index === this.aim) ?? targets[0];
    if (!slot) return;
    const s = toScreen(slot.seat);
    const y = s.y - GUEST_HEIGHT * depthScale(slot.seat.y) * 0.92;
    const pulse = 1 + 0.06 * Math.sin(this.elapsed * 6);

    withState(g, () => {
      g.translate(s.x, y);
      g.scale(pulse, pulse);
      // A dark pass first, so the reticle reads over a bright character too.
      for (const [color, width, a] of [
        ['#120b10', 7, 0.55],
        [UI.goldBright, 3.2, 1],
      ] as const) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.globalAlpha = a;
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
          g.moveTo(Math.cos(ang) * 30, Math.sin(ang) * 30);
          g.lineTo(Math.cos(ang) * 48, Math.sin(ang) * 48);
        }
        g.arc(0, 0, 38, 0, Math.PI * 2);
        g.stroke();
      }
    });

    const hint = t('throw.hint');
    g.font = '700 15px "Zen Maru Gothic", sans-serif';
    const hw = g.measureText(hint).width + 24;
    fillRoundRect(g, s.x - hw / 2, y + 54, hw, 28, 14, alpha('#160e13', 0.9));
    drawText(g, hint, s.x, y + 68, {
      size: 15, font: GOTHIC, weight: 700, color: UI.goldBright,
      align: 'center', baseline: 'middle',
    });
  }

  /** The `E` prompt floating over Mystia's head. */
  private renderPrompt(g: CanvasRenderingContext2D): void {
    const action = this.contextAction();
    if (!action) return;
    const label = {
      cook: t('prompt.cook'),
      collect: t('prompt.collect'),
      busy: t('prompt.busy'),
      pour: t('prompt.pour'),
      serve: t('prompt.serve'),
    }[action.kind];

    const s = toScreen(this.pos);
    const y = s.y - MYSTIA_HEIGHT * depthScale(this.pos.y) - 30;
    g.font = '700 17px "Zen Maru Gothic", sans-serif';
    const w = g.measureText(label).width + 62;
    const r = rect(s.x - w / 2, y - 18, w, 36);
    fillRoundRect(g, r.x, r.y, r.w, r.h, 18, alpha('#160e13', 0.86));
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 18, alpha(UI.gold, 0.7), 1.6);

    fillRoundRect(g, r.x + 7, r.y + 7, 22, 22, 6, alpha(UI.goldBright, 0.9));
    drawText(g, 'E', r.x + 18, r.y + 18, {
      size: 15, font: GOTHIC, weight: 800, color: '#241a16', align: 'center', baseline: 'middle',
    });
    drawText(g, label, r.x + 38, r.y + 18, {
      size: 17, font: GOTHIC, weight: 700, color: UI.paper, baseline: 'middle',
    });
  }

  private renderHud(g: CanvasRenderingContext2D): void {
    const bar = rect(24, 20, 470, 66);
    panel(g, bar, { alpha: 0.82 });

    const closing = this.night.timeLeft < 30;
    stat(g, '时', timer(this.night.timeLeft), bar.x + 20, bar.y + 33, closing ? UI.crimson : UI.paper);
    stat(g, '钱', money(this.night.revenue + this.night.tips), bar.x + 172, bar.y + 33, UI.goldBright);
    stat(g, '连', `${this.night.combo}`, bar.x + 358, bar.y + 33,
      this.night.combo > 0 ? UI.jade : UI.paperDim);

    meter(
      g,
      rect(bar.x + 14, bar.y + bar.h - 12, bar.w - 28, 5),
      1 - this.night.timeLeft / NIGHT_SECONDS,
      closing ? UI.crimson : UI.gold,
    );

    // Satisfaction, on the right.
    const sat = rect(this.width - 300, 20, 276, 66);
    panel(g, sat, { alpha: 0.82 });
    drawText(g, t('hud.reputation'), sat.x + 18, sat.y + 22, {
      size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.85), baseline: 'middle',
    });
    meter(g, rect(sat.x + 18, sat.y + 36, sat.w - 36, 16), this.night.satisfaction / 100,
      this.night.satisfaction > 60 ? UI.jade : this.night.satisfaction > 30 ? UI.gold : UI.crimson,
      `${Math.round(this.night.satisfaction)}`);

    const trends = this.night.trendState;
    if (trends.popular || trends.unpopular) {
      const chips: Array<{ text: string; kind: ChipKind }> = [];
      if (trends.popular) chips.push({ text: `▲ ${tagName(String(trends.popular))}`, kind: 'trend' });
      if (trends.unpopular) chips.push({ text: `▼ ${tagName(String(trends.unpopular))}`, kind: 'struck' });
      chipRow(g, chips, sat.x, sat.y + sat.h + 10, sat.w, 14);
    }

    // Controls, bottom left — this is a game you have to be taught to walk in.
    withState(g, () => {
      g.globalAlpha = 0.62;
      drawText(g, t('hud.controls'), 30, this.height - 26, {
        size: 15, font: GOTHIC, color: UI.paperDim, baseline: 'middle',
      });
    });
  }

  /** What Mystia is carrying, shown bottom-right as a tray card. */
  private renderTray(g: CanvasRenderingContext2D): void {
    const r = rect(this.width - 330, this.height - 128, 300, 100);
    const dish = this.night.carrying;
    const drink = this.night.pouring;
    panel(g, r, { alpha: dish ? 0.9 : 0.6 });

    drawText(g, t('tray.title'), r.x + 18, r.y + 24, {
      size: 17, font: SERIF, weight: 700, color: alpha(UI.gold, 0.9), baseline: 'middle',
    });

    if (!dish) {
      drawText(g, t('tray.empty'), r.x + 18, r.y + 60, {
        size: 15, font: GOTHIC, color: alpha(UI.paperDim, 0.55), baseline: 'middle',
      });
      return;
    }

    drawPlate(g, r.x + r.w - 44, r.y + 52, 1.15, dish.darkMatter);
    if (drink) drawCup(g, r.x + r.w - 88, r.y + 58, 1.1);

    drawText(g, dishName(dish.darkMatter ? 'Dark Matter' : dish.cuisine.name), r.x + 18, r.y + 52, {
      size: 17, font: GOTHIC, weight: 700,
      color: dish.darkMatter ? UI.crimson : UI.paper, baseline: 'middle',
    });
    drawText(g, drink ? beverageName(drink.name) : t('tray.pour'), r.x + 18, r.y + 78, {
      size: 15, font: GOTHIC,
      color: drink ? UI.jade : alpha(UI.goldBright, 0.9), baseline: 'middle',
    });
  }

  // ----------------------------------------------------------- cook panel

  private cookLayout() {
    const w = 1140;
    const h = 620;
    const p = rect(this.width / 2 - w / 2, this.height / 2 - h / 2 - 30, w, h);

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
      g.fillRect(0, 0, this.width, this.height);
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
      const preview = previewAddition(
        resolveDishTags(chosen, this.extras.map((e) => INGREDIENTS[e]!), this.night.trendState),
        ing,
      );
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
    const p = rect(this.width / 2 - w / 2, this.height / 2 - h / 2, w, h);
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
      g.fillRect(0, 0, this.width, this.height);
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
      const r = rect(this.width / 2 - w / 2, this.height - 210, w, 50);
      fillRoundRect(g, r.x, r.y, r.w, r.h, 10, alpha('#1a1119', 0.94));
      strokeRoundRect(g, r.x, r.y, r.w, r.h, 10, alpha(UI.crimson, 0.7), 1.6);
      drawText(g, this.toast?.text ?? '', r.x + r.w / 2, r.y + r.h / 2, {
        size: 19, font: GOTHIC, color: UI.paper, align: 'center', baseline: 'middle',
      });
    });
  }
}

export type { Station };
