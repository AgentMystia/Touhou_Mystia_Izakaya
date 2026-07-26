/**
 * Guards on the generated database. The upstream wiki has real defects — typo'd
 * tags, reversed names, placeholder sentinels — and the build pipeline repairs
 * them. These tests pin those repairs so a data rebuild cannot silently
 * reintroduce a customer nobody can satisfy.
 */

import { describe, expect, it } from 'vitest';

import {
  BEVERAGES,
  COMMON_CUSTOMERS,
  CUISINES,
  INGREDIENTS,
  LOCATIONS,
  MERCHANTS,
  PARTNERS,
  RARE_CUSTOMERS,
  SPECIAL_GUESTS,
  TAGS,
  commonsAt,
  raresAt,
} from '../../src/data';
import { resolveDishTags } from '../../src/rules/tags';

const cuisineTags = new Set(TAGS.cuisine.map((t) => t.name));
const beverageTags = new Set(TAGS.beverage.map((t) => t.name));
const locationNames = new Set(LOCATIONS.map((l) => l.name));
const allCustomers = [
  ...Object.values(COMMON_CUSTOMERS),
  ...Object.values(RARE_CUSTOMERS),
  ...Object.values(SPECIAL_GUESTS),
];

describe('database shape', () => {
  it('has the expected entity counts', () => {
    expect(Object.keys(CUISINES)).toHaveLength(163);
    expect(Object.keys(INGREDIENTS)).toHaveLength(62);
    expect(Object.keys(BEVERAGES)).toHaveLength(46);
    expect(Object.keys(COMMON_CUSTOMERS)).toHaveLength(47);
    expect(Object.keys(RARE_CUSTOMERS)).toHaveLength(45);
    expect(LOCATIONS).toHaveLength(16);
    expect(Object.keys(MERCHANTS)).toHaveLength(24);
    expect(Object.keys(PARTNERS)).toHaveLength(16);
    expect(TAGS.cuisine).toHaveLength(45);
    expect(TAGS.beverage).toHaveLength(21);
  });

  it('has 73 base-game dishes and 15 base-game rare customers', () => {
    const base = <T extends { release: string }>(xs: T[]) =>
      xs.filter((x) => x.release === 'BaseGame');
    expect(base(Object.values(CUISINES))).toHaveLength(73);
    expect(base(Object.values(RARE_CUSTOMERS))).toHaveLength(15);
    expect(base(Object.values(COMMON_CUSTOMERS))).toHaveLength(15);
    expect(base(LOCATIONS)).toHaveLength(6);
  });
});

describe('referential integrity', () => {
  it('resolves every ingredient a recipe calls for', () => {
    for (const dish of Object.values(CUISINES)) {
      for (const name of dish.ingredients) {
        expect(INGREDIENTS[name], `${dish.name} needs ${name}`).toBeDefined();
      }
    }
  });

  it('uses only known tags on dishes, ingredients and drinks', () => {
    for (const dish of Object.values(CUISINES)) {
      for (const tag of [...dish.props, ...dish.xprops]) expect(cuisineTags).toContain(tag);
    }
    for (const ing of Object.values(INGREDIENTS)) {
      for (const tag of ing.props) expect(cuisineTags).toContain(tag);
    }
    for (const drink of Object.values(BEVERAGES)) {
      for (const tag of drink.props) expect(beverageTags).toContain(tag);
    }
  });

  it('uses only known tags on customer preferences', () => {
    // The upstream data contains "Beet" and "Trend-Popular"; both are repaired.
    for (const c of allCustomers) {
      for (const tag of [...c.prefCuisine, ...('dislikeCuisine' in c ? c.dislikeCuisine : [])]) {
        expect(cuisineTags, `${c.name} likes ${tag}`).toContain(tag);
      }
      for (const tag of c.prefBeverage) {
        expect(beverageTags, `${c.name} drinks ${tag}`).toContain(tag);
      }
    }
  });

  it('points every customer at a real location', () => {
    for (const c of allCustomers) {
      for (const loc of c.locations) expect(locationNames, `${c.name}`).toContain(loc);
    }
  });

  it('resolves every location’s resident rare customers', () => {
    // The locations module names three shrine residents surname-first.
    for (const loc of LOCATIONS) {
      for (const name of loc.rares) {
        expect(RARE_CUSTOMERS[name], `${loc.name} hosts ${name}`).toBeDefined();
      }
    }
  });

  it('sells only real items at every merchant', () => {
    for (const m of Object.values(MERCHANTS)) {
      for (const item of m.itemOrder) {
        const known = INGREDIENTS[item] ?? BEVERAGES[item] ?? CUISINES[item];
        expect(known, `${m.name} sells ${item}`).toBeDefined();
      }
    }
  });
});

describe('rules invariants the engine depends on', () => {
  it('never lists a tag as both innate and forbidden', () => {
    // resolveDishTags relies on this: only an *added* tag can ruin a dish.
    for (const dish of Object.values(CUISINES)) {
      const overlap = dish.props.filter((p) => dish.xprops.includes(p));
      expect(overlap, `${dish.name}`).toHaveLength(0);
    }
  });

  it('never produces Dark Matter from a recipe on its own', () => {
    for (const dish of Object.values(CUISINES)) {
      if (dish.name === 'Dark Matter') continue;
      expect(resolveDishTags(dish).darkMatter, dish.name).toBe(false);
    }
  });

  it('uses ten distinct tags across the five priority pairs', () => {
    // Distinctness is what makes a single strike pass order-independent.
    const involved = TAGS.priority.flat();
    expect(new Set(involved).size).toBe(involved.length);
    expect(TAGS.priority).toHaveLength(5);
  });

  it('gives every dish a station the game knows how to build', () => {
    const stations = new Set(['Any', 'Boiling Pot', 'Grill', 'Frying Pan', 'Steamer', 'Cutting Board']);
    for (const dish of Object.values(CUISINES)) {
      expect(stations, `${dish.name}`).toContain(dish.kitchenware);
    }
  });

  it('never lets a recipe exceed the five-ingredient limit', () => {
    for (const dish of Object.values(CUISINES)) {
      expect(dish.ingredients.length, dish.name).toBeLessThanOrEqual(TAGS.thresholds.maxIngredients);
    }
  });
});

describe('playability', () => {
  it('leaves every rare customer satisfiable', () => {
    for (const c of Object.values(RARE_CUSTOMERS)) {
      expect(c.incomplete, `${c.name} is a stub`).toBe(false);
      expect(c.prefCuisine.length, `${c.name} likes nothing`).toBeGreaterThan(0);
      expect(c.budget.max).toBeGreaterThan(0);
    }
  });

  it('flags the special guests the wiki has not documented', () => {
    // Kept in the database for the album, but excluded from spawn pools.
    const stubs = Object.values(SPECIAL_GUESTS).filter((g) => g.incomplete);
    expect(stubs.length).toBeGreaterThan(0);
    for (const g of stubs) expect(g.prefCuisine).toHaveLength(0);
  });

  it('populates every base-game location with customers', () => {
    for (const loc of LOCATIONS.filter((l) => l.release === 'BaseGame')) {
      if (loc.name === 'Hakugyokurou') continue; // a small side area with no trio
      expect(commonsAt(loc.name).length, loc.name).toBeGreaterThan(0);
      expect(raresAt(loc.name).length, loc.name).toBeGreaterThan(0);
    }
  });

  it('gives every dish a cookable time and a sane price', () => {
    for (const dish of Object.values(CUISINES)) {
      if (dish.name === 'Dark Matter') continue;
      expect(dish.cookTime, dish.name).toBeGreaterThan(0);
      expect(dish.cost, dish.name).toBeGreaterThan(0);
    }
  });
});
