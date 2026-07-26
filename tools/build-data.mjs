/**
 * Converts the cached wiki snapshot in data/raw/ into the typed JSON the game
 * loads at runtime (src/data/*.json) plus a generated src/data/types.ts.
 *
 * Run with `npm run build:data`. The raw snapshot is committed, so this is
 * deterministic and needs no network access.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLuaTable, wikitextOf } from './lua2json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'src', 'data');

const RELEASES = ['BaseGame', 'DLC1', 'DLC2', 'DLC3', 'DLC4', 'DLC5'];

const readModule = (file) =>
  parseLuaTable(wikitextOf(JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'))));
const readWikitext = (file) =>
  wikitextOf(JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8')));

/** Map every name listed under a release key back to that release. */
function releaseIndex(source, pick = (v) => v) {
  const index = new Map();
  for (const release of RELEASES) {
    const listing = source[release];
    if (!listing) continue;
    for (const name of pick(listing)) index.set(name, release);
  }
  return index;
}

const flattenGroups = (groups) => Object.values(groups).flat();

/**
 * The ingredient module predates a rename pass on the Tags page and still uses
 * the older spellings. Normalise them so every tag reference resolves.
 */
const TAG_ALIASES = {
  'Good with Alcohol': 'Good w/ Alcohol',
  Fungi: 'Fungus',
  'Cultural Background': 'Cultural Heritage',
};

/**
 * Tags that exist in the game data but are missing from the Tags page's table.
 * "Divine Punishment" is carried by the joke punishment ingredients (Strong
 * Capsaicin, Jiguru Berry); it is given a synthetic id above the real range.
 */
const EXTRA_CUISINE_TAGS = [{ name: 'Divine Punishment', id: 4002 }];

const canonicalTag = (tag) => TAG_ALIASES[tag] ?? tag;
const canonicalTags = (tags) => (tags ?? []).map(canonicalTag);

/** Upstream typos in location references, plus non-areas to drop entirely. */
const LOCATION_FIXUPS = { 'Youkai Trial': 'Youkai Trail', 'Myouren Temple}': 'Myouren Temple' };
const LOCATION_PLACEHOLDERS = new Set(['?????', 'Unknown', '-', '']);

const canonicalLocations = (locations) =>
  [...new Set((locations ?? []).map((l) => LOCATION_FIXUPS[l] ?? l))].filter(
    (l) => !LOCATION_PLACEHOLDERS.has(l),
  );

// ---------------------------------------------------------------- tags

/**
 * The Tags page is a hand-written wikitable rather than a Lua module. Each row
 * starts with the tag name followed by its numeric id, which is all the game
 * needs — the like/dislike columns are redundant with the customer data.
 */
function buildTags() {
  const text = readWikitext('Tags.json');
  const sections = text.split(/^==+ *(.+?) *==+$/m);

  const collect = (body) => {
    const rows = [];
    const re = /\|-\n\|([^\n|]+)\n\| *(-?\d+)\n/g;
    let m;
    while ((m = re.exec(body))) rows.push({ name: m[1].trim(), id: Number(m[2]) });
    return rows;
  };

  const indexOfSection = (title) => sections.findIndex((s) => s.trim() === title);
  const cuisineBody = sections[indexOfSection('Cuisine Tags') + 1] ?? '';
  const beverageBody = sections[indexOfSection('Beverage Tags') + 1] ?? '';

  const cuisine = [...collect(cuisineBody), ...EXTRA_CUISINE_TAGS];
  const beverage = collect(beverageBody);
  if (cuisine.length === 0 || beverage.length === 0) {
    throw new Error('failed to parse the tag tables');
  }

  return {
    cuisine,
    beverage,
    // Higher-priority tag strikes the lower one from a resolved dish.
    priority: [
      ['Meat', 'Vegetarian'],
      ['Large Portion', 'Small Portion'],
      ['Filling', 'Good w/ Alcohol'],
      ['Greasy', 'Mild'],
      ['Hot', 'Refreshing'],
    ],
    trend: { popular: 'Trend - Popular', unpopular: 'Trend - Unpopular' },
    thresholds: { expensiveAbove: 60, economicalBelow: 20, maxIngredients: 5 },
  };
}

// ------------------------------------------------------------ cuisines

function buildCuisines() {
  const raw = readModule('Module_Cuisine_data.json');
  const release = releaseIndex(raw);
  const out = {};

  for (const [name, value] of Object.entries(raw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('cost' in value)) continue;

    out[name] = {
      name,
      level: value.lv ?? 1,
      cost: value.cost ?? 0,
      props: canonicalTags(value.props),
      xprops: canonicalTags(value.xprops),
      ingredients: value.ingredients ?? [],
      kitchenware: value.kitchenware ?? 'Any',
      cookTime: value.cook_time ?? 0,
      release: release.get(name) ?? 'BaseGame',
    };
  }
  return out;
}

// --------------------------------------------------------- ingredients

function buildIngredients() {
  const raw = readModule('Module_Ingredient_data.json');
  const release = releaseIndex(raw, flattenGroups);

  // Seafood / Vegetable / Meat / Other, as grouped per release on the wiki.
  const category = new Map();
  for (const rel of RELEASES) {
    for (const [group, names] of Object.entries(raw[rel] ?? {})) {
      for (const name of names) category.set(name, group);
    }
  }

  const out = {};
  for (const [name, value] of Object.entries(raw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('value' in value)) continue;

    out[name] = {
      name,
      level: value.lv ?? 1,
      value: value.value ?? 0,
      props: canonicalTags(value.props),
      category: category.get(name) ?? 'Other',
      release: release.get(name) ?? 'BaseGame',
    };
  }
  return out;
}

// ----------------------------------------------------------- beverages

function buildBeverages() {
  const raw = readModule('Module_Beverage_data.json');
  const release = releaseIndex(raw);
  const out = {};

  for (const [name, value] of Object.entries(raw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('cost' in value)) continue;

    // "None" is the wiki's placeholder for a drink with no flavour tags.
    const props = (value.props ?? []).filter((p) => p !== 'None');
    out[name] = {
      name,
      level: value.lv ?? 1,
      cost: value.cost ?? 0,
      alcohol: value.alcohol_content ?? 'No Alcohol',
      // The alcohol strength is itself a tag customers can ask for.
      props: [value.alcohol_content, ...props].filter(Boolean),
      release: release.get(name) ?? 'BaseGame',
    };
  }
  return out;
}

// ----------------------------------------------------------- customers

const parseBudget = (text) => {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(text ?? ''));
  return m ? { min: Number(m[1]), max: Number(m[2]) } : { min: 0, max: Number.MAX_SAFE_INTEGER };
};

function buildCustomers() {
  const raw = readModule('Module_Customer_data.json');

  const normalRaw = raw['Normal Customers'] ?? {};
  const rareRaw = raw['Rare Customers'] ?? {};
  const specialRaw = raw['Special Guests'] ?? {};

  const normalRelease = releaseIndex(normalRaw);
  const rareRelease = releaseIndex(rareRaw);

  const normal = {};
  for (const [name, value] of Object.entries(normalRaw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('pref_cuisine' in value)) continue;

    normal[name] = {
      name,
      kind: 'common',
      locations: canonicalLocations(value.locations),
      prefCuisine: canonicalTags(value.pref_cuisine),
      prefBeverage: value.pref_beverage ?? [],
      description: value.description ?? '',
      release: normalRelease.get(name) ?? 'BaseGame',
    };
  }

  const toRare = (name, value, kind, release) => ({
    name,
    kind,
    shortName: value.short_name ?? name,
    budget: parseBudget(value.budget),
    locations: canonicalLocations(value.locations),
    prefCuisine: canonicalTags(value.pref_cuisine),
    dislikeCuisine: canonicalTags(value.x_cuisine),
    prefBeverage: value.pref_beverage ?? [],
    release,
  });

  const rare = {};
  for (const [name, value] of Object.entries(rareRaw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('budget' in value)) continue;
    rare[name] = toRare(name, value, 'rare', rareRelease.get(name) ?? 'BaseGame');
  }

  const special = {};
  for (const [name, value] of Object.entries(specialRaw)) {
    if (name === 'order' || RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('budget' in value)) continue;
    special[name] = toRare(name, value, 'special', 'BaseGame');
  }

  return { normal, rare, special };
}

// ----------------------------------------------------------- locations

/**
 * The locations module only lists areas that host a resident rare trio, which
 * leaves out Hakugyokurou and DLC 5's two areas. Any location a customer or
 * merchant actually references is a real location, so union those in.
 */
function buildLocations({ customers, merchants }) {
  const raw = readModule('Module_Customer_locations.json');
  const list = Array.isArray(raw) ? raw : (raw._list ?? []);

  const byName = new Map();
  for (const entry of list) {
    byName.set(entry.name, {
      name: entry.name,
      release: entry.game ?? 'BaseGame',
      rares: entry.characters ?? [],
    });
  }

  const KNOWN_EXTRA = {
    Hakugyokurou: 'BaseGame',
    'Lunar Capital': 'DLC5',
    Makai: 'DLC5',
  };

  const referenced = new Set();
  for (const group of [customers.normal, customers.rare, customers.special]) {
    for (const c of Object.values(group)) for (const l of c.locations) referenced.add(l);
  }
  for (const m of Object.values(merchants)) if (m.location) referenced.add(m.location);

  for (const raw of referenced) {
    const name = LOCATION_FIXUPS[raw] ?? raw;
    if (LOCATION_PLACEHOLDERS.has(name) || byName.has(name)) continue;
    byName.set(name, { name, release: KNOWN_EXTRA[name] ?? 'DLC5', rares: [] });
  }

  for (const [name, release] of Object.entries(KNOWN_EXTRA)) {
    if (!byName.has(name)) byName.set(name, { name, release, rares: [] });
  }

  // Rare residents for the areas the module omits, taken from their own pages.
  const orderedReleases = (r) => RELEASES.indexOf(r);
  return [...byName.values()].sort(
    (a, b) => orderedReleases(a.release) - orderedReleases(b.release) || a.name.localeCompare(b.name),
  );
}

// ----------------------------------------------- merchants and partners

function buildMerchants() {
  const raw = readModule('Module_Merchant_data.json');
  const release = releaseIndex(raw);
  const out = {};

  for (const [name, value] of Object.entries(raw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    if (!('items' in value)) continue;

    out[name] = {
      name,
      location: LOCATION_FIXUPS[value.location] ?? value.location ?? '',
      priceMultiplier: value.price_multiplier ?? { lower: 1, upper: 1 },
      itemOrder: value.item_order ?? [],
      items: value.items ?? {},
      release: release.get(name) ?? 'BaseGame',
    };
  }
  return out;
}

function buildPartners() {
  const raw = readModule('Module_Partner_data.json');
  const release = releaseIndex(raw);
  const out = {};

  for (const [name, value] of Object.entries(raw)) {
    if (RELEASES.includes(name)) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;

    out[name] = {
      name,
      shortName: value.short_name ?? name,
      movementSpeed: value.movement_speed ?? 'Medium',
      workSpeed: value.work_speed ?? 'Medium',
      revenueShare: value.daily_revenue_taken ?? 0,
      release: release.get(name) ?? 'BaseGame',
    };
  }
  return out;
}

// ------------------------------------------------------- type emission

const asUnion = (values) =>
  values.length ? values.map((v) => `  | ${JSON.stringify(v)}`).join('\n') : '  never';

function emitTypes(tags, kitchenware, alcohol, releases) {
  return `// GENERATED by tools/build-data.mjs — do not edit by hand.
// Regenerate with \`npm run build:data\`.

export type Release =
${asUnion(releases)};

export type CuisineTag =
${asUnion(tags.cuisine.map((t) => t.name))};

export type BeverageTag =
${asUnion(tags.beverage.map((t) => t.name))};

export type FoodTag = CuisineTag | BeverageTag;

export type Kitchenware =
${asUnion(kitchenware)};

export type AlcoholStrength =
${asUnion(alcohol)};

export interface Cuisine {
  name: string;
  level: number;
  /** Base price in yen, before ingredient value and modifiers. */
  cost: number;
  /** Innate ("pink") tags, always present on the dish. */
  props: CuisineTag[];
  /** Forbidden ("black") tags — adding one turns the dish into Dark Matter. */
  xprops: CuisineTag[];
  /** Ingredients the recipe itself consumes. */
  ingredients: string[];
  kitchenware: Kitchenware;
  /** Seconds of cooking on the station. */
  cookTime: number;
  release: Release;
}

export interface Ingredient {
  name: string;
  level: number;
  /** Purchase/наценка value in yen; also what it adds to a dish's bill. */
  value: number;
  /** Every tag here is applied to a dish the ingredient is added to. */
  props: CuisineTag[];
  category: string;
  release: Release;
}

export interface Beverage {
  name: string;
  level: number;
  cost: number;
  alcohol: AlcoholStrength;
  /** Includes the alcohol strength, which customers can request directly. */
  props: BeverageTag[];
  release: Release;
}

export interface CommonCustomer {
  name: string;
  kind: 'common';
  locations: string[];
  prefCuisine: CuisineTag[];
  prefBeverage: BeverageTag[];
  description: string;
  release: Release;
}

export interface RareCustomer {
  name: string;
  kind: 'rare' | 'special';
  shortName: string;
  budget: { min: number; max: number };
  locations: string[];
  prefCuisine: CuisineTag[];
  dislikeCuisine: CuisineTag[];
  prefBeverage: BeverageTag[];
  release: Release;
}

export type Customer = CommonCustomer | RareCustomer;

export interface GameLocation {
  name: string;
  release: Release;
  rares: string[];
}

export interface MerchantStock {
  type: string;
  probability: number;
  amount: { lower: number; upper: number };
}

export interface Merchant {
  name: string;
  location: string;
  priceMultiplier: { lower: number; upper: number };
  itemOrder: string[];
  items: Record<string, MerchantStock>;
  release: Release;
}

export interface Partner {
  name: string;
  shortName: string;
  movementSpeed: string;
  workSpeed: string;
  /** Percent of the night's revenue this partner takes. */
  revenueShare: number;
  release: Release;
}

export interface TagEntry {
  name: string;
  id: number;
}

export interface TagTable {
  cuisine: TagEntry[];
  beverage: TagEntry[];
  /** [winner, loser] — the loser is struck from a resolved dish. */
  priority: [CuisineTag, CuisineTag][];
  trend: { popular: CuisineTag; unpopular: CuisineTag };
  thresholds: { expensiveAbove: number; economicalBelow: number; maxIngredients: number };
}
`;
}

// ------------------------------------------------------------ assembly

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const tags = buildTags();
  const cuisines = buildCuisines();
  const ingredients = buildIngredients();
  const beverages = buildBeverages();
  const customers = buildCustomers();
  const merchants = buildMerchants();
  const partners = buildPartners();
  const locations = buildLocations({ customers, merchants });

  const write = (file, value) =>
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(value, null, 2) + '\n');

  write('tags.json', tags);
  write('cuisines.json', cuisines);
  write('ingredients.json', ingredients);
  write('beverages.json', beverages);
  write('customers.json', customers);
  write('locations.json', locations);
  write('merchants.json', merchants);
  write('partners.json', partners);

  const kitchenware = [...new Set(Object.values(cuisines).map((c) => c.kitchenware))].sort();
  const alcohol = [...new Set(Object.values(beverages).map((b) => b.alcohol))].sort();
  fs.writeFileSync(
    path.join(OUT, 'types.ts'),
    emitTypes(tags, kitchenware, alcohol, RELEASES),
  );

  // --- integrity checks -------------------------------------------------

  const problems = [];
  const knownCuisineTags = new Set(tags.cuisine.map((t) => t.name));
  const knownBeverageTags = new Set(tags.beverage.map((t) => t.name));

  for (const dish of Object.values(cuisines)) {
    for (const tag of [...dish.props, ...dish.xprops]) {
      if (!knownCuisineTags.has(tag)) problems.push(`${dish.name}: unknown cuisine tag "${tag}"`);
    }
    for (const ing of dish.ingredients) {
      if (!ingredients[ing]) problems.push(`${dish.name}: unknown ingredient "${ing}"`);
    }
  }
  for (const ing of Object.values(ingredients)) {
    for (const tag of ing.props) {
      if (!knownCuisineTags.has(tag)) problems.push(`${ing.name}: unknown cuisine tag "${tag}"`);
    }
  }
  for (const drink of Object.values(beverages)) {
    for (const tag of drink.props) {
      if (!knownBeverageTags.has(tag)) problems.push(`${drink.name}: unknown beverage tag "${tag}"`);
    }
  }

  const counts = {
    cuisines: Object.keys(cuisines).length,
    ingredients: Object.keys(ingredients).length,
    beverages: Object.keys(beverages).length,
    commonCustomers: Object.keys(customers.normal).length,
    rareCustomers: Object.keys(customers.rare).length,
    specialGuests: Object.keys(customers.special).length,
    locations: locations.length,
    merchants: Object.keys(merchants).length,
    partners: Object.keys(partners).length,
    cuisineTags: tags.cuisine.length,
    beverageTags: tags.beverage.length,
  };

  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(17)} ${value}`);
  }
  const baseGame = Object.values(cuisines).filter((c) => c.release === 'BaseGame').length;
  console.log(`  ${'(base-game dishes)'.padEnd(17)} ${baseGame}`);

  if (problems.length) {
    console.error(`\n${problems.length} data integrity problem(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nData build OK.');
}

main();
