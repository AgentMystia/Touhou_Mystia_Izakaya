/**
 * The player's save state, and the helpers that mutate it.
 *
 * Everything persistent lives here: money, level, what is unlocked, ingredient
 * stock, and the bond standing with every named guest.
 */

import { BEVERAGES, CUISINES, INGREDIENTS, type Release } from '../data';
import { type BondState, applyBond, emptyBond } from '../rules/bond';
import type { Rating } from '../rules/rating';
import { randomSeed } from '../core/rng';

export const SAVE_KEY = 'mystia.save.v1';
export const SAVE_VERSION = 1;

export interface GameState {
  version: number;
  seed: number;
  /** In-game day, starting at 1. */
  day: number;
  /** Izakaya level; gates menu size, station count and recipe tiers. */
  level: number;
  exp: number;
  money: number;
  /** Which DLC tier's content is available. */
  release: Release;
  /** Where tonight's service happens. */
  location: string;
  /** Ingredient name to count. */
  pantry: Record<string, number>;
  /** Beverage name to count. */
  cellar: Record<string, number>;
  /** Recipes the player knows. */
  recipes: string[];
  /** Stations brought to tonight's service. */
  stations: string[];
  /** Dishes and drinks on tonight's menu. */
  menu: { dishes: string[]; drinks: string[] };
  bonds: Record<string, BondState>;
  stats: {
    nightsServed: number;
    bestCombo: number;
    totalRevenue: number;
    ratings: Record<Rating, number>;
  };
}

/** Level gates, indexed by level. Level 1 is a very small operation. */
export const LEVEL_CAPS = [
  { menuDishes: 3, menuDrinks: 2, stations: 2, seats: 3 },
  { menuDishes: 3, menuDrinks: 2, stations: 2, seats: 3 },
  { menuDishes: 4, menuDrinks: 3, stations: 3, seats: 4 },
  { menuDishes: 5, menuDrinks: 3, stations: 3, seats: 4 },
  { menuDishes: 6, menuDrinks: 4, stations: 4, seats: 5 },
  { menuDishes: 7, menuDrinks: 4, stations: 4, seats: 5 },
  { menuDishes: 8, menuDrinks: 5, stations: 5, seats: 5 },
];

export const capsFor = (level: number) =>
  LEVEL_CAPS[Math.min(Math.max(level, 0), LEVEL_CAPS.length - 1)] as (typeof LEVEL_CAPS)[number];

/** Experience needed to reach each level. */
export const expForLevel = (level: number): number => Math.round(180 * level ** 1.55);

/** The dishes Mystia can make on day one, plus a couple of staples. */
const STARTER_RECIPES = [
  'Grilled Lamprey',
  'Rice Ball',
  'Fresh Tofu',
  'Seafood Miso Soup',
  'Boiled Tofu',
  'Roasted Mushroom',
  'Pork Bowl',
  'Dew Runny Eggs',
];

const STARTER_PANTRY: Record<string, number> = {
  Lamprey: 8, Trout: 6, Tofu: 8, Seaweed: 8, Egg: 8, Pork: 6,
  Mushroom: 5, Radish: 5, Onion: 4, Potato: 4, Peach: 3, Butter: 3,
};

const STARTER_CELLAR: Record<string, number> = {
  'Green Tea': 10, 'Sparrow Sake': 6, Umeshu: 5, 'ZUN Beer': 6, 'Fruity Highball': 5,
};

export function newGame(seed = randomSeed()): GameState {
  const recipes = STARTER_RECIPES.filter((name) => CUISINES[name]);
  const caps = capsFor(1);
  return {
    version: SAVE_VERSION,
    seed,
    day: 1,
    level: 1,
    exp: 0,
    money: 300,
    release: 'BaseGame',
    location: 'Youkai Trail',
    pantry: { ...STARTER_PANTRY },
    cellar: { ...STARTER_CELLAR },
    recipes,
    stations: ['Grill', 'Boiling Pot'],
    menu: {
      dishes: recipes.slice(0, caps.menuDishes),
      drinks: Object.keys(STARTER_CELLAR).slice(0, caps.menuDrinks),
    },
    bonds: {},
    stats: { nightsServed: 0, bestCombo: 0, totalRevenue: 0, ratings: {
      black: 0, purple: 0, green: 0, orange: 0, pink: 0,
    } },
  };
}

// ------------------------------------------------------------- inventory

export const stockOf = (state: GameState, name: string): number =>
  (INGREDIENTS[name] ? state.pantry[name] : state.cellar[name]) ?? 0;

export function takeStock(state: GameState, name: string, count = 1): boolean {
  const shelf = INGREDIENTS[name] ? state.pantry : state.cellar;
  const have = shelf[name] ?? 0;
  if (have < count) return false;
  shelf[name] = have - count;
  return true;
}

export function addStock(state: GameState, name: string, count = 1): void {
  const shelf = INGREDIENTS[name] ? state.pantry : state.cellar;
  shelf[name] = (shelf[name] ?? 0) + count;
}

/** True when every ingredient a recipe needs is in the pantry. */
export const canCook = (state: GameState, cuisineName: string): boolean => {
  const dish = CUISINES[cuisineName];
  if (!dish) return false;
  const needed = new Map<string, number>();
  for (const name of dish.ingredients) needed.set(name, (needed.get(name) ?? 0) + 1);
  for (const [name, count] of needed) if ((state.pantry[name] ?? 0) < count) return false;
  return true;
};

export function consumeRecipe(state: GameState, cuisineName: string): void {
  for (const name of CUISINES[cuisineName]?.ingredients ?? []) takeStock(state, name, 1);
}

// ------------------------------------------------------------ progression

export interface LevelUp {
  leveled: boolean;
  from: number;
  to: number;
}

export function gainExp(state: GameState, amount: number): LevelUp {
  const from = state.level;
  state.exp += Math.max(0, Math.round(amount));
  while (state.level < LEVEL_CAPS.length - 1 && state.exp >= expForLevel(state.level)) {
    state.exp -= expForLevel(state.level);
    state.level++;
  }
  return { leveled: state.level > from, from, to: state.level };
}

export function bondOf(state: GameState, name: string): BondState {
  return state.bonds[name] ?? emptyBond();
}

export function recordRating(state: GameState, customerName: string, rating: Rating): void {
  state.stats.ratings[rating]++;
  if (!(customerName in state.bonds) && !CUISINES[customerName]) {
    // Only named guests keep a bond; commons are anonymous.
  }
  const current = bondOf(state, customerName);
  const next = applyBond(current, rating);
  state.bonds[customerName] = { points: next.points, level: next.level };
}

/** Adds a recipe if it is new. Returns true when it was actually learned. */
export function learnRecipe(state: GameState, name: string): boolean {
  if (!CUISINES[name] || state.recipes.includes(name)) return false;
  state.recipes.push(name);
  return true;
}

// ------------------------------------------------------------------ save

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked localStorage should never take the game down.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== SAVE_VERSION) return null;
    // Guard against a save written before a data rebuild dropped an item.
    parsed.recipes = parsed.recipes.filter((r) => CUISINES[r]);
    parsed.menu.dishes = parsed.menu.dishes.filter((d) => CUISINES[d]);
    parsed.menu.drinks = parsed.menu.drinks.filter((d) => BEVERAGES[d]);
    return parsed;
  } catch {
    return null;
  }
}

export const hasSave = (): boolean => {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
};

export const clearSave = (): void => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
};
