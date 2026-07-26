/**
 * Typed access to the generated game database.
 *
 * Everything here is loaded statically so the bundler inlines it — there is no
 * runtime fetch and no loading screen.
 */

import beveragesJson from './beverages.json';
import cuisinesJson from './cuisines.json';
import customersJson from './customers.json';
import ingredientsJson from './ingredients.json';
import locationsJson from './locations.json';
import merchantsJson from './merchants.json';
import partnersJson from './partners.json';
import tagsJson from './tags.json';

import type {
  Beverage,
  CommonCustomer,
  Cuisine,
  GameLocation,
  Ingredient,
  Merchant,
  Partner,
  RareCustomer,
  Release,
  TagTable,
} from './types';

export * from './types';

export const TAGS = tagsJson as unknown as TagTable;
export const CUISINES = cuisinesJson as unknown as Record<string, Cuisine>;
export const INGREDIENTS = ingredientsJson as unknown as Record<string, Ingredient>;
export const BEVERAGES = beveragesJson as unknown as Record<string, Beverage>;
export const LOCATIONS = locationsJson as unknown as GameLocation[];
export const MERCHANTS = merchantsJson as unknown as Record<string, Merchant>;
export const PARTNERS = partnersJson as unknown as Record<string, Partner>;

const customers = customersJson as unknown as {
  normal: Record<string, CommonCustomer>;
  rare: Record<string, RareCustomer>;
  special: Record<string, RareCustomer>;
};

export const COMMON_CUSTOMERS = customers.normal;
export const RARE_CUSTOMERS = customers.rare;
export const SPECIAL_GUESTS = customers.special;

// ---------------------------------------------------------------- lookups

const missing = (kind: string, name: string): never => {
  throw new Error(`unknown ${kind}: ${name}`);
};

export const cuisine = (name: string): Cuisine => CUISINES[name] ?? missing('cuisine', name);
export const ingredient = (name: string): Ingredient =>
  INGREDIENTS[name] ?? missing('ingredient', name);
export const beverage = (name: string): Beverage => BEVERAGES[name] ?? missing('beverage', name);
export const location = (name: string): GameLocation =>
  LOCATIONS.find((l) => l.name === name) ?? missing('location', name);

/** Rare and special guests share a shape and are looked up together. */
export const rareCustomer = (name: string): RareCustomer =>
  RARE_CUSTOMERS[name] ?? SPECIAL_GUESTS[name] ?? missing('rare customer', name);

export const commonCustomer = (name: string): CommonCustomer =>
  COMMON_CUSTOMERS[name] ?? missing('common customer', name);

// ------------------------------------------------------------- selections

const RELEASE_ORDER: Release[] = ['BaseGame', 'DLC1', 'DLC2', 'DLC3', 'DLC4', 'DLC5'];

/** True when `release` is unlocked given the highest release the save enables. */
export const isUnlocked = (release: Release, upTo: Release): boolean =>
  RELEASE_ORDER.indexOf(release) <= RELEASE_ORDER.indexOf(upTo);

export const cuisinesUpTo = (upTo: Release): Cuisine[] =>
  Object.values(CUISINES).filter((c) => isUnlocked(c.release, upTo));

export const ingredientsUpTo = (upTo: Release): Ingredient[] =>
  Object.values(INGREDIENTS).filter((i) => isUnlocked(i.release, upTo));

export const beveragesUpTo = (upTo: Release): Beverage[] =>
  Object.values(BEVERAGES).filter((b) => isUnlocked(b.release, upTo));

export const locationsUpTo = (upTo: Release): GameLocation[] =>
  LOCATIONS.filter((l) => isUnlocked(l.release, upTo));

/** Common customers that can show up at a given area. */
export const commonsAt = (locationName: string): CommonCustomer[] =>
  Object.values(COMMON_CUSTOMERS).filter((c) => c.locations.includes(locationName));

/** Rare customers that can show up at a given area. */
export const raresAt = (locationName: string): RareCustomer[] =>
  Object.values(RARE_CUSTOMERS).filter((c) => c.locations.includes(locationName));

export const merchantsAt = (locationName: string): Merchant[] =>
  Object.values(MERCHANTS).filter((m) => m.location === locationName);

/** Dishes cookable on a given station ("Any" recipes fit every station). */
export const cuisinesFor = (kitchenware: string, pool: Cuisine[]): Cuisine[] =>
  pool.filter((c) => c.kitchenware === kitchenware || c.kitchenware === 'Any');
