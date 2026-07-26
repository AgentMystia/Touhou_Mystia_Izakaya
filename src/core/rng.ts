/**
 * Seeded randomness. Every roll the simulation makes goes through here so a
 * save can be replayed exactly — trends, customer arrivals, and gathering
 * drops all derive from the save's seed rather than Math.random.
 */

export type Rand = () => number;

/** Small fast PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, for deriving a numeric seed from a label. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0;

/** Integer in [min, max], inclusive. */
export const randInt = (rand: Rand, min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

export const randFloat = (rand: Rand, min: number, max: number): number =>
  min + rand() * (max - min);

export const chance = (rand: Rand, probability: number): boolean => rand() < probability;

export function pick<T>(rand: Rand, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rand() * items.length)];
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(rand: Rand, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Picks `count` distinct items, or as many as exist. */
export function sample<T>(rand: Rand, items: readonly T[], count: number): T[] {
  return shuffle(rand, items).slice(0, Math.min(count, items.length));
}
