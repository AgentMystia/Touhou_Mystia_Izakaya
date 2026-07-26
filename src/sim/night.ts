/**
 * The night's service, as a pure-ish simulation: guests arrive, order, wait,
 * get served and pay. The scene layer reads this state and draws it; it does
 * not own any of the rules.
 */

import {
  BEVERAGES,
  CUISINES,
  INGREDIENTS,
  type Beverage,
  type BeverageTag,
  type CommonCustomer,
  type Cuisine,
  type CuisineTag,
  type Ingredient,
  type RareCustomer,
  commonsAt,
  raresAt,
} from '../data';
import {
  type Order,
  type Rating,
  breaksCombo,
  computeBill,
  rateCommon,
  rateRare,
  resolveDishTags,
  satisfactionDelta,
  settleCommon,
  settleRare,
  computeTip,
  currentTrends,
  type ResolvedDish,
  type TrendState,
} from '../rules';
import { type Rand, mulberry32, hashSeed, pick, randInt } from '../core/rng';
import { specFor } from '../art/cast';
import { beverageName, customerName, dishName, t, tagName } from '../i18n';
import type { CharacterSpec } from '../art/characters';
import {
  type GameState,
  canCook,
  capsFor,
  consumeRecipe,
  gainExp,
  recordRating,
  takeStock,
} from './state';

/** Seconds of real time one night lasts. */
export const NIGHT_SECONDS = 210;
/** How long a guest waits before giving up. */
const PATIENCE_SECONDS = 62;

export type GuestKind = 'common' | 'rare';

export interface Guest {
  id: number;
  kind: GuestKind;
  name: string;
  shortName: string;
  spec: CharacterSpec;
  seat: number;
  order: Order;
  /** Human-readable order line shown in the bubble. */
  request: string;
  /** Rares announce a purse; commons always pay. */
  budget: number | null;
  patience: number;
  arrivedAt: number;
  state: 'waiting' | 'leaving' | 'gone';
  verdict?: { rating: Rating; paid: number; tip: number; note: string };
  /** Seconds left of the post-serve reaction before they get up. */
  reactionLeft: number;
}

export interface CookJob {
  cuisine: Cuisine;
  added: Ingredient[];
  remaining: number;
  total: number;
}

export interface Station {
  id: number;
  kind: string;
  job: CookJob | null;
  /** A finished dish waiting to be picked up. */
  ready: ResolvedDish | null;
}

export interface Plate {
  dish: ResolvedDish;
  drink: Beverage;
}

export interface NightEvent {
  kind: 'served' | 'left' | 'arrived' | 'cooked' | 'ruined';
  at: number;
  text: string;
  rating?: Rating;
  x?: number;
  y?: number;
}

export class NightService {
  readonly seats: number;
  readonly stations: Station[] = [];
  readonly guests: Guest[] = [];
  readonly events: NightEvent[] = [];

  /** Seconds remaining in the night. */
  timeLeft = NIGHT_SECONDS;
  revenue = 0;
  tips = 0;
  combo = 0;
  bestCombo = 0;
  satisfaction = 50;
  /** A dish picked up from a station, waiting to be paired with a drink. */
  carrying: ResolvedDish | null = null;
  /** The drink poured to go with it. */
  pouring: Beverage | null = null;

  private readonly rand: Rand;
  private nextId = 1;
  private spawnTimer = 2.5;
  private readonly trends: TrendState;
  private readonly commonPool: CommonCustomer[];
  private readonly rarePool: RareCustomer[];

  constructor(readonly state: GameState) {
    const caps = capsFor(state.level);
    this.seats = caps.seats;
    this.rand = mulberry32(hashSeed(`${state.seed}:night:${state.day}`));
    this.trends = currentTrends(state.day, String(state.seed));

    state.stations.slice(0, caps.stations).forEach((kind, i) => {
      this.stations.push({ id: i, kind, job: null, ready: null });
    });

    this.commonPool = commonsAt(state.location);
    this.rarePool = raresAt(state.location).filter((c) => !c.incomplete);
  }

  get trendState(): TrendState {
    return this.trends;
  }

  get finished(): boolean {
    return this.timeLeft <= 0 && this.guests.every((g) => g.state === 'gone');
  }

  get seated(): Guest[] {
    return this.guests.filter((g) => g.state !== 'gone');
  }

  guestAt(seat: number): Guest | undefined {
    return this.guests.find((g) => g.seat === seat && g.state !== 'gone');
  }

  // ----------------------------------------------------------- simulation

  update(dt: number): void {
    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.trySpawn();
        // Busier as the night goes on, then tapering at closing time.
        const progress = 1 - this.timeLeft / NIGHT_SECONDS;
        this.spawnTimer = 7.5 - progress * 3.4 + this.rand() * 2.2;
      }
    }

    for (const station of this.stations) {
      const job = station.job;
      if (!job) continue;
      job.remaining -= dt;
      if (job.remaining <= 0) {
        station.ready = resolveDishTags(job.cuisine, job.added, this.trends);
        station.job = null;
        this.log(station.ready.darkMatter ? 'ruined' : 'cooked', dishName(job.cuisine.name));
      }
    }

    for (const guest of this.guests) {
      if (guest.state === 'gone') continue;
      if (guest.state === 'leaving') {
        guest.reactionLeft -= dt;
        if (guest.reactionLeft <= 0) guest.state = 'gone';
        continue;
      }
      guest.patience -= dt / PATIENCE_SECONDS;
      if (guest.patience <= 0) {
        guest.state = 'leaving';
        guest.reactionLeft = 2;
        guest.verdict = { rating: 'black', paid: 0, tip: 0, note: t('note.impatient') };
        this.breakCombo();
        this.satisfaction = Math.max(0, this.satisfaction + satisfactionDelta('black'));
        this.log('left', guest.shortName, 'black');
      }
    }
  }

  private trySpawn(): void {
    const free = [...Array(this.seats).keys()].filter((s) => !this.guestAt(s));
    if (free.length === 0) return;
    const seat = pick(this.rand, free);
    if (seat === undefined) return;

    // Rares are the exception, not the rule.
    const wantRare = this.rarePool.length > 0 && this.rand() < 0.26;
    const guest = wantRare ? this.spawnRare(seat) : this.spawnCommon(seat);
    if (!guest) return;
    this.guests.push(guest);
    this.log('arrived', guest.shortName);
  }

  private spawnCommon(seat: number): Guest | null {
    const customer = pick(this.rand, this.commonPool);
    if (!customer) return null;
    const dish = pick(this.rand, this.state.menu.dishes.filter((d) => canCook(this.state, d)))
      ?? pick(this.rand, this.state.menu.dishes);
    const drink = pick(this.rand, this.state.menu.drinks);
    if (!dish || !drink) return null;

    return {
      id: this.nextId++,
      kind: 'common',
      name: customer.name,
      shortName: customerName(customer.name),
      spec: specFor(customer.name),
      seat,
      order: { dish, drink },
      request: t('order.common', { dish: dishName(dish), drink: beverageName(drink) }),
      budget: null,
      patience: 1,
      arrivedAt: NIGHT_SECONDS - this.timeLeft,
      state: 'waiting',
      reactionLeft: 0,
    };
  }

  private spawnRare(seat: number): Guest | null {
    const taken = new Set(this.seated.map((g) => g.name));
    const available = this.rarePool.filter((c) => !taken.has(c.name));
    const customer = pick(this.rand, available);
    if (!customer) return this.spawnCommon(seat);

    const dishTag = pick(this.rand, customer.prefCuisine);
    const drinkTag = pick(this.rand, customer.prefBeverage);
    const budget = randInt(this.rand, customer.budget.min, customer.budget.max);

    const parts: string[] = [];
    if (dishTag) parts.push(t('order.wantDish', { tag: tagName(String(dishTag)) }));
    if (drinkTag) parts.push(t('order.wantDrink', { tag: tagName(String(drinkTag)) }));

    return {
      id: this.nextId++,
      kind: 'rare',
      name: customer.name,
      shortName: customerName(customer.name),
      spec: specFor(customer.name, customer.shortName),
      seat,
      order: {
        ...(dishTag ? { dishTag: dishTag as CuisineTag } : {}),
        ...(drinkTag ? { drinkTag: drinkTag as BeverageTag } : {}),
      },
      request: parts.length
        ? t('order.rare', { wants: parts.join(t('order.join')) })
        : t('order.rareAny'),
      budget,
      patience: 1,
      arrivedAt: NIGHT_SECONDS - this.timeLeft,
      state: 'waiting',
      reactionLeft: 0,
    };
  }

  // -------------------------------------------------------------- actions

  /** Starts cooking `cuisineName` on a station, consuming its ingredients. */
  startCooking(stationId: number, cuisineName: string, extras: string[]): string | null {
    const station = this.stations[stationId];
    if (!station) return t('msg.nothingToServe');
    if (station.job) return t('station.busy');
    if (station.ready) return t('station.take');

    const cuisine = CUISINES[cuisineName];
    if (!cuisine) return t('msg.nothingToServe');
    if (cuisine.kitchenware !== 'Any' && cuisine.kitchenware !== station.kind) {
      return t('cook.needsStation', { station: cuisine.kitchenware });
    }
    if (!canCook(this.state, cuisineName)) return t('cook.outOfStock');

    const added: Ingredient[] = [];
    for (const name of extras) {
      const ing = INGREDIENTS[name];
      if (!ing) continue;
      if (!takeStock(this.state, name, 1)) continue;
      added.push(ing);
    }
    consumeRecipe(this.state, cuisineName);

    station.job = { cuisine, added, remaining: cuisine.cookTime, total: cuisine.cookTime };
    return null;
  }

  /** Picks a finished dish up off a station. */
  collect(stationId: number): boolean {
    const station = this.stations[stationId];
    if (!station?.ready || this.carrying) return false;
    this.carrying = station.ready;
    station.ready = null;
    return true;
  }

  /** Pours a drink to accompany the carried dish. */
  pour(drinkName: string): boolean {
    const drink = BEVERAGES[drinkName];
    if (!drink || this.pouring) return false;
    if (!takeStock(this.state, drinkName, 1)) return false;
    this.pouring = drink;
    return true;
  }

  /** Serves the carried dish and drink to a seated guest. */
  serve(seat: number): NightEvent | null {
    const guest = this.guestAt(seat);
    const dish = this.carrying;
    const drink = this.pouring;
    if (!guest || guest.state !== 'waiting' || !dish || !drink) return null;

    const rating = this.judge(guest, dish, drink);
    const bill = computeBill(dish, drink);
    const payment =
      guest.kind === 'rare' && guest.budget !== null
        ? settleRare(bill, rating, { budget: { min: 0, max: guest.budget } } as RareCustomer)
        : settleCommon(bill, rating);

    // An over-budget guest storms out; the tip goes with them.
    const tip = payment.overBudget ? 0 : computeTip(bill, rating);
    this.revenue += payment.paid;
    this.tips += tip;
    this.state.money += payment.paid + tip;
    this.state.stats.totalRevenue += payment.paid + tip;

    if (breaksCombo(rating)) this.breakCombo();
    else {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
    this.satisfaction = Math.max(0, Math.min(100, this.satisfaction + satisfactionDelta(rating)));

    if (guest.kind === 'rare') recordRating(this.state, guest.name, rating);
    else this.state.stats.ratings[rating]++;
    gainExp(this.state, { black: 2, purple: 4, green: 8, orange: 16, pink: 28 }[rating]);

    const note = payment.overBudget
      ? t(payment.severity === 'major' ? 'note.overMajor' : 'note.overMinor')
      : t(`note.${rating}`);

    guest.verdict = { rating, paid: payment.paid, tip, note };
    guest.state = 'leaving';
    guest.reactionLeft = 2.4;

    this.carrying = null;
    this.pouring = null;

    const event: NightEvent = {
      kind: 'served',
      at: NIGHT_SECONDS - this.timeLeft,
      text: `${guest.shortName}: ${note}`,
      rating,
    };
    this.events.push(event);
    return event;
  }

  private judge(guest: Guest, dish: ResolvedDish, drink: Beverage): Rating {
    if (guest.kind === 'rare') {
      const customer = raresAt(this.state.location).find((c) => c.name === guest.name);
      if (customer) return rateRare(guest.order, dish, drink, customer).rating;
      return 'green';
    }
    const customer = this.commonPool.find((c) => c.name === guest.name);
    if (!customer) return 'green';
    return rateCommon(guest.order, dish, drink, customer).rating;
  }

  /** Throws the carried dish away, e.g. after ruining it. */
  discard(): void {
    this.carrying = null;
    this.pouring = null;
  }

  private breakCombo(): void {
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.combo = 0;
  }

  private log(kind: NightEvent['kind'], text: string, rating?: Rating): void {
    this.events.push({
      kind,
      at: NIGHT_SECONDS - this.timeLeft,
      text,
      ...(rating ? { rating } : {}),
    });
    if (this.events.length > 60) this.events.shift();
  }

  /** Rolls the night up into the numbers the results screen shows. */
  summary() {
    this.state.stats.nightsServed++;
    this.state.stats.bestCombo = Math.max(this.state.stats.bestCombo, this.bestCombo);
    return {
      revenue: this.revenue,
      tips: this.tips,
      bestCombo: this.bestCombo,
      satisfaction: this.satisfaction,
      served: this.guests.filter((g) => g.verdict && g.verdict.paid > 0).length,
      walkouts: this.guests.filter((g) => g.verdict?.paid === 0).length,
    };
  }
}

