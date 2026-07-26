import { describe, expect, it } from 'vitest';

import { cuisine, ingredient } from '../../src/data';
import { MAX_INGREDIENTS, freeSlots, previewAddition, resolveDishTags } from '../../src/rules/tags';

describe('resolveDishTags', () => {
  it('keeps the recipe’s innate tags', () => {
    const dish = resolveDishTags(cuisine('Grilled Lamprey'));
    expect([...dish.tags]).toEqual(expect.arrayContaining(['Aquatic', 'Grilled', 'Signature']));
    expect(dish.darkMatter).toBe(false);
  });

  it('applies every tag of an added ingredient', () => {
    // Tofu carries Homecooking, Mild and Vegetarian.
    const dish = resolveDishTags(cuisine('Rice Ball'), [ingredient('Tofu')]);
    expect(dish.addedTags.has('Homecooking')).toBe(true);
    expect(dish.addedTags.has('Mild')).toBe(true);
    expect(dish.addedTags.has('Vegetarian')).toBe(true);
  });

  describe('tag priority overrides', () => {
    it('Meat strikes Vegetarian', () => {
      // Tofu brings Vegetarian, Pork brings Meat.
      const dish = resolveDishTags(cuisine('Rice Ball'), [ingredient('Tofu'), ingredient('Pork')]);
      expect(dish.tags.has('Meat')).toBe(true);
      expect(dish.tags.has('Vegetarian')).toBe(false);
      expect(dish.struck).toContain('Vegetarian');
    });

    it('Greasy strikes Mild', () => {
      // Butter brings Greasy, Tofu brings Mild.
      const dish = resolveDishTags(cuisine('Rice Ball'), [ingredient('Tofu'), ingredient('Butter')]);
      expect(dish.tags.has('Greasy')).toBe(true);
      expect(dish.tags.has('Mild')).toBe(false);
      expect(dish.struck).toContain('Mild');
    });

    it('Filling strikes Good w/ Alcohol', () => {
      // Radish brings Good w/ Alcohol, Pumpkin brings Filling.
      const dish = resolveDishTags(cuisine('Rice Ball'), [
        ingredient('Radish'),
        ingredient('Pumpkin'),
      ]);
      expect(dish.tags.has('Filling')).toBe(true);
      expect(dish.tags.has('Good w/ Alcohol')).toBe(false);
    });

    it('Large Portion strikes Small Portion', () => {
      // Fresh Tofu is innately Small Portion; filling all five slots bulks it up.
      const base = cuisine('Fresh Tofu');
      expect(base.props).toContain('Small Portion');
      const fillers = Array(freeSlots(base)).fill(null).map(() => ingredient('Egg'));
      const dish = resolveDishTags(base, fillers);
      expect(dish.ingredientCount).toBe(MAX_INGREDIENTS);
      expect(dish.tags.has('Large Portion')).toBe(true);
      expect(dish.tags.has('Small Portion')).toBe(false);
    });
  });

  it('adds Large Portion once all five ingredient slots are used', () => {
    const base = cuisine('Grilled Lamprey'); // one recipe ingredient
    const nearly = resolveDishTags(base, [ingredient('Egg'), ingredient('Egg'), ingredient('Egg')]);
    expect(nearly.tags.has('Large Portion')).toBe(false);

    const full = resolveDishTags(base, Array(4).fill(null).map(() => ingredient('Egg')));
    expect(full.ingredientCount).toBe(MAX_INGREDIENTS);
    expect(full.tags.has('Large Portion')).toBe(true);
  });

  it('never accepts more than five ingredients in total', () => {
    const base = cuisine('Grilled Lamprey');
    const dish = resolveDishTags(base, Array(9).fill(null).map(() => ingredient('Egg')));
    expect(dish.added).toHaveLength(freeSlots(base));
    expect(dish.ingredientCount).toBe(MAX_INGREDIENTS);
  });

  it('turns the dish into Dark Matter when a forbidden tag is added', () => {
    // Grilled Lamprey forbids Meat and Vegetarian; Pork brings Meat.
    const base = cuisine('Grilled Lamprey');
    expect(base.xprops).toContain('Meat');

    const dish = resolveDishTags(base, [ingredient('Pork')]);
    expect(dish.darkMatter).toBe(true);
    expect(dish.violated).toContain('Meat');
    expect([...dish.tags]).toEqual(['Dark Matter']);
  });

  it('does not trigger Dark Matter from the recipe’s own tags', () => {
    const dish = resolveDishTags(cuisine('Grilled Lamprey'));
    expect(dish.darkMatter).toBe(false);
  });

  describe('price bands', () => {
    it('marks dishes over 60¥ as Expensive', () => {
      expect(cuisine('Beef Wellington').cost).toBeGreaterThan(60);
      const dish = resolveDishTags(cuisine('Beef Wellington'));
      expect(dish.tags.has('Expensive')).toBe(true);
      expect(dish.tags.has('Economical')).toBe(false);
    });

    it('marks dishes under 20¥ as Economical', () => {
      const cheap = cuisine('Rice Ball');
      expect(cheap.cost).toBeLessThan(20);
      expect(resolveDishTags(cheap).tags.has('Economical')).toBe(true);
    });
  });

  describe('trends', () => {
    it('attaches Trend - Popular to a dish carrying the trending tag', () => {
      const dish = resolveDishTags(cuisine('Grilled Lamprey'), [], {
        popular: 'Aquatic',
        unpopular: null,
      });
      expect(dish.tags.has('Trend - Popular')).toBe(true);
    });

    it('leaves dishes without the trending tag alone', () => {
      const dish = resolveDishTags(cuisine('Grilled Lamprey'), [], {
        popular: 'Chinese',
        unpopular: null,
      });
      expect(dish.tags.has('Trend - Popular')).toBe(false);
    });

    it('attaches Trend - Unpopular the same way', () => {
      const dish = resolveDishTags(cuisine('Grilled Lamprey'), [], {
        popular: null,
        unpopular: 'Grilled',
      });
      expect(dish.tags.has('Trend - Unpopular')).toBe(true);
    });
  });

  describe('previewAddition', () => {
    it('reports only the tags the dish does not already carry', () => {
      // Rice Ball is already Homecooking and Vegetarian, so Tofu adds only Mild.
      const dish = resolveDishTags(cuisine('Rice Ball'));
      const { gains, ruins } = previewAddition(dish, ingredient('Tofu'));
      expect(gains).toEqual(['Mild']);
      expect(ruins).toHaveLength(0);
    });

    it('warns when an ingredient would ruin the dish', () => {
      const dish = resolveDishTags(cuisine('Grilled Lamprey'));
      const { ruins } = previewAddition(dish, ingredient('Pork'));
      expect(ruins).toContain('Meat');
    });
  });
});
