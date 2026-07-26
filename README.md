# 东方夜雀食堂 — Touhou Mystia's Izakaya

A browser recreation of the izakaya-management sim *Touhou Mystia's Izakaya*
(东方夜雀食堂). Mystia runs a lantern-lit food stall on a Gensokyo trail: read
what each guest wants, cook it on the right station, season it to hit the tags
they like, pour a drink, and serve before their patience runs out.

Runs entirely in the browser. No backend, no runtime dependencies, ~59 KB of
gzipped JavaScript plus vendored fonts.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

| | |
| --- | --- |
| `npm test` | rules-engine and data-integrity tests |
| `npm run typecheck` | strict TypeScript, no `any` in `rules/` or `data/` |
| `npm run build` | data build, typecheck, production bundle |
| `npm run e2e` | drives the built game in Chromium, writes `artifacts/*.png` |
| `npm run build:data` | regenerates `src/data/` from the wiki snapshot |
| `npm run build:i18n` | regenerates the Chinese name table |

## The tag system

The whole game turns on tags, so the rules are implemented exactly rather than
approximated. `src/rules/` is pure — no DOM, no state — and covered by 80 tests.

A dish carries innate tags from its recipe. Every ingredient added on top
contributes *all* of its own tags. A dish holds at most five ingredients
counting the recipe's own, and filling all five adds **大份 (Large Portion)**.
Five override pairs then strike the loser out of the result:

```
肉 Meat        > 素 Vegetarian
大份 Large      > 小巧 Small Portion
饱腹 Filling    > 下酒 Good w/ Alcohol
重油 Greasy     > 清淡 Mild
灼热 Hot        > 凉爽 Refreshing
```

Adding a tag the recipe forbids ruins it into **黑暗物质 (Dark Matter)**. Price
bands add 昂贵 above 60¥ and 实惠 below 20¥, and whichever tag is in fashion
that week also carries a trend tag.

Common guests are simple: bring exactly what was ordered for 普通, plus at least
one *added* tag matching their taste for 满意. Named guests score tag by tag —
`+1` per liked tag on the dish and the drink, `−1` per disliked tag, `−2` for
Dark Matter — mapping to 暴怒 / 不满 / 普通 / 满意 / 绝品, then capped by how many
of the two tags they actually asked for were delivered. Go over their purse and
they pay what they can and walk out.

## Where the data comes from

The game's tables live on two community wikis, and both snapshots are committed
under `data/raw/` so builds are deterministic and need no network.

`tools/build-data.mjs` parses the English Fandom wiki's Lua modules and emits
typed JSON plus generated types. It validates every tag and ingredient
cross-reference and repairs four real upstream defects — three shrine residents
listed surname-first, rare customers grouped by release indirectly through their
home area, 31 preference entries naming tags that do not exist, and eight
undocumented stub guests.

`tools/build-i18n.mjs` reads the Chinese wiki and aligns it against that
database. Neither source shares an id, so it matches by constraint propagation:
seed on entries with a unique key, then use each matched dish to pin down the
ingredients and tags it references and each matched ingredient to pin down
further dishes, to a fixpoint. The Chinese names are therefore the game's own,
not translations.

**163** dishes · **62** ingredients · **46** drinks · **45** named guests ·
**47** common guest types · **16** areas · **63** tags.

## Art and audio

All art is drawn in code — there are no sprite sheets. `src/art/scenery.ts`
builds the stall as a value structure (hazy sky, mid-value ridges, dark
exterior, bright interior, near-black foreground bamboo), and the renderer
paints colour and emissive into separate buffers so the lanterns bloom properly.
Characters come from one parametric chibi rig, so all 51 named guests are data —
a palette plus hair, headwear, wings, ears and outfit. `?scene=gallery` renders
the whole cast in one screenshot.

## What is not built yet

The night loop is complete and playable. Still to come: the day phase (map
travel, gathering, merchants, quests), partners and izakaya upgrades, reward and
punishment spell cards, the Sparrow Tune rhythm minigame, and the album.

## Credits and licensing

Not affiliated with the original game or its developers. This is a fan
recreation: every asset here is original, and the music and effects are
synthesized rather than sampled.

- *Touhou Project* characters are ZUN / Team Shanghai Alice's, depicted here
  under Touhou's fan-work policy.
- Game data is derived from the [Touhou Mystia's Izakaya
  Wiki](https://touhou-mystias-izakaya.fandom.com/) (CC BY-SA) and
  [THBWiki](https://thwiki.cc/) (CC BY-NC-SA).
- Bundled fonts are Shippori Mincho and Zen Maru Gothic, SIL Open Font
  License 1.1 — see `public/fonts/LICENSE.md`.
