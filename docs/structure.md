# The project, file by file

What each file is for, and how they relate. Read the source in roughly this order: the game
(`src/game/`), the levels and progress, the screens, then ranked mode and money. Back to
[the documentation](index.md).

## How it fits together

```
index.html ─► src/main.ts ─► a screen (src/screens/*) ─► the board (src/game/*)
                 │                 │
                 │                 ├─► what the player has: src/progress.ts (+ skins.ts, levels/)
                 │                 ├─► ranked mode: src/ranked/*  ─► the server: netlify/
                 │                 └─► money: monetization.ts, purchases.ts, ads.ts, adRewards.ts
                 └─► start-up: log.ts, sound.ts, the store and the ads
```

The game is a web app (Vite + TypeScript, no framework): each screen is a function that returns
an HTML element. Capacitor wraps the built web app (`dist/`) in the Android and iOS apps.

## The game itself: `src/game/`

| File | What |
| --- | --- |
| `flipTiles.ts` | the puzzle: board encoding (a 25-bit number), flips and forces, solving, reading the solution tables |
| `createFlipTiles.ts` | builds a `<flip-tiles>` board widget (its markup), with options |
| `FlipTilesElement.ts` | the widget's behaviour: taps and holds, moves, undo/redo, hint marks, animations |
| `flip-tiles.css` | the widget's look |

## Start-up and app-wide: `src/`

| File | What |
| --- | --- |
| `main.ts` | starts the app: loads what is saved, shows the screen the address asks for, starts the store and the ads |
| `nav.ts` | the screens' addresses (`#/tier/4`, `#/level/4/7`, ...) and going back |
| `progress.ts` | what the player has, saved on the device: stars, coins, hints, skins, which stages are open, the tutorial |
| `levels/levels.ts`, `levels/levels.json` | the levels (made by `scripts/curate-levels.mjs`: don't edit the JSON by hand), grouped in stages |
| `skins.ts` | the colors (skins) and tile shapes sold in the shop, and putting a look on |
| `sound.ts` | the sounds, made in code (Web Audio), and the sound on/off setting |
| `log.ts` | a small log on the device (errors, purchases), shown on the debug screen |
| `selfCheck.ts` | checks every level against its stored solutions (unit tests, and the debug screen on a phone) |
| `dev.ts` | the two build switches: `DEV_MODE` and `TEST_BUILD` (both `false` for a release) |
| `sw.js` | the service worker: the web version plays offline |
| `styles.css` | the look of every screen |
| `globals.d.ts` | types for the build's constants (`__APP_VERSION__`, `__BUILD__`) |

## Money: `src/`

| File | What |
| --- | --- |
| `monetization.ts` | **every number about money**: hint cost, coin packs, bonuses, how ads pay, the AdMob ids |
| `purchases.ts` | buying coin packs through the App Store and Google Play (native apps only) |
| `ads.ts` | rewarded video ads (Google AdMob), consent, and a pretend ad in test builds |
| `adRewards.ts` | the rules of ads: welcome and daily bonus, the stack of 3, the daily limit |

## The screens: `src/screens/`

| File | What |
| --- | --- |
| `ui.ts` | shared pieces: the top bar, stars, coins, locks, notices |
| `home.ts`, `homeArt.ts` | the home screen (stages, Ranked, coins, round buttons) and its background art |
| `tier.ts` | a stage's levels, in groups |
| `level.ts` | a level: goals, hints, the board, the result |
| `replayDialog.ts` | the popup that replays your best solves |
| `flipsWarning.ts` | the warning before a very hard flips-only level |
| `codex.ts` | the Codex (draw a pattern, see its solution), and the shared `popup()` |
| `shop.ts` | the shop: your look, colors and shapes, mystery boxes |
| `topUp.ts` | getting coins: the Top up popup (video, packs) and *Watch a video?* |
| `howToPlay.ts` | the rules |
| `ranked.ts` | ranked mode's screens: the lobby, a game, the leaderboards |
| `debug.ts` | the debug screen (tap the version 5 times): build info, store, ads, log, test tools |

## Ranked mode: `src/ranked/` and `netlify/`

| File | What |
| --- | --- |
| `ranked/puzzles.ts` | makes random puzzles of an exact difficulty |
| `ranked/rules.ts` | the rules, shared by the app and the server: time limit, scores, checking a game |
| `ranked/ranked.ts` | the player's ranked games on the device |
| `ranked/unlock.ts` | which difficulties are open (by stars earned) |
| `ranked/online.ts` | sending games to the server and fetching the leaderboards |
| `netlify/leaderboard.ts` | the server's logic: storing games, working out the leaderboards |
| `netlify/functions/ranked.mts`, `netlify.toml` | the Netlify Function that serves it at `/api/ranked/*` |

## Scripts: `scripts/` (run with `npm run ...`)

| File | Command | What |
| --- | --- | --- |
| `curate-levels.mjs` | `curate` | picks the levels from all boards |
| `make-icons.mjs` | `icons` | the app icons and splash screens from `public/icon.svg` |
| `sync-version.mjs` | (in `sync`) | the version from `package.json` into both native projects |
| `release-check.mjs` | `release-check` | refuses a release with test settings or placeholders left |
| `android-live.mjs` | `android:live`, `android:tunnel` | the app on your phone with live reload |
| `seed-leaderboard.mjs` | `seed` | made-up players on the local test leaderboards |

## Tests

| Folder | What |
| --- | --- |
| `tests/` | unit tests (Vitest): the game, levels, progress, purchases, ads, ranked, the leaderboard server; `helpers.ts` and `setup.ts` start a fresh app for each |
| `e2e/` | smoke tests (Playwright): the built game played in a browser, as a player would |

## Everything else

| Path | What |
| --- | --- |
| `public/` | copied into the build as is: the solution tables (`flip-tiles/*.bin.gz`), icons, the web manifest, `privacy.html`, `app-ads.txt` |
| `assets/` | the source pictures for the native icons and splash screens |
| `assets/store/` | the store listings: in `android/` Google Play's feature graphic and phone screenshots, in `ios/` the App Store's iPhone and iPad screenshots (`scripts/make-store-images.mjs`); the coin pack pictures (`make-pack-images.mjs`); and in `listing/` the texts pasted by hand into the stores: Google Play's title and descriptions, and `app-store.md` for App Store Connect (lengths checked by `scripts/check-listing.mjs`) |
| `android/`, `ios/` | the native projects (made by Capacitor, kept in git: permissions, ad ids, signing) |
| `capacitor.config.ts` | the app id and name |
| `vite.config.ts`, `tsconfig.json`, `playwright.config.ts` | build, TypeScript and smoke test settings |
| `.github/workflows/` | GitHub Actions: the checks on every push, and the store releases |
| `docs/` | this documentation (GitHub Pages) |
| `CLAUDE.md` | notes on the puzzle and the project's origin, for AI assistants |
| `TODO.md` | the current to-do list |
