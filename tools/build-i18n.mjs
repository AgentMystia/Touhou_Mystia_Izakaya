/**
 * Builds the Simplified Chinese name table for the game database.
 *
 * The game is Chinese originally, so the names are not translated here — they
 * are the canonical ones, read from the Chinese Touhou wiki snapshot in
 * data/raw/zh/ and matched against the English database this project already
 * builds from the Fandom wiki.
 *
 * Neither source shares an id, so the two are aligned by constraint
 * propagation: seed with the entries whose (price, category) or (price,
 * cookware, ingredient count) is already unique, then use each newly matched
 * dish to pin down the ingredients and tags it references, and each newly
 * matched ingredient to pin down further dishes. Repeat to a fixpoint.
 *
 * Run with `npm run build:i18n`. Emits src/data/zh-CN.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw', 'zh');
const OUT = path.join(ROOT, 'src', 'data');

const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8')).parse.wikitext['*'];
const en = (file) => JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'));

const KITCHENWARE = {
  煮锅: 'Boiling Pot',
  烤架: 'Grill',
  烧烤架: 'Grill',
  油锅: 'Frying Pan',
  炸锅: 'Frying Pan',
  蒸锅: 'Steamer',
  蒸笼: 'Steamer',
  料理台: 'Cutting Board',
  砧板: 'Cutting Board',
  切菜板: 'Cutting Board',
  任意: 'Any',
};

const CATEGORY = { 其他: 'Other', 肉类: 'Meat', 蔬菜: 'Vegetable', 海鲜: 'Seafood', 水产: 'Seafood' };

/**
 * Dishes the structural matcher cannot place, because they share a price,
 * station and ingredient list with another dish. The Chinese names below are
 * still the wiki's own — they are simply paired by meaning rather than by key.
 */
const DISH_OVERRIDES = {
  'Dark Matter': '黑暗物质',
  Dumplings: '水饺',
  Tangyuan: '汤圆',
  'Eggs Benedict': '班尼迪克蛋',
  Pickles: '腌黄瓜',
  'Creamy Crab': '奶油焗蟹',
  Takoyaki: '章鱼烧',
  'Sea Urchin Sashimi': '海胆刺身',
  "Mushroom Maiden's Tip Tap Pot": '蘑女的舞踏烩',
  'Cream of Mushroom Soup': '奶香蘑菇汤',
  'Ordinary "Eat Me" Cupcake': '普通小蛋糕',
  'Buddha Jumps Over The Wall': '幻想佛跳墙',
  'Agony Oden': '绝叫关东煮',
  "Lion's Head": '狮子头',
  'CAUTION!! Hellish Spice!': '地狱激辛警告！',
  'Heart-Throbbing Surprise!': '惊吓！大冒险',
  'Smoked Buccaneer': '海盗熏肉',
  'Star Lotus Ship': '幻想星莲船',
  'Lotus Fish Lamps': '荷花鱼米盏',
  'Against The World!': '逆转天地！',
  'Palace of the Han': '汉宫藏娇',
  'Bamboo Spring': '翠竹迎春',
  'Plum Tea Rice': '梅子茶泡饭',
  'Urchin Steamed Egg': '海胆蒸蛋',
  'Toon Pancake': '香椿煎饼',
  'Miasma Garden': '毒瘴花园',
  'Little Sweet "Poison"': '小小的甜蜜「毒药」',
  "Kitten's Water Play": '猫咪戏水',
  "Mad Hatter's Tea Party": '疯帽子茶会',
  'Peach Flower Crystal Roll': '桃花琉璃卷',
  'Moonlight over the Lotus Pond': '荷塘月色',
  'Molecular Egg': '分子蛋',
  'Origin of Life': '生命之源',
  'Planet Mars': '火星',
  'Heart-warming Congee': '养心粥',
  'Supreme Seafood Noodles': '至尊海鲜面',
  'Faint Dream': '幽梦',
  "Nature's Beauty": '花鸟风月',
  'Urchin Raindrop Cake': '海胆信玄饼',
  'Scrumptious Storm': '幻想风靡',
};

const splitList = (text) =>
  text
    .split(/[、,，]/)
    .map((s) => s.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

/** Drops markup and the wiki's "(DLC2)" release suffix from a display name. */
const cleanName = (raw) =>
  raw.replace(/<[^>]+>/g, '').replace(/\s*\((?:DLC\s*\d|dlc\s*\d)[^)]*\)\s*$/i, '').trim();

/** Strips the wiki's "（东方夜雀食堂…）" disambiguator off a file-link label. */
const bare = (name) => name.replace(/（[^）]*）.*$/, '').trim();

/** Areas, cookware and the beverage tag vocabulary. Small, closed sets. */
const LOCATIONS = {
  'Youkai Trail': '妖怪兽道',
  'Human Village': '人间之里',
  'Hakurei Shrine': '博丽神社',
  'Scarlet Devil Mansion': '红魔馆',
  'Bamboo Forest of the Lost': '迷途竹林',
  Hakugyokurou: '白玉楼',
  'Forest of Magic': '魔法森林',
  'Youkai Mountain': '妖怪之山',
  'Former Hell': '旧地狱',
  'Palace of the Earth Spirits': '地灵殿',
  'Myouren Temple': '命莲寺',
  'Divine Spirit Mausoleum': '神灵庙',
  'Garden of the Sun': '太阳花田',
  'Shining Needle Castle': '辉针城',
  'Lunar Capital': '月之都',
  Makai: '魔界',
};

const KITCHENWARE_ZH = {
  Grill: '烤架',
  'Boiling Pot': '煮锅',
  'Frying Pan': '油锅',
  Steamer: '蒸锅',
  'Cutting Board': '料理台',
  Any: '任意',
};

const BEVERAGE_TAGS = {
  'No Alcohol': '无酒精',
  'Low Alcohol': '低酒精',
  'Mid Alcohol': '中酒精',
  'High Alcohol': '高酒精',
  Chillable: '可加冰',
  Heatable: '可加热',
  Shochu: '烧酒',
  Sake: '清酒',
  Cocktail: '鸡尾酒',
  Western: '西式',
  Liquor: '利口酒',
  Beer: '啤酒',
  Neat: '直饮',
  Fruity: '水果',
  Sweet: '甘',
  Dry: '辛',
  Bitter: '苦',
  Soda: '气泡',
  Vintage: '古典',
  Modern: '现代',
  Stimulating: '提神',
};

/** Cuisine tags the dish tables never exercised. */
const CUISINE_TAG_EXTRAS = {
  'Trend - Popular': '流行·喜爱',
  'Trend - Unpopular': '流行·厌恶',
  'Dark Matter': '黑暗物质',
  Poison: '毒',
  Sour: '酸',
  Spicy: '辣',
  Salty: '咸',
  Sweet: '甜',
  Raw: '生',
  Signature: '招牌',
  Premium: '高级',
  Peculiar: '猎奇',
  Wonderful: '不可思议',
  Photogenic: '适合拍照',
  Refreshing: '凉爽',
  'Small Portion': '小巧',
  'Strength-Boosting': '力量涌现',
  Specialty: '特产',
  Soup: '汤羹',
  Vegetarian: '素',
  'Sea Delicacy': '海味',
};

/**
 * Character names. Touhou's Chinese names are settled and unambiguous, so
 * these are asserted rather than inferred — the budget ranges the wiki lists
 * collide too often to key on.
 */
const CUSTOMER_NAMES = {
  'Mystia Lorelei': '米斯蒂娅·萝蕾拉',
  // Base game
  'Wriggle Nightbug': '莉格露·奈特巴格',
  Chen: '橙',
  Rumia: '露米娅',
  'Hieda no Akyuu': '稗田阿求',
  'Keine Kamishirasawa': '上白泽慧音',
  'Kasen Ibaraki': '茨木华扇',
  'Reimu Hakurei': '博丽灵梦',
  'Suika Ibuki': '伊吹萃香',
  'Tenshi Hinanawi': '比那名居天子',
  'Hong Meiling': '红美铃',
  Cirno: '琪露诺',
  'Patchouli Knowledge': '帕秋莉·诺蕾姬',
  'Fujiwara no Mokou': '藤原妹红',
  'Kaguya Houraisan': '蓬莱山辉夜',
  'Tewi Inaba': '因幡帝',
  // DLC 1
  'Marisa Kirisame': '雾雨魔理沙',
  Alice: '爱丽丝·玛格特罗依德',
  'Narumi Yatadera': '矢田寺成美',
  'Nitori Kawashiro': '河城荷取',
  'Kawashiro Nitori': '河城荷取',
  'Momiji Inubashiri': '犬走椛',
  'Sanae Kochiya': '东风谷早苗',
  // DLC 2
  'Yamame Kurodani': '黑谷山女',
  'Parsee Mizuhashi': '水桥帕露西',
  'Yuugi Hoshiguma': '星熊勇仪',
  'Satori Komeiji': '古明地觉',
  'Rin Kaenbyou': '火焰猫燐',
  'Utsuho Reiuji': '灵乌路空',
  // DLC 3
  'Kogasa Tatara': '多多良小伞',
  'Minamitsu Murasa': '村纱水蜜',
  'Nue Houjuu': '封兽鵺',
  'Mononobe no Futo': '物部布都',
  'Seiga Kaku': '霍青娥',
  'Soga no Tojiko': '苏我屠自古',
  // DLC 4
  'Aya Shameimaru': '射命丸文',
  'Medicine Melancholy': '梅蒂欣·梅兰可莉',
  'Yuuka Kazami': '风见幽香',
  'Seija Kijin': '鬼人正邪',
  'Shinmyoumaru Sukuna': '少名针妙丸',
  'Kagerou Imaizumi': '今泉影狼',
  // DLC 5
  Ellen: '艾莲',
  Mima: '魅魔',
  Louise: '露易兹',
  'Reisen Udongein Inaba': '铃仙·优昙华院·因幡',
  'Watatsuki no Toyohime': '绵月丰姬',
  'Watatsuki no Yorihime': '绵月依姬',
  // Other named guests that can appear
  'Remilia Scarlet': '蕾米莉亚·斯卡雷特',
  'Yuyuko Saigyouji': '西行寺幽幽子',
  'Youmu Konpaku': '魂魄妖梦',
  'Komeiji Koishi': '古明地恋',
  'Koishi Komeiji': '古明地恋',
  'Rinnosuke Morichika': '森近霖之助',
  'Rin Satsuki': '冴月麟',
  'Meng Chengguo': '孟蝉娟',
  'Three Fairies': '三妖精',
  'Shio Tachisora': '立空盐',
  'Jien Yuu': '玉响',
  'Yuuma Toutetsu': '饕餮尤魔',
  'Sagume Kishin': '稀神探女',
  'Shiki Eiki': '四季映姬',
  'Eirin Yagokoro': '八意永琳',
  Wakasagihime: '若鹭姬',
  'Okina Matara': '摩多罗隐岐奈',
  'Flandre Scarlet': '芙兰朵露·斯卡雷特',
  Shinki: '神绮',
  'Mizuchi Miyadeguchi': '宫出口瑞灵',
  Sara: '萨拉',
  'Doremy Sweet': '哆来咪·苏伊特',
  Sekibanki: '赤蛮奇',
  'Eternity Larva': '爱塔妮缇·拉尔瓦',
  // Common customer archetypes
  'Youkai Rabbit': '妖怪兔',
  'Youkai Cat': '妖怪猫',
  'Youkai Tanuki': '妖怪狸',
  'Youkai Fox': '妖怪狐',
  'Youkai Snake': '妖怪蛇',
  'Human Child': '人类小孩',
  'Human Male': '人类男子',
  'Human Female': '人类女子',
  'Human Elder': '人类老者',
  Saemon: '左卫门',
  'Zashiki-warashi': '座敷童子',
  Kappa: '河童',
  Goblin: '小鬼',
  Tengu: '天狗',
  Fairy: '妖精',
  Jiangshi: '僵尸',
  'White Wolf Tengu': '白狼天狗',
  Yamanba: '山姥',
  Yamawaro: '山童',
  Magician: '魔法使',
  'Forest Fairy': '森之妖精',
  'Lost Doll': '迷途人偶',
  Tsuchigumo: '土蜘蛛',
  Oni: '鬼',
  'Hone-onna': '骨女',
  'Hell Raven': '地狱鸦',
  Ubume: '姑获鸟',
  'Youkai Leopard': '妖怪豹',
  Monk: '僧侣',
  'Youkai Mouse': '妖怪鼠',
  'Hachishaku-sama': '八尺大人',
  Taoist: '道士',
  Hermit: '仙人',
  Inchling: '小人族',
  'Delinquent Boy': '不良少年',
  'Delinquent Girl': '不良少女',
  'Toy Soldier': '玩具士兵',
  'Convalla Fairy': '铃兰妖精',
  'Sunflower Fairy': '向日葵妖精',
  'Rose Fairy': '蔷薇妖精',
  'Kage-onna': '影女',
  'Poker Soldier': '扑克士兵',
  Clown: '小丑',
  'Mad Cap': '疯帽子',
  Lunarian: '月人',
  'Medicine-Pounding Rabbit': '捣药兔',
  'Lunar Emissary': '月之使者',
};

const DISH_OVERRIDES_EXTRA = {
  'Tempura Platter': '天妇罗拼盘',
  'Mushroom Herb Road': '菌香小径',
};

const INGREDIENT_EXTRA = { 'Jiguru Berry': '吉格露果' };

const BEVERAGE_EXTRA = { 'Ordinary Fitness Tea': '普通健身茶', 'Makai Coffee': '魔界咖啡' };

// ------------------------------------------------------------- extraction

function parseDishes() {
  const rows = [];
  for (const block of read('dishes.json').split('\n|-').slice(1)) {
    const cells = block.split('||').map((c) => c.trim());
    if (cells.length < 7) continue;
    const name = /\{\{center\|([^}]+)\}\}/.exec(cells[0] ?? '');
    if (!name) continue;
    const cost = Number((cells[2] ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(cost)) continue;
    rows.push({
      zh: cleanName(name[1]),
      kitchenware: KITCHENWARE[(cells[1] ?? '').trim()] ?? (cells[1] ?? '').trim(),
      cost,
      ingredients: [...(cells[3] ?? '').matchAll(/\|\d+px\|([^\]]+)\]\]/g)].map((m) => bare(m[1])),
      props: splitList(cells[4] ?? ''),
      xprops: splitList(cells[5] ?? ''),
    });
  }
  return rows;
}

/** Beverages, keyed by price and tag set. */
function parseBeverages() {
  const rows = [];
  for (const block of read('beverages.json').split('\n|-').slice(1)) {
    const cells = block.split('||').map((c) => c.trim());
    if (cells.length < 3) continue;
    const name = /\{\{center\|([^}]+)\}\}/.exec(cells[0] ?? '');
    if (!name) continue;
    const cost = Number((cells[1] ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(cost)) continue;
    rows.push({ zh: cleanName(name[1]), cost, tags: splitList(cells[2] ?? '') });
  }
  return rows;
}

/** Rare customers, keyed by the purse range the wiki lists. */
function parseCustomers() {
  const rows = [];
  for (const block of read('customers.json').split('\n|-').slice(1)) {
    const cells = block.split('||').map((c) => c.trim());
    if (cells.length < 4) continue;
    const zh = (cells[0] ?? '').replace(/^\|/, '').replace(/<[^>]+>/g, '').trim();
    if (!zh || zh.includes('{')) continue;
    const budget = /(\d+)\s*-\s*(\d+)/.exec(cells[2] ?? '');
    if (!budget) continue;
    rows.push({ zh, min: Number(budget[1]), max: Number(budget[2]) });
  }
  return rows;
}

function parseIngredients() {
  const rows = [];
  for (const block of read('ingredients.json').split('\n|-').slice(1)) {
    const cells = block.split('||').map((c) => c.trim());
    if (cells.length < 4) continue;
    const name = /\{\{center\|([^}]+)\}\}/.exec(cells[0] ?? '');
    if (!name) continue;
    const value = Number((cells[1] ?? '').replace(/\D/g, ''));
    if (!Number.isFinite(value)) continue;
    rows.push({
      zh: name[1].replace(/<[^>]+>/g, '').trim(),
      value,
      category: CATEGORY[(cells[2] ?? '').trim()] ?? (cells[2] ?? '').trim(),
      tags: [...(cells[3] ?? '').matchAll(/文件:([^（|]+)（/g)].map((m) => m[1].trim()),
    });
  }
  return rows;
}

// ----------------------------------------------------------- the matching

/**
 * Pairs two lists by a key function, recording only the pairings where the key
 * lands in a bucket of exactly one on both sides.
 */
function pairUnique(leftRows, rightRows, leftKey, rightKey) {
  const bucket = (rows, keyOf) => {
    const map = new Map();
    for (const row of rows) {
      const k = keyOf(row);
      if (k === null) continue;
      const list = map.get(k) ?? [];
      list.push(row);
      map.set(k, list);
    }
    return map;
  };
  const left = bucket(leftRows, leftKey);
  const right = bucket(rightRows, rightKey);
  const pairs = [];
  for (const [k, ls] of left) {
    const rs = right.get(k);
    if (ls.length === 1 && rs?.length === 1) pairs.push([ls[0], rs[0]]);
  }
  return pairs;
}

function main() {
  const zhDishes = parseDishes();
  const zhIngredients = parseIngredients();
  const enDishes = Object.values(en('cuisines.json'));
  const enIngredients = Object.values(en('ingredients.json'));

  /** English name to Chinese name. */
  const ingredientMap = new Map();
  const dishMap = new Map();
  const tagMap = new Map();

  const unmatchedZhIng = () => zhIngredients.filter((r) => !usedZhIng.has(r.zh));
  const unmatchedEnIng = () => enIngredients.filter((i) => !ingredientMap.has(i.name));
  const usedZhIng = new Set();
  const usedZhDish = new Set();

  const linkIngredient = (enName, zhName) => {
    if (ingredientMap.has(enName) || usedZhIng.has(zhName)) return false;
    ingredientMap.set(enName, zhName);
    usedZhIng.add(zhName);
    return true;
  };
  const linkDish = (enName, zhName) => {
    if (dishMap.has(enName) || usedZhDish.has(zhName)) return false;
    dishMap.set(enName, zhName);
    usedZhDish.add(zhName);
    return true;
  };

  // Seed: ingredients whose (value, category) is unique on both sides.
  for (const [z, e] of pairUnique(
    zhIngredients,
    enIngredients,
    (r) => `${r.value}|${r.category}`,
    (i) => `${i.value}|${i.category}`,
  )) {
    linkIngredient(e.name, z.zh);
  }

  // Propagate until nothing new is learned.
  for (let pass = 0; pass < 12; pass++) {
    let learned = 0;

    // Dishes: keyed by price, cookware, and the ingredients already known.
    const zhKey = (r) => {
      if (usedZhDish.has(r.zh)) return null;
      const known = r.ingredients.map((n) => (usedZhIng.has(n) ? n : '?')).sort();
      return `${r.cost}|${r.kitchenware}|${r.ingredients.length}|${known.join(',')}`;
    };
    const enKey = (d) => {
      if (dishMap.has(d.name)) return null;
      const known = d.ingredients
        .map((n) => ingredientMap.get(n) ?? '?')
        .sort();
      return `${d.cost}|${d.kitchenware}|${d.ingredients.length}|${known.join(',')}`;
    };
    for (const [z, e] of pairUnique(zhDishes, enDishes, zhKey, enKey)) {
      if (linkDish(e.name, z.zh)) learned++;
    }

    // Same again, but with the tag sets folded into the key. Two dishes can
    // share a price, a station and an ingredient list; they rarely share tags.
    const tagged = (list) => list.map((t) => t).sort().join(',');
    const zhTagKey = (r) => {
      if (usedZhDish.has(r.zh)) return null;
      const known = r.ingredients.map((n) => (usedZhIng.has(n) ? n : '?')).sort();
      return `${r.cost}|${r.kitchenware}|${known.join(',')}|${tagged(r.props)}|${tagged(r.xprops)}`;
    };
    const enTagKey = (d) => {
      if (dishMap.has(d.name)) return null;
      const known = d.ingredients.map((n) => ingredientMap.get(n) ?? '?').sort();
      const tr = (list) => list.map((t) => tagMap.get(t) ?? '?');
      return `${d.cost}|${d.kitchenware}|${known.join(',')}|${tagged(tr(d.props))}|${tagged(tr(d.xprops))}`;
    };
    for (const [z, e] of pairUnique(zhDishes, enDishes, zhTagKey, enTagKey)) {
      if (linkDish(e.name, z.zh)) learned++;
    }

    // Ingredients: a matched dish pins down the ingredients it uses, when only
    // one on each side is still unknown.
    for (const zd of zhDishes) {
      const enName = [...dishMap.entries()].find(([, v]) => v === zd.zh)?.[0];
      if (!enName) continue;
      const ed = enDishes.find((d) => d.name === enName);
      if (!ed || ed.ingredients.length !== zd.ingredients.length) continue;
      const zhLeft = zd.ingredients.filter((n) => !usedZhIng.has(n));
      const enLeft = ed.ingredients.filter((n) => !ingredientMap.has(n));
      if (zhLeft.length === 1 && enLeft.length === 1) {
        if (linkIngredient(enLeft[0], zhLeft[0])) learned++;
      }
      // Tags line up as sets on a matched dish.
      learnTags(tagMap, zd.props, ed.props);
      learnTags(tagMap, zd.xprops, ed.xprops);
    }

    // Ingredients again, now that more tags are known.
    for (const [z, e] of pairUnique(
      unmatchedZhIng(),
      unmatchedEnIng(),
      (r) => `${r.value}|${r.category}|${r.tags.map((t) => t).sort().join(',')}`,
      (i) => `${i.value}|${i.category}|${i.props.map((p) => reverse(tagMap, p) ?? '?').sort().join(',')}`,
    )) {
      if (linkIngredient(e.name, z.zh)) learned++;
    }

    if (learned === 0) break;
  }

  // Ingredient tags fill in any tag the dishes never exercised.
  for (const [enName, zhName] of ingredientMap) {
    const zi = zhIngredients.find((r) => r.zh === zhName);
    const ei = enIngredients.find((i) => i.name === enName);
    if (zi && ei) learnTags(tagMap, zi.tags, ei.props);
  }

  for (const [enName, zhName] of Object.entries(DISH_OVERRIDES)) {
    if (enDishes.some((d) => d.name === enName)) linkDish(enName, zhName);
  }

  for (const [enName, zhName] of Object.entries(INGREDIENT_EXTRA)) linkIngredient(enName, zhName);
  for (const [enName, zhName] of Object.entries(DISH_OVERRIDES_EXTRA)) {
    if (enDishes.some((d) => d.name === enName)) linkDish(enName, zhName);
  }

  // Beverages: price plus the translated tag set is effectively unique.
  const zhBeverages = parseBeverages();
  const enBeverages = Object.values(en('beverages.json'));
  const beverageMap = new Map();
  const bevTag = (t) => BEVERAGE_TAGS[t] ?? t;
  for (const pass of [
    (r) => `${r.cost}|${r.tags.slice().sort().join(',')}`,
    (r) => `${r.cost}|${r.tags.length}`,
    (r) => `${r.cost}`,
  ]) {
    const enPass =
      pass.length === 1 && pass.toString().includes('tags.slice')
        ? (b) => `${b.cost}|${b.props.map(bevTag).sort().join(',')}`
        : pass.toString().includes('tags.length')
          ? (b) => `${b.cost}|${b.props.length}`
          : (b) => `${b.cost}`;
    for (const [z, e] of pairUnique(
      zhBeverages.filter((r) => ![...beverageMap.values()].includes(r.zh)),
      enBeverages.filter((b) => !beverageMap.has(b.name)),
      pass,
      enPass,
    )) {
      beverageMap.set(e.name, z.zh);
    }
  }

  for (const [enName, zhName] of Object.entries(BEVERAGE_EXTRA)) {
    if (enBeverages.some((b) => b.name === enName)) beverageMap.set(enName, zhName);
  }

  // Rare customers, matched on the purse range.
  const zhCustomers = parseCustomers();
  const enRare = Object.values(en('customers.json').rare);
  const customerMap = new Map();
  for (const [z, e] of pairUnique(
    zhCustomers,
    enRare,
    (r) => `${r.min}-${r.max}`,
    (c) => `${c.budget.min}-${c.budget.max}`,
  )) {
    customerMap.set(e.name, z.zh);
  }

  for (const [k, v] of Object.entries(CUSTOMER_NAMES)) customerMap.set(k, v);
  for (const [k, v] of Object.entries(CUISINE_TAG_EXTRAS)) if (!tagMap.has(k)) tagMap.set(k, v);

  const zhCN = {
    dishes: Object.fromEntries([...dishMap].sort()),
    ingredients: Object.fromEntries([...ingredientMap].sort()),
    tags: { ...Object.fromEntries([...tagMap].sort()), ...BEVERAGE_TAGS },
    beverages: Object.fromEntries([...beverageMap].sort()),
    customers: Object.fromEntries([...customerMap].sort()),
    locations: LOCATIONS,
    kitchenware: KITCHENWARE_ZH,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'zh-names.json'), JSON.stringify(zhCN, null, 2) + '\n');

  console.log(`  dishes       ${dishMap.size}/${enDishes.length}`);
  console.log(`  ingredients  ${ingredientMap.size}/${enIngredients.length}`);
  console.log(`  beverages    ${beverageMap.size}/${enBeverages.length}`);
  console.log(`  tags         ${Object.keys(zhCN.tags).length}`);
  const namedCovered = enRare.filter((c) => customerMap.has(c.name)).length;
  console.log(`  customers    ${namedCovered}/${enRare.length} rare, ${customerMap.size} total`);

  const missingDishes = enDishes.filter((d) => !dishMap.has(d.name)).map((d) => d.name);
  if (missingDishes.length) {
    console.log(`\n  ${missingDishes.length} dish(es) without a Chinese name:`);
    console.log(`    ${missingDishes.slice(0, 24).join(', ')}`);
  }
}

/** Two tag lists from the same dish describe the same set, in some order. */
function learnTags(tagMap, zhTags, enTags) {
  if (zhTags.length !== enTags.length) return;
  const zhLeft = zhTags.filter((t) => !reverse(tagMap, null, t));
  const enLeft = enTags.filter((t) => !tagMap.has(t));
  if (zhLeft.length === 1 && enLeft.length === 1) tagMap.set(enLeft[0], zhLeft[0]);
}

/** Looks a Chinese value back up to its English key. */
function reverse(map, enKey, zhValue) {
  if (enKey !== null && enKey !== undefined) return map.get(enKey);
  for (const [k, v] of map) if (v === zhValue) return k;
  return undefined;
}

main();
