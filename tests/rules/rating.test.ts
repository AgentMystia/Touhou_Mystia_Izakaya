import { describe, expect, it } from 'vitest';

import { beverage, cuisine, ingredient } from '../../src/data';
import type { CommonCustomer, RareCustomer } from '../../src/data/types';
import { breaksCombo, rateCommon, rateRare, satisfactionDelta } from '../../src/rules/rating';
import { resolveDishTags } from '../../src/rules/tags';

/** A common customer built to want exactly the tags a test needs. */
const common = (prefCuisine: string[], over: Partial<CommonCustomer> = {}): CommonCustomer =>
  ({
    name: 'Test Common',
    kind: 'common',
    locations: ['Youkai Trail'],
    prefCuisine,
    prefBeverage: [],
    likesAnyTag: false,
    description: '',
    release: 'BaseGame',
    ...over,
  }) as CommonCustomer;

const rare = (over: Partial<RareCustomer> = {}): RareCustomer =>
  ({
    name: 'Test Rare',
    kind: 'rare',
    shortName: 'Test',
    budget: { min: 100, max: 100_000, unknown: false },
    locations: ['Youkai Trail'],
    prefCuisine: [],
    dislikeCuisine: [],
    prefBeverage: [],
    likesAnyTag: false,
    incomplete: false,
    release: 'BaseGame',
    ...over,
  }) as RareCustomer;

const GREEN_TEA = () => beverage('Green Tea');

describe('rateCommon', () => {
  const dish = () => resolveDishTags(cuisine('Grilled Lamprey'));

  it('is black when the wrong dish is served', () => {
    const verdict = rateCommon(
      { dish: 'Rice Ball', drink: 'Green Tea' },
      dish(),
      GREEN_TEA(),
      common([]),
    );
    expect(verdict.rating).toBe('black');
    expect(verdict.servedRequested).toBe(false);
  });

  it('is black when the wrong drink is served', () => {
    const verdict = rateCommon(
      { dish: 'Grilled Lamprey', drink: 'Umeshu' },
      dish(),
      GREEN_TEA(),
      common([]),
    );
    expect(verdict.rating).toBe('black');
  });

  it('is green when exactly what was ordered arrives', () => {
    const verdict = rateCommon(
      { dish: 'Grilled Lamprey', drink: 'Green Tea' },
      dish(),
      GREEN_TEA(),
      common(['Aquatic']),
    );
    // Aquatic is innate, not added, so it does not lift the rating.
    expect(verdict.rating).toBe('green');
  });

  it('is orange when an added tag matches their taste', () => {
    const seasoned = resolveDishTags(cuisine('Rice Ball'), [ingredient('Tofu')]);
    const verdict = rateCommon(
      { dish: 'Rice Ball', drink: 'Green Tea' },
      seasoned,
      GREEN_TEA(),
      common(['Mild']),
    );
    expect(verdict.rating).toBe('orange');
    expect(verdict.matchedAddedTags).toContain('Mild');
  });

  it('ignores an added tag that was struck out', () => {
    // Tofu adds Vegetarian, but Pork's Meat strikes it.
    const seasoned = resolveDishTags(cuisine('Rice Ball'), [
      ingredient('Tofu'),
      ingredient('Pork'),
    ]);
    const verdict = rateCommon(
      { dish: 'Rice Ball', drink: 'Green Tea' },
      seasoned,
      GREEN_TEA(),
      common(['Vegetarian']),
    );
    expect(verdict.matchedAddedTags).not.toContain('Vegetarian');
  });

  it('never reaches pink or purple', () => {
    const verdict = rateCommon(
      { dish: 'Grilled Lamprey', drink: 'Green Tea' },
      dish(),
      GREEN_TEA(),
      common(['Aquatic', 'Grilled', 'Signature']),
    );
    expect(['black', 'green', 'orange']).toContain(verdict.rating);
  });
});

describe('rateRare', () => {
  const lamprey = () => resolveDishTags(cuisine('Grilled Lamprey'));

  /** With both requests met, the score alone decides the tier. */
  const scoreOnly = (customer: RareCustomer) =>
    rateRare(
      { dishTag: 'Aquatic', drinkTag: 'No Alcohol' },
      lamprey(),
      GREEN_TEA(),
      customer,
    );

  it('is black at zero points or fewer', () => {
    // Aquatic liked (+1), Grilled and Signature disliked (−2) → −1.
    const verdict = scoreOnly(
      rare({ prefCuisine: ['Aquatic'], dislikeCuisine: ['Grilled', 'Signature'] }),
    );
    expect(verdict.points).toBeLessThanOrEqual(0);
    expect(verdict.rating).toBe('black');
  });

  it('is purple at one point', () => {
    const verdict = scoreOnly(rare({ prefCuisine: ['Aquatic'] }));
    expect(verdict.points).toBe(1);
    expect(verdict.rating).toBe('purple');
  });

  it('is green at two points', () => {
    const verdict = scoreOnly(rare({ prefCuisine: ['Aquatic', 'Grilled'] }));
    expect(verdict.points).toBe(2);
    expect(verdict.rating).toBe('green');
  });

  it('is orange at three points', () => {
    const verdict = scoreOnly(rare({ prefCuisine: ['Aquatic', 'Grilled', 'Signature'] }));
    expect(verdict.points).toBe(3);
    expect(verdict.rating).toBe('orange');
  });

  it('is pink at four points or more', () => {
    const verdict = scoreOnly(
      rare({ prefCuisine: ['Aquatic', 'Grilled', 'Signature'], prefBeverage: ['No Alcohol'] }),
    );
    expect(verdict.points).toBeGreaterThanOrEqual(4);
    expect(verdict.rating).toBe('pink');
  });

  it('counts liked drink tags towards the score', () => {
    const customer = rare({ prefCuisine: ['Aquatic'], prefBeverage: ['No Alcohol'] });
    const verdict = scoreOnly(customer);
    expect(verdict.likedDrink).toContain('No Alcohol');
    expect(verdict.points).toBe(2);
  });

  describe('request fulfilment caps', () => {
    const generous = rare({
      prefCuisine: ['Aquatic', 'Grilled', 'Signature'],
      prefBeverage: ['No Alcohol'],
    });

    it('caps at purple when neither requested tag is delivered', () => {
      const verdict = rateRare(
        { dishTag: 'Chinese', drinkTag: 'Beer' },
        lamprey(),
        GREEN_TEA(),
        generous,
      );
      expect(verdict.points).toBeGreaterThanOrEqual(4);
      expect(verdict.fulfilled).toBe(0);
      expect(verdict.rating).toBe('purple');
    });

    it('caps at orange when only one requested tag is delivered', () => {
      const verdict = rateRare(
        { dishTag: 'Aquatic', drinkTag: 'Beer' },
        lamprey(),
        GREEN_TEA(),
        generous,
      );
      expect(verdict.points).toBeGreaterThanOrEqual(4);
      expect(verdict.fulfilled).toBe(1);
      expect(verdict.rating).toBe('orange');
    });

    it('does not cap when both are delivered', () => {
      const verdict = rateRare(
        { dishTag: 'Aquatic', drinkTag: 'No Alcohol' },
        lamprey(),
        GREEN_TEA(),
        generous,
      );
      expect(verdict.fulfilled).toBe(2);
      expect(verdict.rating).toBe('pink');
    });

    it('never lifts a low score up to the cap', () => {
      // The cap is a ceiling, not a floor: one point stays purple.
      const verdict = rateRare(
        { dishTag: 'Aquatic', drinkTag: 'No Alcohol' },
        lamprey(),
        GREEN_TEA(),
        rare({ prefCuisine: ['Aquatic'] }),
      );
      expect(verdict.rating).toBe('purple');
    });

    it('waives the requirement on Night Sparrow cookware', () => {
      const verdict = rateRare(
        { dishTag: 'Chinese', drinkTag: 'Beer' },
        lamprey(),
        GREEN_TEA(),
        generous,
        { nightSparrow: true },
      );
      expect(verdict.requestWaived).toBe(true);
      expect(verdict.rating).toBe('pink');
    });
  });

  it('subtracts two points for Dark Matter', () => {
    const ruined = resolveDishTags(cuisine('Grilled Lamprey'), [ingredient('Pork')]);
    expect(ruined.darkMatter).toBe(true);
    const verdict = rateRare({}, ruined, GREEN_TEA(), rare({}));
    expect(verdict.points).toBe(-2);
    expect(verdict.rating).toBe('black');
  });

  it('lets Medicine’s reward card ignore Dark Matter', () => {
    const ruined = resolveDishTags(cuisine('Grilled Lamprey'), [ingredient('Pork')]);
    const verdict = rateRare({}, ruined, GREEN_TEA(), rare({}), { ignoreDarkMatter: true });
    expect(verdict.points).toBe(0);
  });

  describe('character-specific interactions', () => {
    it('forces black for Koishi’s hat-shaped mousse', () => {
      const mousse = resolveDishTags(cuisine('Unconscious Youkai Mousse'));
      const koishi = rare({ name: 'Komeiji Koishi', prefCuisine: [...mousse.tags] });
      const verdict = rateRare({}, mousse, GREEN_TEA(), koishi);
      expect(verdict.rating).toBe('black');
      expect(verdict.override).toBeDefined();
    });

    it('forces pink for Remilia’s hat-shaped cake', () => {
      const cake = resolveDishTags(cuisine('Scarlet Devil Cake'));
      const remilia = rare({ name: 'Remilia Scarlet', dislikeCuisine: [...cake.tags] });
      const verdict = rateRare({}, cake, GREEN_TEA(), remilia);
      expect(verdict.rating).toBe('pink');
    });

    it('floors Nitori at orange for anything with cucumber', () => {
      const withCucumber = resolveDishTags(cuisine('Rice Ball'), [ingredient('Cucumber')]);
      const nitori = rare({
        name: 'Kawashiro Nitori',
        dislikeCuisine: [...withCucumber.tags],
      });
      const verdict = rateRare({}, withCucumber, GREEN_TEA(), nitori);
      expect(verdict.points).toBeLessThan(0);
      expect(verdict.rating).toBe('orange');
    });

    it('floors Medicine at orange for Dark Matter', () => {
      const ruined = resolveDishTags(cuisine('Grilled Lamprey'), [ingredient('Pork')]);
      const medicine = rare({ name: 'Medicine Melancholy' });
      const verdict = rateRare({}, ruined, GREEN_TEA(), medicine);
      expect(verdict.rating).toBe('orange');
    });

    it('leaves other customers unaffected by those rules', () => {
      const withCucumber = resolveDishTags(cuisine('Rice Ball'), [ingredient('Cucumber')]);
      const someoneElse = rare({ dislikeCuisine: [...withCucumber.tags] });
      expect(rateRare({}, withCucumber, GREEN_TEA(), someoneElse).rating).toBe('black');
    });
  });
});

describe('rating consequences', () => {
  it('breaks the combo on black and purple only', () => {
    expect(breaksCombo('black')).toBe(true);
    expect(breaksCombo('purple')).toBe(true);
    expect(breaksCombo('green')).toBe(false);
    expect(breaksCombo('orange')).toBe(false);
    expect(breaksCombo('pink')).toBe(false);
  });

  it('moves satisfaction in the right direction', () => {
    expect(satisfactionDelta('black')).toBeLessThan(0);
    expect(satisfactionDelta('purple')).toBeLessThan(0);
    expect(satisfactionDelta('green')).toBe(0);
    expect(satisfactionDelta('pink')).toBeGreaterThan(satisfactionDelta('orange'));
  });
});
