/**
 * Tag resolution: turning a recipe plus whatever was thrown into the pot into
 * the final set of tags a customer actually judges.
 *
 * Mechanics follow the game's documented behaviour:
 *  - A dish carries innate ("pink") tags from its recipe.
 *  - Every ingredient added on top contributes *all* of its own tags ("orange").
 *  - A dish holds at most 5 ingredients in total, counting the recipe's own.
 *  - Filling all 5 slots automatically adds Large Portion.
 *  - Adding a tag the recipe lists as forbidden ("black") ruins it into Dark Matter.
 *  - Price thresholds add Expensive / Economical.
 *  - Whichever tag is currently trending also carries a Trend tag.
 *  - Finally, five override pairs strike the losing tag out of the result.
 */

import { TAGS } from '../data';
import type { Cuisine, CuisineTag, Ingredient } from '../data/types';

export const MAX_INGREDIENTS = TAGS.thresholds.maxIngredients;
export const DARK_MATTER: CuisineTag = 'Dark Matter';

export interface TrendState {
  /** The tag currently in fashion; dishes carrying it also gain Trend - Popular. */
  popular: CuisineTag | null;
  /** The tag currently out of fashion; carriers gain Trend - Unpopular. */
  unpopular: CuisineTag | null;
}

export const NO_TRENDS: TrendState = { popular: null, unpopular: null };

export interface ResolvedDish {
  cuisine: Cuisine;
  /** Ingredients added on top of the recipe's own. */
  added: Ingredient[];
  /** Recipe ingredients plus additions. */
  ingredientCount: number;
  /** Effective tags after strikes — this is what customers are rated against. */
  tags: Set<CuisineTag>;
  /** Tags contributed by added ingredients (and by hitting 5 slots). */
  addedTags: Set<CuisineTag>;
  /** Tags removed by a higher-priority tag, kept for the UI's strikethrough. */
  struck: CuisineTag[];
  /** True when an addition collided with one of the recipe's forbidden tags. */
  darkMatter: boolean;
  /** The forbidden tags that were violated, for the failure message. */
  violated: CuisineTag[];
}

/** How many more ingredients this recipe can still take. */
export const freeSlots = (cuisine: Cuisine): number =>
  Math.max(0, MAX_INGREDIENTS - cuisine.ingredients.length);

export function resolveDishTags(
  cuisine: Cuisine,
  added: Ingredient[] = [],
  trends: TrendState = NO_TRENDS,
): ResolvedDish {
  const capacity = freeSlots(cuisine);
  const accepted = added.slice(0, capacity);
  const ingredientCount = cuisine.ingredients.length + accepted.length;

  const innate = new Set<CuisineTag>(cuisine.props);
  const addedTags = new Set<CuisineTag>();
  for (const ing of accepted) for (const tag of ing.props) addedTags.add(tag);

  // A forbidden tag arriving via an addition ruins the dish outright.
  const forbidden = new Set<CuisineTag>(cuisine.xprops);
  const violated = [...addedTags].filter((tag) => forbidden.has(tag));
  if (violated.length > 0) {
    return {
      cuisine,
      added: accepted,
      ingredientCount,
      tags: new Set<CuisineTag>([DARK_MATTER]),
      addedTags,
      struck: [],
      darkMatter: true,
      violated,
    };
  }

  // Filling every slot bulks the dish up.
  if (ingredientCount >= MAX_INGREDIENTS) addedTags.add('Large Portion');

  const tags = new Set<CuisineTag>([...innate, ...addedTags]);

  // Price bands are a property of the recipe, not of what was added to it.
  if (cuisine.cost > TAGS.thresholds.expensiveAbove) tags.add('Expensive');
  if (cuisine.cost < TAGS.thresholds.economicalBelow) tags.add('Economical');

  // Fashion rides along with whichever tag is currently trending.
  if (trends.popular && tags.has(trends.popular)) tags.add(TAGS.trend.popular);
  if (trends.unpopular && tags.has(trends.unpopular)) tags.add(TAGS.trend.unpopular);

  const struck: CuisineTag[] = [];
  for (const [winner, loser] of TAGS.priority) {
    if (tags.has(winner) && tags.has(loser)) {
      tags.delete(loser);
      struck.push(loser);
    }
  }

  return {
    cuisine,
    added: accepted,
    ingredientCount,
    tags,
    addedTags,
    struck,
    darkMatter: false,
    violated: [],
  };
}

/** Tags an addition would contribute that the dish does not already carry. */
export function previewAddition(
  resolved: ResolvedDish,
  candidate: Ingredient,
): { gains: CuisineTag[]; ruins: CuisineTag[] } {
  const forbidden = new Set<CuisineTag>(resolved.cuisine.xprops);
  const gains: CuisineTag[] = [];
  const ruins: CuisineTag[] = [];
  for (const tag of candidate.props) {
    if (forbidden.has(tag)) ruins.push(tag);
    else if (!resolved.tags.has(tag)) gains.push(tag);
  }
  return { gains, ruins };
}
