# Trader Drain Ladder

A drain-laddering calculator for Anarchy Online Traders, built for the Project
Rubi-Ka emulator (game patch 18.4). Enter your Psychological Modifications /
Time & Space and it shows the shortest ladder to the strongest Deprive + Ransack
pair you can have running together, the total drain and buff, and what is still
out of reach.

Static site: plain TypeScript built with Vite, no backend, no tracking, no
external requests.

## Commands

```sh
npm install
npm run dev       # local dev server
npm test          # unit tests (Vitest)
npm run build     # type-check and build to dist/
npm run preview   # serve dist/ locally
```

## Laddering rules the calculator uses

From the item data (`data/drains.json`):

- There are two drain nanolines. Deprive and Divest Skills are one line;
  Ransack and Plunder Skills are the other. 16 drains each.
- Every drain requires the same value of Psychological Modifications and Time &
  Space, and nothing else except profession. No drain has a level requirement.
- Each drain puts a debuff on the target and casts a self-buff on the Trader
  that adds the same amount to all 23 attack and nano skills, PM and TS included.
- The self-buffs of the two lines sit in different nanolines.

Assumed game rules (not stated in the item data):

- One drain per line runs at a time, and a higher one replaces a lower one.
- The two lines' self-buffs add together, as do the two debuffs.
- A cast is checked against own skill + other buffs + both running self-buffs,
  including the buff that the cast is about to replace.

The "best ladder" is the fewest casts that reach the top drain of each line;
between equally short ladders, the one costing less nano.

The two Nanite Improved drains carry an extra requirement (`Cyberdeck & 6`)
that the calculator cannot evaluate. They are left out unless the tick box on
the page is set. See `data/GAPS.md`.

## Project layout

| Path | What |
|---|---|
| `data/drains.json` | The nano data, generated. Do not edit by hand. |
| `data/GAPS.md` | Every null field and everything not confirmed for 18.4. |
| `scripts/scrape_auno.py` | Builds `data/drains.json` from auno.org. |
| `src/domain/` | Pure laddering logic and its tests. No DOM. |
| `src/data/catalog.ts` | Turns the JSON into the domain catalog; throws on bad data. |
| `src/ui/` | View model, SVG diagram and HTML rendering. |

## Updating the data

The data comes from auno.org item pages, each taken at the item version that
was in force at patch 18.4 (auno keeps a patch history per item).

1. Refresh from auno.org (Python 3, standard library only):

   ```sh
   rm -rf .cache/auno        # optional: forces every page to be re-downloaded
   npm run data              # runs scripts/scrape_auno.py
   ```

   To add or remove a nano, edit `DRAIN_IDS` at the top of
   `scripts/scrape_auno.py`. To target another patch, change `TARGET_PATCH`
   and `PATCH_CUTOFF` there.

2. Review the change: `git diff data/drains.json`. Update `data/GAPS.md` if a
   field became null or a new unknown appeared. Never fill a gap by guessing.

3. Run `npm test`. The tests are worked by hand from the current data, so a
   changed value can legitimately fail one: check the arithmetic in the test's
   comment against the new data before changing an expected value.

If auno.org starts refusing plain requests (it sits behind bot protection),
save the item pages by hand into `.cache/auno/` as `<id>_current.html` and
`<id>_<patch number>.html` (patch 15.9 is `15090000`) and run the script again;
it reads the cache first.

## Deploying (Cloudflare Pages)

One-time setup:

```sh
npx wrangler login
npx wrangler pages project create trader-drain-ladder --production-branch master --force
```

`--force` is needed only for that one command: current Wrangler versions
otherwise try to create a Workers project instead of a Pages one. The project
already exists (https://trader-drain-ladder.pages.dev), so this step is done.

Each deploy:

```sh
npm run deploy    # builds, then: wrangler pages deploy dist --project-name trader-drain-ladder
```

Wrangler keeps its login outside the repository. Do not commit API tokens;
`.env*` and `.dev.vars` are git-ignored.
