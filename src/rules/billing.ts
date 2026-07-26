/**
 * Money: what a serving costs the guest, what they will actually pay, and the
 * tip on top.
 */

import type { Beverage, RareCustomer } from '../data/types';
import type { Rating } from './rating';
import type { ResolvedDish } from './tags';

export interface BillModifiers {
  /** Flat percentage added to the tip, e.g. from the Maneki-neko. */
  tipBonusPercent?: number;
  /** Multiplier on the food price, e.g. from izakaya level or a spell card. */
  priceMultiplier?: number;
}

export interface Bill {
  dishPrice: number;
  drinkPrice: number;
  /** Dish plus drink, before tip. */
  total: number;
}

/**
 * A dish is worth its recipe price plus the value of everything added to it.
 * Dark Matter is worthless no matter what went into it.
 */
export function computeBill(
  dish: ResolvedDish,
  drink: Beverage,
  mods: BillModifiers = {},
): Bill {
  const multiplier = mods.priceMultiplier ?? 1;
  const additions = dish.added.reduce((sum, ing) => sum + ing.value, 0);
  const dishPrice = dish.darkMatter ? 0 : Math.round((dish.cuisine.cost + additions) * multiplier);
  const drinkPrice = Math.round(drink.cost * multiplier);
  return { dishPrice, drinkPrice, total: dishPrice + drinkPrice };
}

/** Better ratings tip better; a black rating leaves nothing behind. */
const TIP_RATE: Record<Rating, number> = {
  black: 0,
  purple: 0,
  green: 0.05,
  orange: 0.12,
  pink: 0.25,
};

export const computeTip = (bill: Bill, rating: Rating, mods: BillModifiers = {}): number =>
  Math.round(bill.total * (TIP_RATE[rating] + (mods.tipBonusPercent ?? 0) / 100));

export interface Payment {
  /** What the guest was charged. */
  billed: number;
  /** What they were actually able to hand over. */
  paid: number;
  tip: number;
  /** True when the bill blew past what they brought with them. */
  overBudget: boolean;
  /** A badly overpriced meal makes them storm out. */
  severity: 'none' | 'minor' | 'major';
}

/**
 * Rares carry a fixed purse. Going over it means they pay what they have and
 * leave immediately — mildly disappointed if it was close, furious if not.
 */
export function settleRare(
  bill: Bill,
  rating: Rating,
  customer: RareCustomer,
  mods: BillModifiers = {},
): Payment {
  const budget = customer.budget.max;
  if (bill.total <= budget) {
    return {
      billed: bill.total,
      paid: bill.total,
      tip: computeTip(bill, rating, mods),
      overBudget: false,
      severity: 'none',
    };
  }
  // Within a quarter over is a grumble; beyond that is a scene.
  const overshoot = (bill.total - budget) / Math.max(1, budget);
  return {
    billed: bill.total,
    paid: budget,
    tip: 0,
    overBudget: true,
    severity: overshoot <= 0.25 ? 'minor' : 'major',
  };
}

/** Commons always pay in full — they order off the menu and know the prices. */
export const settleCommon = (bill: Bill, rating: Rating, mods: BillModifiers = {}): Payment => ({
  billed: bill.total,
  paid: bill.total,
  tip: computeTip(bill, rating, mods),
  overBudget: false,
  severity: 'none',
});

/** Partners take their cut of the night's gross before it reaches the till. */
export const applyPartnerShare = (gross: number, sharePercent: number): number =>
  Math.round(gross * (1 - sharePercent / 100));
