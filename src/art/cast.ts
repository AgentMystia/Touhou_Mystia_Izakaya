/**
 * The cast, as specs for the chibi rig in `characters.ts`.
 *
 * These are original renditions built from each character's recognisable
 * features — hair mass and colour, wings, hat, ears — not copies of any
 * artwork. Touhou's fan-work policy permits depicting ZUN's characters.
 *
 * Rare customers that have no hand-written entry fall back to a spec derived
 * from their name, so all 45 are drawable from day one.
 */

import { hashSeed, mulberry32 } from '../core/rng';
import type {
  Bangs,
  CharacterSpec,
  Ears,
  HairStyle,
  Headwear,
  Outfit,
  Wings,
} from './characters';

type Partial2 = Omit<CharacterSpec, 'id' | 'name' | 'short' | 'idle' | 'build'> &
  Partial<Pick<CharacterSpec, 'build' | 'idle'>>;

const DEFAULT_IDLE = { bobAmp: 1.6, bobHz: 0.5, swayDeg: 1.2 };

const spec = (id: string, name: string, short: string, body: Partial2): CharacterSpec => ({
  id,
  name,
  short,
  build: body.build ?? 1,
  idle: body.idle ?? DEFAULT_IDLE,
  palette: body.palette,
  hair: body.hair,
  bangs: body.bangs,
  headwear: body.headwear,
  wings: body.wings,
  ears: body.ears,
  outfit: body.outfit,
});

/** The player character: pink hair, night-sparrow wings, feathered ear tufts. */
export const MYSTIA: CharacterSpec = spec('mystia', 'Mystia Lorelei', 'Mystia', {
  // A dusky mauve dress rather than near-white: under lantern light a white
  // outfit blows straight out and the silhouette disappears.
  palette: {
    hair: '#efa2bd',
    eye: '#e04f76',
    skin: '#ffdcc9',
    main: '#6d4a63',
    accent: '#c9789c',
    trim: '#e8d6c0',
  },
  hair: 'short',
  bangs: 'split',
  headwear: 'none',
  wings: 'bird',
  ears: 'bird',
  outfit: 'dress',
  idle: { bobAmp: 2.2, bobHz: 0.62, swayDeg: 1.8 },
});

const ROSTER: CharacterSpec[] = [
  MYSTIA,

  // --- Youkai Trail
  spec('wriggle', 'Wriggle Nightbug', 'Wriggle', {
    palette: { hair: '#5fa86a', eye: '#3f7d4a', skin: '#ffe2cf', main: '#2f3a4a', accent: '#7fc98a', trim: '#e8e2c8' },
    hair: 'short', bangs: 'swept', headwear: 'none', wings: 'fairy', ears: 'none', outfit: 'shirt',
    idle: { bobAmp: 2.4, bobHz: 0.7, swayDeg: 2 },
  }),
  spec('chen', 'Chen', 'Chen', {
    palette: { hair: '#8a4a2a', eye: '#d4823a', skin: '#ffe4d2', main: '#d8443c', accent: '#3fa04a', trim: '#f0d878' },
    hair: 'braids', bangs: 'blunt', headwear: 'mob', wings: 'none', ears: 'cat', outfit: 'dress',
    build: 0.88, idle: { bobAmp: 2.6, bobHz: 0.8, swayDeg: 2.4 },
  }),
  spec('rumia', 'Rumia', 'Rumia', {
    palette: { hair: '#f2d98a', eye: '#c0392b', skin: '#ffe2d0', main: '#20202c', accent: '#c94a4a', trim: '#f2f0ea' },
    hair: 'bob', bangs: 'blunt', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'dress',
    build: 0.9,
  }),

  // --- Human Village
  spec('akyuu', 'Hieda no Akyuu', 'Akyuu', {
    palette: { hair: '#6f4a8a', eye: '#8a5aa8', skin: '#ffe6d6', main: '#e07a9a', accent: '#f0dcc0', trim: '#9a6ab0' },
    hair: 'bob', bangs: 'blunt', headwear: 'flower', wings: 'none', ears: 'none', outfit: 'kimono',
    build: 0.92, idle: { bobAmp: 1.1, bobHz: 0.38, swayDeg: 0.8 },
  }),
  spec('keine', 'Keine Kamishirasawa', 'Keine', {
    palette: { hair: '#c8d0e0', eye: '#4a6aa8', skin: '#ffe4d4', main: '#2f5a8a', accent: '#f0efe8', trim: '#c04a5a' },
    hair: 'long', bangs: 'blunt', headwear: 'cap', wings: 'none', ears: 'none', outfit: 'dress',
    build: 1.08, idle: { bobAmp: 1.2, bobHz: 0.4, swayDeg: 0.9 },
  }),
  spec('kasen', 'Kasen Ibaraki', 'Kasen', {
    palette: { hair: '#e2919f', eye: '#c05a6a', skin: '#ffe4d2', main: '#e8e4d8', accent: '#c0405a', trim: '#7a5a8a' },
    hair: 'twin', bangs: 'split', headwear: 'flower', wings: 'none', ears: 'none', outfit: 'kimono',
    build: 1.04,
  }),

  // --- Hakurei Shrine
  spec('reimu', 'Reimu Hakurei', 'Reimu', {
    palette: { hair: '#3a2028', eye: '#8a2a3a', skin: '#ffe6d6', main: '#d4353f', accent: '#e0454f', trim: '#f4f2ec' },
    hair: 'long', bangs: 'blunt', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'miko',
    idle: { bobAmp: 1.3, bobHz: 0.42, swayDeg: 1 },
  }),
  spec('suika', 'Suika Ibuki', 'Suika', {
    palette: { hair: '#e08a3a', eye: '#c0442a', skin: '#ffe0c8', main: '#f0e2d0', accent: '#7a3a5a', trim: '#4a3a6a' },
    hair: 'long', bangs: 'swept', headwear: 'horns', wings: 'none', ears: 'none', outfit: 'dress',
    build: 0.94, idle: { bobAmp: 2.8, bobHz: 0.34, swayDeg: 3.2 },
  }),
  spec('tenshi', 'Tenshi Hinanawi', 'Tenshi', {
    palette: { hair: '#6a9ad0', eye: '#d04a6a', skin: '#ffe6d6', main: '#f0f0ea', accent: '#3a6ab0', trim: '#e8c85a' },
    hair: 'long', bangs: 'split', headwear: 'cap', wings: 'none', ears: 'none', outfit: 'dress',
    build: 1.02,
  }),

  // --- Scarlet Devil Mansion
  spec('meiling', 'Hong Meiling', 'Meiling', {
    palette: { hair: '#c8443a', eye: '#4a9a6a', skin: '#ffe4d2', main: '#2f7a5a', accent: '#f0efe6', trim: '#e8c04a' },
    hair: 'long', bangs: 'split', headwear: 'cap', wings: 'none', ears: 'none', outfit: 'robe',
    build: 1.12,
  }),
  spec('cirno', 'Cirno', 'Cirno', {
    palette: { hair: '#7ec8f0', eye: '#3aa8e0', skin: '#ffe8dc', main: '#3f6ac0', accent: '#f4f6f8', trim: '#8fd8f8' },
    hair: 'short', bangs: 'blunt', headwear: 'ribbon', wings: 'ice', ears: 'none', outfit: 'dress',
    build: 0.86, idle: { bobAmp: 3, bobHz: 0.95, swayDeg: 3 },
  }),
  spec('patchouli', 'Patchouli Knowledge', 'Patchouli', {
    palette: { hair: '#a88ac8', eye: '#8a6ab0', skin: '#f6e2e0', main: '#c86a9a', accent: '#e8e0f0', trim: '#f0d878' },
    hair: 'long', bangs: 'blunt', headwear: 'mob', wings: 'none', ears: 'none', outfit: 'robe',
    build: 0.98, idle: { bobAmp: 0.8, bobHz: 0.26, swayDeg: 0.5 },
  }),

  // --- Bamboo Forest of the Lost
  spec('mokou', 'Fujiwara no Mokou', 'Mokou', {
    palette: { hair: '#e8e4dc', eye: '#c0442a', skin: '#ffe2ce', main: '#b03a3a', accent: '#3a3a4a', trim: '#e0a04a' },
    hair: 'long', bangs: 'swept', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'shirt',
    build: 1.06,
  }),
  spec('kaguya', 'Kaguya Houraisan', 'Kaguya', {
    palette: { hair: '#2a2030', eye: '#8a4a6a', skin: '#ffe8dc', main: '#c03a4a', accent: '#f0e8d8', trim: '#d8a84a' },
    hair: 'long', bangs: 'blunt', headwear: 'none', wings: 'none', ears: 'none', outfit: 'kimono',
    build: 1.04, idle: { bobAmp: 1, bobHz: 0.3, swayDeg: 0.7 },
  }),
  spec('tewi', 'Tewi Inaba', 'Tewi', {
    palette: { hair: '#2a2028', eye: '#c04a5a', skin: '#ffe8dc', main: '#e8a8c0', accent: '#f4f2ec', trim: '#c05a7a' },
    hair: 'bob', bangs: 'blunt', headwear: 'none', wings: 'none', ears: 'rabbit', outfit: 'dress',
    build: 0.86, idle: { bobAmp: 2.6, bobHz: 0.85, swayDeg: 2.6 },
  }),

  // --- A few notable guests from later areas
  spec('marisa', 'Marisa Kirisame', 'Marisa', {
    palette: { hair: '#f0d878', eye: '#d8a83a', skin: '#ffe4d2', main: '#20202a', accent: '#f2f0e8', trim: '#c8443a' },
    hair: 'long', bangs: 'split', headwear: 'witch', wings: 'none', ears: 'none', outfit: 'witch',
    idle: { bobAmp: 2, bobHz: 0.6, swayDeg: 2 },
  }),
  spec('alice', 'Alice', 'Alice', {
    palette: { hair: '#f2dc90', eye: '#4a7ac0', skin: '#ffe8dc', main: '#4a6ac0', accent: '#f0efe8', trim: '#c8455a' },
    hair: 'bob', bangs: 'blunt', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'dress',
  }),
  spec('sanae', 'Sanae Kochiya', 'Sanae', {
    palette: { hair: '#4aa87a', eye: '#3a8a6a', skin: '#ffe6d6', main: '#f2f0ea', accent: '#3f7ac0', trim: '#d84a5a' },
    hair: 'long', bangs: 'blunt', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'miko',
  }),
  spec('nitori', 'Kawashiro Nitori', 'Nitori', {
    palette: { hair: '#4a9ac8', eye: '#3a8ab0', skin: '#ffe6d6', main: '#3a6a9a', accent: '#f0efe6', trim: '#5abad8' },
    hair: 'twin', bangs: 'blunt', headwear: 'cap', wings: 'none', ears: 'none', outfit: 'apron',
    build: 0.94,
  }),
  spec('momiji', 'Momiji Inubashiri', 'Momiji', {
    palette: { hair: '#e8e6e0', eye: '#c04a3a', skin: '#ffe4d2', main: '#3a5a8a', accent: '#f0efe8', trim: '#c8443a' },
    hair: 'short', bangs: 'split', headwear: 'tokin', wings: 'none', ears: 'wolf', outfit: 'vest',
  }),
  spec('aya', 'Aya Shameimaru', 'Aya', {
    palette: { hair: '#2a2230', eye: '#c0402a', skin: '#ffe6d6', main: '#e04a4a', accent: '#f2f0e8', trim: '#2f3a4a' },
    hair: 'short', bangs: 'swept', headwear: 'tokin', wings: 'bird', ears: 'none', outfit: 'shirt',
    idle: { bobAmp: 2.4, bobHz: 0.72, swayDeg: 2.4 },
  }),
  spec('satori', 'Satori Komeiji', 'Satori', {
    palette: { hair: '#c8a8d8', eye: '#b06ac0', skin: '#ffe8dc', main: '#5a7ac0', accent: '#f0e8f0', trim: '#d85a7a' },
    hair: 'bob', bangs: 'blunt', headwear: 'none', wings: 'none', ears: 'none', outfit: 'dress',
    idle: { bobAmp: 0.9, bobHz: 0.3, swayDeg: 0.6 },
  }),
  spec('koishi', 'Koishi Komeiji', 'Koishi', {
    palette: { hair: '#a8d0b0', eye: '#8ac0a0', skin: '#ffe8dc', main: '#e8d878', accent: '#3a6a8a', trim: '#d8607a' },
    hair: 'bob', bangs: 'swept', headwear: 'mob', wings: 'none', ears: 'none', outfit: 'dress',
    idle: { bobAmp: 2.8, bobHz: 0.44, swayDeg: 3 },
  }),
  spec('utsuho', 'Utsuho Reiuji', 'Okuu', {
    palette: { hair: '#2a2430', eye: '#c0403a', skin: '#ffe4d2', main: '#f0efe6', accent: '#3a4a6a', trim: '#d8a83a' },
    hair: 'long', bangs: 'blunt', headwear: 'none', wings: 'bird', ears: 'none', outfit: 'dress',
    build: 1.06,
  }),
  spec('yuugi', 'Yuugi Hoshiguma', 'Yuugi', {
    palette: { hair: '#f2d060', eye: '#c04a3a', skin: '#ffe2ce', main: '#c8443a', accent: '#f0efe6', trim: '#8a5a3a' },
    hair: 'long', bangs: 'swept', headwear: 'horns', wings: 'none', ears: 'none', outfit: 'kimono',
    build: 1.14, idle: { bobAmp: 2, bobHz: 0.32, swayDeg: 2.2 },
  }),
  spec('parsee', 'Parsee Mizuhashi', 'Parsee', {
    palette: { hair: '#e0d090', eye: '#4a9a7a', skin: '#ffe6d6', main: '#8a6a4a', accent: '#c8b898', trim: '#5a8a6a' },
    hair: 'short', bangs: 'blunt', headwear: 'none', wings: 'none', ears: 'none', outfit: 'vest',
  }),
  spec('yamame', 'Yamame Kurodani', 'Yamame', {
    palette: { hair: '#e8c060', eye: '#c8823a', skin: '#ffe6d6', main: '#c8843a', accent: '#4a3a3a', trim: '#e8d8a8' },
    hair: 'short', bangs: 'split', headwear: 'none', wings: 'none', ears: 'none', outfit: 'dress',
  }),
  spec('kogasa', 'Kogasa Tatara', 'Kogasa', {
    palette: { hair: '#7ec0d8', eye: '#c04a6a', skin: '#ffe8dc', main: '#e8f0f4', accent: '#5a9ac0', trim: '#d85a7a' },
    hair: 'short', bangs: 'blunt', headwear: 'none', wings: 'none', ears: 'none', outfit: 'dress',
    idle: { bobAmp: 2.6, bobHz: 0.68, swayDeg: 2.8 },
  }),
  spec('remilia', 'Remilia Scarlet', 'Remilia', {
    palette: { hair: '#9ab8e0', eye: '#c8203a', skin: '#fff0e6', main: '#e888a0', accent: '#c02a3a', trim: '#f0e8d8' },
    hair: 'short', bangs: 'blunt', headwear: 'mob', wings: 'bat', ears: 'none', outfit: 'dress',
    build: 0.88,
  }),
  spec('yuyuko', 'Yuyuko Saigyouji', 'Yuyuko', {
    palette: { hair: '#e0aad0', eye: '#c86a9a', skin: '#fff0e6', main: '#8ac0d0', accent: '#f0e0ec', trim: '#d86a8a' },
    hair: 'bob', bangs: 'blunt', headwear: 'mob', wings: 'none', ears: 'none', outfit: 'kimono',
    build: 1.06, idle: { bobAmp: 1.4, bobHz: 0.24, swayDeg: 1.4 },
  }),
  spec('youmu', 'Youmu Konpaku', 'Youmu', {
    palette: { hair: '#e8e8e4', eye: '#4a8a6a', skin: '#ffe8dc', main: '#3a4a6a', accent: '#f0efe8', trim: '#5a8a6a' },
    hair: 'bob', bangs: 'blunt', headwear: 'ribbon', wings: 'none', ears: 'none', outfit: 'vest',
    build: 0.96,
  }),
  spec('medicine', 'Medicine Melancholy', 'Medicine', {
    palette: { hair: '#a8c8d8', eye: '#c05a8a', skin: '#f4e8e8', main: '#7a5a9a', accent: '#e8e0ea', trim: '#c85a7a' },
    hair: 'twin', bangs: 'blunt', headwear: 'wreath', wings: 'none', ears: 'none', outfit: 'dress',
    build: 0.84,
  }),
  spec('yuuka', 'Yuuka Kazami', 'Yuuka', {
    palette: { hair: '#4aa87a', eye: '#c04a5a', skin: '#ffe8dc', main: '#c8455a', accent: '#f0e8d0', trim: '#3a8a5a' },
    hair: 'wavy', bangs: 'swept', headwear: 'flower', wings: 'none', ears: 'none', outfit: 'dress',
    build: 1.06, idle: { bobAmp: 1.2, bobHz: 0.3, swayDeg: 1 },
  }),
  spec('kagerou', 'Kagerou Imaizumi', 'Kagerou', {
    palette: { hair: '#c8503a', eye: '#d8a03a', skin: '#ffe6d6', main: '#8a6a9a', accent: '#f0e8d8', trim: '#c8843a' },
    hair: 'long', bangs: 'split', headwear: 'none', wings: 'none', ears: 'wolf', outfit: 'dress',
    build: 1.04,
  }),
];

const BY_ID = new Map(ROSTER.map((c) => [c.id, c]));
const BY_NAME = new Map(ROSTER.map((c) => [c.name, c]));

// -------------------------------------------------- procedural fallbacks

const HAIRS: HairStyle[] = ['long', 'short', 'twin', 'bob', 'wavy', 'side', 'braids', 'bun'];
const BANGS: Bangs[] = ['blunt', 'split', 'swept'];
const HEADWEAR: Headwear[] = ['none', 'ribbon', 'mob', 'cap', 'flower', 'tokin'];
const WINGS: Wings[] = ['none', 'none', 'none', 'fairy', 'bird'];
const EARS: Ears[] = ['none', 'none', 'none', 'cat', 'fox', 'rabbit'];
const OUTFITS: Outfit[] = ['dress', 'kimono', 'vest', 'shirt', 'apron', 'robe'];

const HAIR_COLORS = [
  '#3a2830', '#7a4a3a', '#c8843a', '#e8c060', '#4a8a6a', '#3f6ac0',
  '#8a5aa8', '#c8506a', '#e0a0c0', '#c8d0e0', '#5a9ac0', '#a86a4a',
];
const OUTFIT_COLORS = [
  '#c8443a', '#3a6a9a', '#4a8a5a', '#8a5a9a', '#c8843a', '#3a4a6a',
  '#c05a7a', '#5a7a8a', '#8a6a4a', '#6a5a8a',
];

/**
 * Builds a stable spec for any name without a hand-written entry, so every
 * customer in the database is drawable. Seeded by name, so the same character
 * always looks the same.
 */
export function derivedSpec(name: string, short = name): CharacterSpec {
  const rand = mulberry32(hashSeed(`cast:${name}`));
  const at = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

  const hair = at(HAIR_COLORS);
  const main = at(OUTFIT_COLORS);
  return spec(`derived:${name}`, name, short, {
    palette: {
      hair,
      eye: at(HAIR_COLORS),
      skin: at(['#ffe6d6', '#ffe0cc', '#f8dcc8', '#ffeade']),
      main,
      accent: at(OUTFIT_COLORS),
      trim: at(['#f0e8d8', '#e8c85a', '#d8788f', '#8fd8f8']),
    },
    hair: at(HAIRS),
    bangs: at(BANGS),
    headwear: at(HEADWEAR),
    wings: at(WINGS),
    ears: at(EARS),
    outfit: at(OUTFITS),
    build: 0.86 + rand() * 0.3,
    idle: {
      bobAmp: 1 + rand() * 2,
      bobHz: 0.3 + rand() * 0.6,
      swayDeg: 0.6 + rand() * 2.4,
    },
  });
}

/** Looks a character up by database name, falling back to a derived spec. */
export function specFor(name: string, short?: string): CharacterSpec {
  return BY_NAME.get(name) ?? BY_ID.get(name) ?? derivedSpec(name, short ?? name);
}

export const CAST = ROSTER;
export const hasHandmadeSpec = (name: string): boolean => BY_NAME.has(name);
