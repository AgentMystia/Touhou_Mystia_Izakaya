/**
 * Vendors the two webfonts the game uses into public/fonts/.
 *
 * Both are SIL Open Font License, so they can be redistributed with the game.
 * The upstream families are 8-9 MB each because they cover the full CJK range,
 * so each weight is subset locally with fonttools down to exactly the glyphs
 * this game can draw — harvested from the generated name table and the locale
 * file, so a new dish or UI string can never ship without its characters.
 *
 * Requires `pip install fonttools brotli`. Re-run with
 * `node tools/fetch-fonts.mjs` after adding Chinese text to the UI.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'fonts');

const GOOGLE_FONTS = 'https://raw.githubusercontent.com/google/fonts/main/ofl';

const FAMILIES = [
  {
    label: 'Shippori Mincho',
    file: 'shippori-mincho',
    weights: {
      500: `${GOOGLE_FONTS}/shipporimincho/ShipporiMincho-Medium.ttf`,
      700: `${GOOGLE_FONTS}/shipporimincho/ShipporiMincho-Bold.ttf`,
      800: `${GOOGLE_FONTS}/shipporimincho/ShipporiMincho-ExtraBold.ttf`,
    },
  },
  {
    label: 'Zen Maru Gothic',
    file: 'zen-maru-gothic',
    weights: {
      400: `${GOOGLE_FONTS}/zenmarugothic/ZenMaruGothic-Regular.ttf`,
      500: `${GOOGLE_FONTS}/zenmarugothic/ZenMaruGothic-Medium.ttf`,
      700: `${GOOGLE_FONTS}/zenmarugothic/ZenMaruGothic-Bold.ttf`,
    },
  },
];

/** Glyphs the interface draws that are not in the generated data. */
const EXTRA_GLYPHS = [
  '東方夜雀食堂営業中', // signage and lantern faces, kept in Japanese forms
  '刻钱连时评判盆调理烹饪',
  '、。「」『』・！？～（）：￥¥·—…※★☆〇◎△▲▽▼✕⚠',
  '０１２３４５６７８９',
].join('');

function harvest() {
  const chars = new Set();
  const eat = (text) => {
    for (const ch of String(text)) chars.add(ch);
  };

  const names = JSON.parse(readFileSync(path.join(ROOT, 'src/data/zh-names.json'), 'utf8'));
  for (const table of Object.values(names)) {
    for (const [key, value] of Object.entries(table)) {
      eat(key);
      eat(value);
    }
  }
  // The locale file is TypeScript, so take every quoted run out of the source.
  const locale = readFileSync(path.join(ROOT, 'src/i18n/zh.ts'), 'utf8');
  for (const m of locale.matchAll(/'([^']*)'/g)) eat(m[1]);

  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
  for (const ch of [...ascii, ...EXTRA_GLYPHS]) chars.add(ch);

  chars.delete('\n');
  chars.delete('\r');
  chars.delete('\\');
  return [...chars].sort().join('');
}

async function download(url, to) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const work = path.join(os.tmpdir(), 'mystia-fonts');
  mkdirSync(work, { recursive: true });

  const subset = harvest();
  const textFile = path.join(work, 'subset.txt');
  writeFileSync(textFile, subset, 'utf8');
  console.log(`subsetting to ${subset.length} glyphs\n`);

  const faces = [];
  for (const family of FAMILIES) {
    for (const [weight, url] of Object.entries(family.weights)) {
      const source = path.join(work, `${family.file}-${weight}.ttf`);
      await download(url, source);

      const name = `${family.file}-${weight}.woff2`;
      const target = path.join(OUT, name);
      execFileSync('python3', [
        '-m', 'fontTools.subset', source,
        `--text-file=${textFile}`,
        '--flavor=woff2',
        `--output-file=${target}`,
        '--layout-features=*',
        '--no-hinting',
        '--desubroutinize',
        '--drop-tables+=DSIG',
      ]);

      const bytes = readFileSync(target).length;
      faces.push({ family: family.label, weight, file: name, bytes });
      console.log(`  ${name.padEnd(30)} ${(bytes / 1024).toFixed(1)} KB`);
    }
  }

  const stylesheet = faces
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('./${f.file}') format('woff2');
}`,
    )
    .join('\n\n');
  writeFileSync(path.join(OUT, 'fonts.css'), `${stylesheet}\n`);

  writeFileSync(
    path.join(OUT, 'LICENSE.md'),
    `# Bundled fonts

Both families are licensed under the SIL Open Font License 1.1, which permits
bundling and redistribution with this project.

| Family | Designer | License |
| --- | --- | --- |
| Shippori Mincho | FONTDASU | [OFL 1.1](https://openfontlicense.org/) |
| Zen Maru Gothic | Yoshimichi Ohira | [OFL 1.1](https://openfontlicense.org/) |

These files are glyph subsets covering only the characters the interface can
draw. Regenerate with \`node tools/fetch-fonts.mjs\` after adding new text.
`,
  );

  rmSync(work, { recursive: true, force: true });
  const total = faces.reduce((sum, f) => sum + f.bytes, 0);
  console.log(`\n${faces.length} faces, ${(total / 1024).toFixed(1)} KB total`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
