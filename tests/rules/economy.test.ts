import { describe, expect, it } from 'vitest';

import { beverage, cuisine, ingredient } from '../../src/data';
import type { RareCustomer } from '../../src/data/types';
import {
  applyPartnerShare,
  computeBill,
  computeTip,
  settleCommon,
  settleRare,
} from '../../src/rules/billing';
import {
  BOND_THRESHOLDS,
  MAX_BOND_LEVEL,
  applyBond,
  bondProgress,
  canInvite,
  emptyBond,
} from '../../src/rules/bond';
import { TREND_PERIOD_DAYS, currentTrends, daysUntilTrendChange } from '../../src/rules/trend';
import { resolveDishTags } from '../../src/rules/tags';

const purse = (max: number): RareCustomer =>
  ({
    name: 'Test Rare',
    kind: 'rare',
    shortName: 'Test',
    budget: { min: 0, max },
    locations: [],
    prefCuisine: [],
    dislikeCuisine: [],
    prefBeverage: [],
    release: 'BaseGame',
  }) as RareCustomer;

describe('computeBill', () => {
  it('charges the recipe price plus the value of every addition', () => {
    const lamprey = cuisine('Grilled Lamprey'); // 22¥
    const egg = ingredient('Egg'); // 4¥, and Raw does not clash with the recipe
    const dish = resolveDishTags(lamprey, [egg]);
    expect(dish.darkMatter).toBe(false);
    const bill = computeBill(dish, beverage('Green Tea'));

    expect(bill.dishPrice).toBe(lamprey.cost + egg.value);
    expect(bill.drinkPrice).toBe(beverage('Green Tea').cost);
    expect(bill.total).toBe(bill.dishPrice + bill.drinkPrice);
  });

  it('charges nothing for the dish when it is Dark Matter', () => {
    const ruined = resolveDishTags(cuisine('Grilled Lamprey'), [ingredient('Pork')]);
    const bill = computeBill(ruined, beverage('Green Tea'));
    expect(ruined.darkMatter).toBe(true);
    expect(bill.dishPrice).toBe(0);
    // The drink was still fine.
    expect(bill.drinkPrice).toBeGreaterThan(0);
  });

  it('applies a price multiplier', () => {
    const dish = resolveDishTags(cuisine('Grilled Lamprey'));
    const plain = computeBill(dish, beverage('Green Tea'));
    const doubled = computeBill(dish, beverage('Green Tea'), { priceMultiplier: 2 });
    expect(doubled.total).toBe(plain.total * 2);
  });
});

describe('tips', () => {
  const bill = { dishPrice: 100, drinkPrice: 0, total: 100 };

  it('scales with the rating and pays nothing for a bad one', () => {
    expect(computeTip(bill, 'black')).toBe(0);
    expect(computeTip(bill, 'purple')).toBe(0);
    expect(computeTip(bill, 'green')).toBeGreaterThan(0);
    expect(computeTip(bill, 'pink')).toBeGreaterThan(computeTip(bill, 'orange'));
  });

  it('adds the Maneki-neko bonus', () => {
    expect(computeTip(bill, 'orange', { tipBonusPercent: 15 })).toBeGreaterThan(
      computeTip(bill, 'orange'),
    );
  });
});

describe('settling up', () => {
  it('lets a common customer pay in full', () => {
    const payment = settleCommon({ dishPrice: 40, drinkPrice: 10, total: 50 }, 'orange');
    expect(payment.paid).toBe(50);
    expect(payment.overBudget).toBe(false);
    expect(payment.tip).toBeGreaterThan(0);
  });

  it('lets a rare customer within budget pay in full', () => {
    const payment = settleRare({ dishPrice: 90, drinkPrice: 10, total: 100 }, 'pink', purse(300));
    expect(payment.paid).toBe(100);
    expect(payment.overBudget).toBe(false);
  });

  it('caps payment at the purse and drops the tip when over budget', () => {
    const payment = settleRare({ dishPrice: 400, drinkPrice: 0, total: 400 }, 'pink', purse(200));
    expect(payment.overBudget).toBe(true);
    expect(payment.paid).toBe(200);
    expect(payment.billed).toBe(400);
    expect(payment.tip).toBe(0);
  });

  it('treats a small overshoot as minor and a large one as major', () => {
    expect(settleRare({ dishPrice: 210, drinkPrice: 0, total: 210 }, 'green', purse(200)).severity)
      .toBe('minor');
    expect(settleRare({ dishPrice: 400, drinkPrice: 0, total: 400 }, 'green', purse(200)).severity)
      .toBe('major');
  });
});

describe('applyPartnerShare', () => {
  it('withholds the partner’s cut', () => {
    expect(applyPartnerShare(1000, 5)).toBe(950);
    expect(applyPartnerShare(1000, 0)).toBe(1000);
  });
});

describe('bonds', () => {
  it('gains on good ratings and loses on bad ones', () => {
    expect(applyBond(emptyBond(), 'pink').gained).toBeGreaterThan(0);
    expect(applyBond({ points: 100, level: 1 }, 'black').gained).toBeLessThan(0);
  });

  it('never drops below zero points', () => {
    expect(applyBond(emptyBond(), 'black').points).toBe(0);
  });

  it('levels up when a threshold is crossed', () => {
    const justUnder = (BOND_THRESHOLDS[1] as number) - 1;
    const result = applyBond({ points: justUnder, level: 0 }, 'pink');
    expect(result.level).toBe(1);
    expect(result.leveledUp).toBe(true);
  });

  it('reports progress towards the next level', () => {
    expect(bondProgress({ points: 0, level: 0 })).toBe(0);
    expect(bondProgress({ points: BOND_THRESHOLDS[MAX_BOND_LEVEL] as number, level: MAX_BOND_LEVEL }))
      .toBe(1);
  });

  it('unlocks invitations partway up the track', () => {
    expect(canInvite({ points: 0, level: 0 })).toBe(false);
    expect(canInvite({ points: 9999, level: MAX_BOND_LEVEL })).toBe(true);
  });
});

describe('trends', () => {
  it('is stable within a period and changes between them', () => {
    const first = currentTrends(0);
    expect(currentTrends(TREND_PERIOD_DAYS - 1)).toEqual(first);

    // Some later period must differ, or the rotation is broken.
    const laterPeriods = [1, 2, 3, 4, 5].map((p) => currentTrends(p * TREND_PERIOD_DAYS));
    expect(laterPeriods.some((t) => t.popular !== first.popular)).toBe(true);
  });

  it('never makes the same tag popular and unpopular', () => {
    for (let day = 0; day < 400; day += 3) {
      const { popular, unpopular } = currentTrends(day);
      expect(popular).not.toBe(unpopular);
    }
  });

  it('never picks a bookkeeping tag', () => {
    const forbidden = new Set(['Dark Matter', 'Expensive', 'Economical', 'Trend - Popular']);
    for (let day = 0; day < 400; day += 3) {
      const { popular, unpopular } = currentTrends(day);
      expect(forbidden.has(popular as string)).toBe(false);
      expect(forbidden.has(unpopular as string)).toBe(false);
    }
  });

  it('differs between save seeds', () => {
    const a = Array.from({ length: 8 }, (_, i) => currentTrends(i * TREND_PERIOD_DAYS, 'seed-a'));
    const b = Array.from({ length: 8 }, (_, i) => currentTrends(i * TREND_PERIOD_DAYS, 'seed-b'));
    expect(a).not.toEqual(b);
  });

  it('counts down to the next rotation', () => {
    expect(daysUntilTrendChange(0)).toBe(TREND_PERIOD_DAYS);
    expect(daysUntilTrendChange(TREND_PERIOD_DAYS - 1)).toBe(1);
  });
});
