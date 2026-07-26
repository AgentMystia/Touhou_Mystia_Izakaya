/**
 * Localisation.
 *
 * The game database is keyed by the English names the Fandom wiki uses, but
 * the game itself is Chinese, so every name shown to the player goes through
 * the canonical name table built by tools/build-i18n.mjs. UI strings live in
 * the locale tables below.
 */

import names from '../data/zh-names.json';
import { ZH } from './zh';

export type Locale = 'zh-CN' | 'en';

export type StringKey = keyof typeof ZH;

const NAMES = names as {
  dishes: Record<string, string>;
  ingredients: Record<string, string>;
  beverages: Record<string, string>;
  tags: Record<string, string>;
  customers: Record<string, string>;
  locations: Record<string, string>;
  kitchenware: Record<string, string>;
};

let locale: Locale = 'zh-CN';

export const setLocale = (next: Locale): void => {
  locale = next;
};
export const getLocale = (): Locale => locale;

/** A UI string. Falls back to the key itself so nothing renders blank. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = locale === 'zh-CN' ? ZH[key] : EN[key];
  let out = template ?? String(key);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

const lookup = (table: Record<string, string>, key: string): string =>
  locale === 'zh-CN' ? (table[key] ?? key) : key;

export const dishName = (key: string): string => lookup(NAMES.dishes, key);
export const ingredientName = (key: string): string => lookup(NAMES.ingredients, key);
export const beverageName = (key: string): string => lookup(NAMES.beverages, key);
export const tagName = (key: string): string => lookup(NAMES.tags, key);
export const customerName = (key: string): string => lookup(NAMES.customers, key);
export const locationName = (key: string): string => lookup(NAMES.locations, key);
export const kitchenwareName = (key: string): string => lookup(NAMES.kitchenware, key);

/** Formats a money amount with the game's yen sign. */
export const money = (amount: number): string => `${Math.round(amount).toLocaleString('en-US')}¥`;

/** Formats seconds as m:ss. */
export const timer = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** English fallback strings, used when the locale is switched in settings. */
const EN: Record<StringKey, string> = {
  'title.start': 'Open for business',
  'title.continue': 'Continue',
  'title.album': 'Album',
  'title.settings': 'Settings',
  'title.tagline': "Touhou Mystia's Izakaya",
  'title.disclaimer': 'A fan recreation · original art · not affiliated with the original developers',

  'hud.time': 'Time',
  'hud.earnings': 'Earnings',
  'hud.combo': 'Combo',
  'hud.reputation': 'Reputation',
  'hud.controls': 'WASD move · E interact · RMB/K throw · Q switch target · Esc close',

  'station.empty': 'empty',
  'station.take': 'take',
  'station.busy': 'Still cooking.',

  'prompt.cook': 'Cook',
  'prompt.collect': 'Take the dish',
  'prompt.busy': 'Cooking…',
  'prompt.pour': 'Pour a drink',
  'prompt.serve': 'Serve',

  'throw.hint': 'RMB / K to throw',

  'tray.title': 'Tray',
  'tray.empty': 'nothing in hand',
  'tray.pour': 'pour one at the shelf',

  'cook.title': 'Cook',
  'cook.menu': "Tonight's menu",
  'cook.addHint': 'Add up to five ingredients',
  'cook.pickFirst': 'Pick a recipe to begin.',
  'cook.confirm': 'Cook',
  'cook.close': 'Esc to close',
  'cook.needsStation': 'needs a {station}',
  'cook.outOfStock': 'out of ingredients',
  'cook.added': '{count}/{max} added',
  'cook.ruins': 'ruins: {tags}',
  'cook.darkMatter': '{tags} ruins this dish → Dark Matter',

  'drinks.title': 'Pour a drink',

  'msg.handsFull': 'Your hands are full.',
  'msg.cookFirst': 'Cook something first.',
  'msg.nothingToServe': 'Nothing to serve yet.',
  'msg.needDrink': 'Pour a drink to go with it.',
  'msg.alreadyPoured': 'The drink is already poured.',
  'msg.noRoom': 'No room for more.',
  'msg.noneLeft': 'No {item} left.',
  'msg.missed': 'They had already left — the plate hit the floor.',

  'prep.title': 'Prep',
  'prep.subtitle': "Set tonight's menu, drinks and cookware, then open up.",
  'prep.dishes': 'Menu',
  'prep.drinks': 'Drinks',
  'prep.stations': 'Cookware',
  'prep.slots': '{used}/{max}',
  'prep.start': 'Open for business',
  'prep.auto': 'Suggest',
  'prep.clear': 'Clear all',
  'prep.day': 'Night {day}',
  'prep.level': 'Level {level}',
  'prep.coverage': 'Tags you can serve tonight',
  'prep.noCoverage': 'No dishes chosen yet.',
  'prep.warnNoStation': '{dish} needs a {station}, which you are not bringing.',
  'prep.warnNoStock': 'Not enough ingredients for {dish}.',
  'prep.needDish': 'Choose at least one dish.',
  'prep.needDrink': 'Choose at least one drink.',
  'prep.needStation': 'Bring at least one piece of cookware.',
  'prep.ready': 'All set — open up.',
  'prep.stock': '{count} in stock',
  'prep.cookTime': '{time}s',
  'prep.usedBy': '{count} dishes',
  'prep.hint': 'Space to open · Esc to go back',

  'rating.black': 'Furious',
  'rating.purple': 'Dissatisfied',
  'rating.green': 'Fair',
  'rating.orange': 'Satisfied',
  'rating.pink': 'Perfect',

  'note.black': 'What is this…?',
  'note.purple': 'Not what I wanted.',
  'note.green': 'Thanks, that hit the spot.',
  'note.orange': 'Oh, this is good!',
  'note.pink': 'Incredible — exactly right!',
  'note.overMinor': 'A bit over my budget…',
  'note.overMajor': 'Far too expensive!',
  'note.impatient': 'Tired of waiting.',

  'order.common': '{dish} and {drink}, please.',
  'order.rare': 'I feel like {wants}.',
  'order.rareAny': 'Surprise me.',
  'order.wantDish': 'something {tag}',
  'order.wantDrink': 'a {tag} drink',
  'order.join': ' with ',

  'results.title': "Tonight's takings",
  'results.revenue': 'Revenue',
  'results.tips': 'Tips',
  'results.served': 'Served',
  'results.walkouts': 'Walked out',
  'results.bestCombo': 'Best combo',
  'results.continue': 'Close up',

  'gallery.title': 'Cast',
  'gallery.subtitle': '{count} characters from one rig',
};
