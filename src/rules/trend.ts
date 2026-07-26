/**
 * Food fashions. Two tags are in play at any time — one popular, one not — and
 * they rotate on a fixed in-game schedule. The game never states them outright;
 * you read the Bunbunmaru in the album to find out what is hot this week.
 */

import { TAGS } from '../data';
import type { CuisineTag } from '../data/types';
import { hashSeed, mulberry32 } from '../core/rng';
import type { TrendState } from './tags';

/** Days a single fashion lasts before the paper prints a new one. */
export const TREND_PERIOD_DAYS = 7;

/**
 * Tags that make sense as a fashion — the bookkeeping tags (price bands, Dark
 * Matter, the Trend tags themselves) are excluded.
 */
const NON_TRENDABLE = new Set<string>([
  'Dark Matter',
  'Expensive',
  'Economical',
  'Trend - Popular',
  'Trend - Unpopular',
  'Divine Punishment',
  'Poison',
]);

export const TRENDABLE_TAGS: CuisineTag[] = TAGS.cuisine
  .map((t) => t.name as CuisineTag)
  .filter((t) => !NON_TRENDABLE.has(t));

/**
 * Deterministic for a given save seed and day, so the newspaper, the tag
 * badges, and the rating maths never disagree with each other.
 */
export function currentTrends(day: number, seed = 'gensokyo'): TrendState {
  const period = Math.floor(Math.max(0, day) / TREND_PERIOD_DAYS);
  const rand = mulberry32(hashSeed(`${seed}:trend:${period}`));

  const pool = TRENDABLE_TAGS;
  if (pool.length < 2) return { popular: null, unpopular: null };

  const a = Math.floor(rand() * pool.length);
  let b = Math.floor(rand() * (pool.length - 1));
  if (b >= a) b += 1; // never pick the same tag twice

  return { popular: pool[a] as CuisineTag, unpopular: pool[b] as CuisineTag };
}

/** Days until the current fashion is replaced. */
export const daysUntilTrendChange = (day: number): number =>
  TREND_PERIOD_DAYS - (Math.max(0, day) % TREND_PERIOD_DAYS);
