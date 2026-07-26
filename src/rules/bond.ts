/**
 * Rare-customer bonds. Feeding a named guest well raises their bond level,
 * which unlocks their side quests, their recipes, and the ability to invite
 * them to areas they do not normally frequent.
 */

import type { Rating } from './rating';

/** Bond points earned per rating. A ruined meal costs you standing. */
const BOND_POINTS: Record<Rating, number> = {
  black: -20,
  purple: -8,
  green: 2,
  orange: 10,
  pink: 25,
};

/** Cumulative points needed to reach each level; index is the level. */
export const BOND_THRESHOLDS = [0, 40, 110, 230, 420, 700, 1100];
export const MAX_BOND_LEVEL = BOND_THRESHOLDS.length - 1;

export interface BondState {
  points: number;
  level: number;
}

export const emptyBond = (): BondState => ({ points: 0, level: 0 });

export const bondLevelFor = (points: number): number => {
  let level = 0;
  for (let i = 1; i < BOND_THRESHOLDS.length; i++) {
    if (points >= (BOND_THRESHOLDS[i] as number)) level = i;
  }
  return level;
};

export interface BondDelta {
  gained: number;
  points: number;
  level: number;
  leveledUp: boolean;
}

export function applyBond(current: BondState, rating: Rating): BondDelta {
  const gained = BOND_POINTS[rating];
  const points = Math.max(0, current.points + gained);
  const level = bondLevelFor(points);
  return { gained, points, level, leveledUp: level > current.level };
}

/** Progress towards the next level, 0-1. Returns 1 at max level. */
export function bondProgress(state: BondState): number {
  if (state.level >= MAX_BOND_LEVEL) return 1;
  const floor = BOND_THRESHOLDS[state.level] as number;
  const ceil = BOND_THRESHOLDS[state.level + 1] as number;
  return Math.min(1, Math.max(0, (state.points - floor) / (ceil - floor)));
}

/** Guests can be invited outside their home areas once you are close enough. */
export const INVITE_BOND_LEVEL = 3;
export const canInvite = (state: BondState): boolean => state.level >= INVITE_BOND_LEVEL;
