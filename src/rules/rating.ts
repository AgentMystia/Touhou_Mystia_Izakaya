/**
 * How guests judge what they were served.
 *
 * Common customers and rare customers are scored by completely different rules,
 * so they get separate entry points. Both return a `Rating`, which drives the
 * reaction art, the combo meter, satisfaction, and spell cards.
 */

import type { Beverage, BeverageTag, CommonCustomer, CuisineTag, RareCustomer } from '../data/types';
import { DARK_MATTER, type ResolvedDish } from './tags';

/** Worst to best. Commons can only reach Black / Green / Orange. */
export type Rating = 'black' | 'purple' | 'green' | 'orange' | 'pink';

export const RATING_ORDER: Rating[] = ['black', 'purple', 'green', 'orange', 'pink'];
const rank = (r: Rating) => RATING_ORDER.indexOf(r);
const worseOf = (a: Rating, b: Rating): Rating => (rank(a) <= rank(b) ? a : b);

/** What a guest asked for when they sat down. */
export interface Order {
  /** Commons name an exact dish and drink off the menu. */
  dish?: string;
  drink?: string;
  /** Rares instead name a tag they want on each. */
  dishTag?: CuisineTag;
  drinkTag?: BeverageTag;
}

export interface CommonVerdict {
  rating: Rating;
  servedRequested: boolean;
  /** An added tag matched the guest's tastes, which is what lifts Green to Orange. */
  matchedAddedTags: CuisineTag[];
}

/**
 * Commons are simple: bring what was ordered, and season it to their taste.
 *
 * Black  — anything other than the exact dish and drink they asked for.
 * Green  — both requested items served.
 * Orange — that, plus at least one *added* tag matching their preferences.
 */
export function rateCommon(
  order: Order,
  dish: ResolvedDish,
  drink: Beverage,
  customer: CommonCustomer,
): CommonVerdict {
  const servedRequested = order.dish === dish.cuisine.name && order.drink === drink.name;
  if (!servedRequested) {
    return { rating: 'black', servedRequested: false, matchedAddedTags: [] };
  }

  const liked = new Set<string>(customer.prefCuisine);
  // Only tags that survived the priority strikes still count.
  const matchedAddedTags = [...dish.addedTags].filter(
    (t) => dish.tags.has(t) && (customer.likesAnyTag || liked.has(t)),
  );

  return {
    rating: matchedAddedTags.length > 0 ? 'orange' : 'green',
    servedRequested: true,
    matchedAddedTags,
  };
}

export interface RareVerdict {
  rating: Rating;
  /** Net score before the request-fulfilment cap is applied. */
  points: number;
  /** How many of the two requested tags were actually delivered (0-2). */
  fulfilled: number;
  liked: CuisineTag[];
  likedDrink: BeverageTag[];
  disliked: CuisineTag[];
  /** Set when a character-specific interaction overrode the normal maths. */
  override?: string;
  /** True when the dish was cooked on Night Sparrow gear, waiving the request. */
  requestWaived: boolean;
}

export interface RareContext {
  /**
   * Night Sparrow cookware played perfectly (or in hyper mode) makes a rare
   * guest ignore the specific tags they asked for.
   */
  nightSparrow?: boolean;
  /** Medicine's reward card stops black tags from ruining a dish. */
  ignoreDarkMatter?: boolean;
}

/**
 * Character-specific interactions that take priority over the point total.
 * Each clamps the rating rather than replacing the score outright, except the
 * two hat-shaped dishes, which are hard overrides.
 */
interface SpecialCase {
  customer: string;
  /** Applied when the predicate matches. */
  apply: (rating: Rating) => Rating;
  reason: string;
  matches: (dish: ResolvedDish) => boolean;
}

const SPECIAL_CASES: SpecialCase[] = [
  {
    customer: 'Komeiji Koishi',
    matches: (d) => d.cuisine.name === 'Unconscious Youkai Mousse',
    apply: () => 'black',
    reason: 'Koishi will not eat something shaped like her own hat.',
  },
  {
    customer: 'Remilia Scarlet',
    matches: (d) => d.cuisine.name === 'Scarlet Devil Cake',
    apply: () => 'pink',
    reason: 'Remilia is delighted by a cake shaped like her hat.',
  },
  {
    customer: 'Kawashiro Nitori',
    matches: (d) =>
      d.cuisine.ingredients.includes('Cucumber') || d.added.some((i) => i.name === 'Cucumber'),
    apply: (r) => (rank(r) < rank('orange') ? 'orange' : r),
    reason: 'Nitori forgives anything containing cucumber.',
  },
  {
    customer: 'Medicine Melancholy',
    matches: (d) => d.darkMatter,
    apply: (r) => (rank(r) < rank('orange') ? 'orange' : r),
    reason: 'Medicine is fond of poison.',
  },
];

/**
 * Rares score their meal tag by tag:
 *   +1 per liked tag on the dish and on the drink, −1 per disliked tag on the
 *   dish, and −2 for Dark Matter. The total maps to a rating, then a cap is
 *   applied for each requested tag that was not delivered.
 */
export function rateRare(
  order: Order,
  dish: ResolvedDish,
  drink: Beverage,
  customer: RareCustomer,
  context: RareContext = {},
): RareVerdict {
  const likes = new Set<string>(customer.prefCuisine);
  const dislikes = new Set<string>(customer.dislikeCuisine);
  const drinkLikes = new Set<string>(customer.prefBeverage);
  const any = customer.likesAnyTag;

  const liked = [...dish.tags].filter((t) => (any || likes.has(t)) && !dislikes.has(t));
  const disliked = [...dish.tags].filter((t) => dislikes.has(t));
  const likedDrink = drink.props.filter((t) => any || drinkLikes.has(t));

  let points = liked.length + likedDrink.length - disliked.length;
  if (dish.darkMatter && !context.ignoreDarkMatter) points -= 2;

  // Night Sparrow gear waives the specific request, so nothing is left uncapped.
  const requestWaived = context.nightSparrow === true;
  const dishAsked = order.dishTag !== undefined;
  const drinkAsked = order.drinkTag !== undefined;
  const dishHit = !dishAsked || dish.tags.has(order.dishTag as CuisineTag);
  const drinkHit = !drinkAsked || drink.props.includes(order.drinkTag as BeverageTag);
  const asked = (dishAsked ? 1 : 0) + (drinkAsked ? 1 : 0);
  const fulfilled = requestWaived
    ? asked
    : (dishAsked && dishHit ? 1 : 0) + (drinkAsked && drinkHit ? 1 : 0);

  let rating: Rating =
    points <= 0 ? 'black' : points === 1 ? 'purple' : points === 2 ? 'green' : points === 3 ? 'orange' : 'pink';

  // Missing what they actually asked for caps how happy they can be.
  if (!requestWaived && asked > 0) {
    const missed = asked - fulfilled;
    if (missed >= 2) rating = worseOf(rating, 'purple');
    else if (missed === 1) rating = worseOf(rating, 'orange');
  }

  let override: string | undefined;
  for (const rule of SPECIAL_CASES) {
    if (rule.customer !== customer.name || !rule.matches(dish)) continue;
    const adjusted = rule.apply(rating);
    if (adjusted !== rating) {
      rating = adjusted;
      override = rule.reason;
    }
  }

  return { rating, points, fulfilled, liked, likedDrink, disliked, override, requestWaived };
}

/** Ratings at or below Purple break a serving combo. */
export const breaksCombo = (rating: Rating): boolean => rank(rating) <= rank('purple');

/** Black triggers a punishment card; Pink triggers a reward card. */
export const triggersPunishment = (rating: Rating): boolean => rating === 'black';
export const triggersReward = (rating: Rating): boolean => rating === 'pink';

/** Satisfaction moves with the rating; Pink climbs fastest. */
export const satisfactionDelta = (rating: Rating): number =>
  ({ black: -12, purple: -6, green: 0, orange: 8, pink: 16 })[rating];

export const DARK_MATTER_TAG = DARK_MATTER;
