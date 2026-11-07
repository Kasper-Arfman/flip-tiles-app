# Flip Tiles

The 5x5 tile-flip puzzle as a mobile app for Android and iOS: a web app (Vite + TypeScript)
wrapped in a native app with [Capacitor](https://capacitorjs.com).

This README is also a tutorial. It is written for someone who knows some programming but is new
to mobile apps, and it grows as the project does (see [Learning log](#learning-log)).

## How the pieces fit together

```
src/  (TypeScript, HTML, CSS)
  │  Vite: type check, bundle
  ▼
dist/  (a plain static website)
  │  Capacitor: "cap sync" copies it in
  ▼
android/  and  ios/  (real native projects)
  │  Android Studio / Xcode: compile
  ▼
an app on a phone, showing dist/ in a full-screen web view
```

- **TypeScript** is JavaScript with types. The `tsc` compiler checks the types; it doesn't run
  anything.
- **Vite** is the dev server and bundler. `npm run dev` serves `src/` with instant reload, and
  `npm run build` writes the finished site to `dist/`.
- **Capacitor** turns the site into an app. The app is a native shell with a full-screen
  browser (a *web view*) that loads `dist/` from inside the app, not from the internet. It also
  gives JavaScript access to phone features (vibration, storage, sharing...) through plugins.
- **Android Studio** (Windows, Mac, Linux) and **Xcode** (Mac only) compile the native projects
  and install them on emulators and phones.

So most of the work is web work, tested in a desktop browser. The native tools are only needed
to check the app on a phone and to publish it.

## What to install

| Tool | Needed for | Status / notes |
|---|---|---|
| [Node.js](https://nodejs.org) (LTS) | everything: runs Vite, TypeScript, Capacitor | includes `npm` |
| [Git](https://git-scm.com) | version control | |
| [VS Code](https://code.visualstudio.com) | editing | TypeScript support is built in |
| [Android Studio](https://developer.android.com/studio) | building and running the Android app | brings its own Java (JDK), Android SDK and emulator, so don't install Java separately |
| Google Chrome | debugging the app on Android (`chrome://inspect`) | Edge works too (`edge://inspect`) |
| Mac + [Xcode](https://developer.apple.com/xcode/) | building the iOS app | not possible on Windows; a cloud build service (Codemagic, Ionic Appflow) can do it |

Check what you have from a terminal:

```sh
node --version    # v20 or newer
npm --version
git --version
```

**Setting up Android Studio:** install it with the default options, then open it once and let
the setup wizard download the Android SDK. To get an emulator: *More Actions → Virtual Device
Manager → Create device*, pick a phone (e.g. Pixel), and download a recent system image.

Optional VS Code extensions: *ESLint* and *Prettier* (code style), and the *Ionic* extension,
which can run Capacitor commands from a sidebar.

## First run

```sh
npm install       # once, and after package.json changes: downloads into node_modules/
npm run dev       # start the dev server
```

`npm run dev` prints two URLs:

- `Local: http://localhost:5173/`: open it in your browser.
- `Network: http://192.168.x.x:5173/`: the same app for other devices on your Wi-Fi.

Leave it running while you work. Saving a file updates the page right away. Stop it with
`Ctrl+C`.

## Testing the app, step by step

Start at the top. Each step is slower than the one before but closer to the real thing.

### 1. In the desktop browser (most of the time)

Run `npm run dev` and open the Local URL. To see it at phone size, open DevTools (`F12`) and
turn on the device toolbar (`Ctrl+Shift+M`): pick a phone and the mouse acts as a finger
(tap-and-hold to force works). The *Console* tab shows errors.

### 2. Type check and production build

```sh
npm run build     # fails on type errors; writes dist/
npm run preview   # serves dist/ exactly as the app will get it
```

Run this before testing on a phone: the phone gets `dist/`, not the dev server.

### 3. In your phone's browser (quick, no install)

With `npm run dev` running, open the Network URL in the phone's browser (same Wi-Fi). If
Windows asks whether Node.js may use the network, allow it on *private* networks. This is a
quick check of touch and screen size, but it is still a browser, not the app.

### 4. On the Android emulator

```sh
npm run android   # build + sync + open the android/ project in Android Studio
```

In Android Studio, wait for the *Gradle sync* (bottom bar) to finish, choose the emulator in
the device menu at the top, and press the green **Run** ▶ button. The first build takes a few
minutes.

### 5. On a real Android phone

1. On the phone: *Settings → About phone*, tap *Build number* 7 times to unlock *Developer
   options*. Then in *Developer options* turn on *USB debugging*.
2. Connect it with a USB cable and accept the "Allow USB debugging?" prompt.
3. The phone appears in Android Studio's device menu: press **Run** ▶.

The app stays installed afterwards, like any other app.

### Debugging the app on Android

While the app runs (emulator or phone), open `chrome://inspect` in desktop Chrome and click
*inspect* under the app's web view. You get the full DevTools (console, elements, network) for
the app itself.

### After changing code

The native projects hold a *copy* of `dist/`. After changing web code, run `npm run sync`
(build + copy into both native projects), then press **Run** again in Android Studio.

### iOS

`npm run ios` does the same with Xcode, on a Mac. On a Mac, Safari's *Develop* menu does what
`chrome://inspect` does for Android.

### On an iPhone without a Mac: as a web app

A native iPhone app needs a Mac and the Apple Developer Program ($99/year). But the game is a
web app at heart, so it can also be played from a website, and *installed* from Safari:

1. `npm run build`, and put the contents of `dist/` online, in any folder of any website (the
   build uses relative paths, see `vite.config.ts`). The easiest way: **Netlify Drop**. Go to
   <https://app.netlify.com/drop>, make a free account, and drag the `dist` folder onto the page.
   You get an address like `something.netlify.app` (rename it under *Site configuration*). For an
   update, build again and drag the new `dist` onto the site's *Deploys* page.
2. On the iPhone, open that address in **Safari**, tap **Share → Add to Home Screen**.
3. Open the game from its new icon: full screen, without Safari's bars, like an app.

Good to know:

- What makes this work: `public/manifest.webmanifest` (name, colors, full screen), the icons in
  `public/` (`icon.svg` is the source; the PNGs are made from it), and the `apple-…` tags in
  `index.html`.
- Progress is saved on the phone, in the home-screen app. Safari in a normal tab has separate
  storage, so always play from the icon. Removing the icon removes the progress.
- An update is just putting a new build online; the app picks it up the next time it is opened
  (fully closed and reopened).
- Android phones can do the same from Chrome (*Add to Home screen*).
- It needs internet to open (there is no offline cache yet); progress is stored on the phone.
- It needs a recent iPhone system (iOS 16.4 or newer) for all the colors to show right.

### Updating the game without players losing progress

A player's progress lives on their phone (see *Saving* below), and an update only replaces the
app's files, so the progress itself survives every update. What can still make it *look* lost is
the new version no longer recognising it. Rules to keep:

1. **Never replace released levels.** Stars, hints and replays are saved by the level's board.
   A level that disappears takes them along. `npm run curate` now keeps every level that is in
   `levels.json` and prints any it had to leave out; read that line before you release.
   (`--fresh` throws them all away: only before a first release.)
2. **Locked or open is never saved.** It is worked out every time from the stars on the levels
   in the game now, in the stages above (or the group before); only coin purchases are saved.
   So stars on levels that left the game, or stars further on, never open anything.
3. **Old saved data is converted.** The wallet has a `version`; when the format changes, raise
   `WALLET_VERSION` in `progress.ts` and convert the old data in `migrate`.
4. **Keep the address.** Storage belongs to the site's address: friends must keep using the same
   `something.netlify.app` (update it from the site's *Deploys* page, never with a new drop).
5. Test an update the way a friend gets it: play the *old* build, then load the new one in the
   same browser, and check the stars are still there.

**Release check.** Before handing out a new version, the whole game was played through on the
built app (`npm run preview`), as a phone with touch (taps, and holds to force), in Chrome's
engine and in WebKit (Safari's engine), and the browser was closed and opened again to check
that stars, coins, skin, hints, replays and the first-time rules were all still there.

### Automated tests

None yet. A natural first step: unit tests (with [Vitest](https://vitest.dev)) for the move and
board logic in `src/game/flipTiles.ts`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | download the dependencies into `node_modules/` |
| `npm run dev` | dev server with live reload, also reachable from your phone |
| `npm run build` | type check, then build into `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm run sync` | build, then copy `dist/` and plugins into `android/` and `ios/` |
| `npm run android` | sync, then open Android Studio |
| `npm run ios` | sync, then open Xcode (Mac only) |
| `npm run curate` | pick the levels and write `src/levels/levels.json`, keeping the levels already released (`npm run curate -- --fresh` picks all anew: only before a first release) |

The scripts are defined in `package.json`. `cap` is the Capacitor command line; run it directly
with `npx cap ...` (e.g. `npx cap doctor` checks your Capacitor setup).

## Layout

| Path | What |
|---|---|
| `index.html` | the page Vite starts from |
| `src/main.ts` | starts the app: loads the stars, shows the screen the address asks for |
| `src/nav.ts` | the screens' addresses (`#/tier/4`, `#/level/4/7`) and going back |
| `src/skins.ts` | the skins (tile color pairs) and shapes (tile outlines) sold in the shop, and putting them on |
| `src/sw.js` | the service worker: saves the app's files on the device, so the web app plays offline (its file list is written in by `vite.config.ts` on every build) |
| `src/dev.ts` | `DEV_MODE`: shows what players must not see yet (set it to `false` for a release) |
| `src/progress.ts` | what the player has, saved on the device: stars, coins, hints, best solutions; which tiers are open |
| `src/screens/` | one file per screen (home, tier, level, how to play), shared pieces in `ui.ts`, and the home screen's background art in `homeArt.ts` |
| `src/styles.css` | the look of the screens |
| `src/levels/levels.ts` | the levels from `levels.json`, grouped by difficulty |
| `src/game/createFlipTiles.ts` | builds a `<flip-tiles>` widget (its markup), with options |
| `src/game/FlipTilesElement.ts` | the widget's behaviour: moves, history, solver, animations |
| `src/game/flip-tiles.css` | the widget's look |
| `src/game/flipTiles.ts` | board encoding, moves, and reading the solution tables |
| `public/flip-tiles/*.bin.gz` | the solution tables (first half of each, gzipped, ~5 MB each) |
| `scripts/curate-levels.mjs` | picks the levels from all boards (see [Levels](#levels)) |
| `src/levels/levels.json` | the levels, made by the script: don't edit by hand |
| `capacitor.config.ts` | app id, app name, and where the web build is (`dist`) |
| `vite.config.ts` | build settings: relative paths, so the build works from any folder |
| `public/manifest.webmanifest`, `public/icon*` | the web app's name, colors and icons (for *Add to Home Screen*) |
| `android/`, `ios/` | the native projects, generated by Capacitor (kept in git; edit app icons, permissions and such here) |
| `dist/`, `node_modules/` | generated; not in git |

The game code comes from the website (`../astro-website`, `src/components/FlipTiles.astro` and
`src/lib/flipTiles.ts`). The tables are made by the Python solver in `../flip-tiles`.

## Levels

Each level can earn three stars:

1. solve it, in any number of moves
2. solve it with flips only, in the fewest flips possible (*minFlips*)
3. solve it in the fewest moves possible, flips and forces (*minMoves*)

`npm run curate` goes through all 2^25 (33.5 million) boards. It keeps a board when:

- **minMoves < min(yellow, green)**: forcing every tile of one color doesn't earn the third star
- **it can be solved with flips only**: otherwise the second star can't be earned (only 1 in 4
  boards can)
- **minMoves ≤ minFlips**: always so (flips are moves too). When equal, the flips-only solution
  is also the fewest moves and earns both the second and third star (so in the easiest stages,
  where forces never help, a perfect flips-only solve earns all three stars)
- **minFlips ≥ 2** (`MIN_DIFFICULTY` in the script); the 1-flip stage is the hand-made tutorial
- **after δ Delta (more than 4 flips): minMoves < minFlips** (`STRICT_AFTER` in the script), so
  the third star always needs a force and a different solution than the second. (Not in Delta
  itself: no 4-flip board can be solved in fewer than 4 moves, so it would be empty.)

The difficulty (the tier, or stage) is minFlips: the flips-only star is the hard one, so a
level whose flips-only solution is longer is harder. Within a stage, levels are graded by
minMoves (fewer moves first); a grade is the row of levels between two divider lines. From γ
Gamma on, every stage has 16 to 32 levels: a stage with 1 grade has 16, with 2 or 3 grades 8 per
grade, with 4 or more grades 4 per grade (`perGrade` in the script). A grade with fewer boards
than its share is left out (it happens twice: one 2-move board at 11 flips, one 4-move board at
12 flips). The first stage, α Alpha, is a tutorial made by hand (`TUTORIAL`): the
two puzzles of How to play (a plus in the middle, 1 flip; a single odd tile in the middle, 1
force) and the one other single-tile board that flips alone can also clear (a tile diagonally
next to the middle). β Beta (2 flips) is made by hand too (`BETA`): the random 2-flip boards
were too trivial, so it has 4 chosen ones, each given by its two flips as (row, column). Then
γ Gamma (3 flips) up to μ Mu (12 flips). Rotations, mirror images and color swaps of a board
are the same puzzle, so each is kept only once; it is shown turned or mirrored at random, and in
each grade half the levels end on each color, so the color to aim for can't be guessed.

Alpha 2 and 3 (single tiles) take 8 and 11 flips for the flips-only star, far more than their
stage: the level screen marks that goal **Expert** with a red tag (`expertFlips` in
`levels.ts`: any level whose minFlips is above its stage's difficulty).

**Released levels stay.** The script first reads the current `levels.json` and keeps every level
in it, exactly as it is shown, as long as its grade still has room; new boards only fill up the
rest. At the end it lists any released level it had to leave out: players lose the stars they
earned there (see [Updating the game](#updating-the-game-without-players-losing-progress)).

The script picks the levels at random within each grade. Most boards have a middling minFlips, so a plain random pick per tier would
hardly include the easiest and hardest grades; picking per grade gives every grade the same
share. The levels are sorted by minFlips; in the app, a thin line in the level grid separates
the grades. The random picks use a fixed seed per tier, so every run picks the same levels, and
adding or removing a tier doesn't change the others. The script prints how many levels each
grade has and how many were picked.

Result of the current run:

| Stage (minFlips) | Unique levels available | Grades (minMoves) | Levels |
|---|---|---|---|
| α Alpha (1) | made by hand | 1 | 3 |
| β Beta (2) | made by hand | 2 | 4 |
| γ Gamma (3) | 318 | 3 | 16 |
| δ Delta (4) | 1,660 | 4 | 16 |
| ε Epsilon (5) | 87 | 3–4 | 16 (8 + 8) |
| ζ Zeta (6) | 2,176 | 3–5 | 24 (8 + 8 + 8) |
| η Eta (7) | 25,454 | 2–6 | 20 |
| θ Theta (8) | 108,323 | 3–7 | 20 |
| ι Iota (9) | 166,473 | 2–8 | 28 |
| κ Kappa (10) | 121,222 | 2–9 | 32 |
| λ Lambda (11) | 24,458 | 3–9 | 28 |
| μ Mu (12) | 1,625 | 5–8 | 16 |

No board needs more than 9 moves when forces are allowed. The script reads its numbers from the
solution tables; a sample of the levels was also checked with a separate brute-force solver.

## How the app works

- **Screens.** Each screen has an address after the `#` in the URL: `#/` (home), `#/how-to-play`,
  `#/tier/4`, `#/level/4/7`. When the address changes, `main.ts` builds that screen. Because
  every screen is a step in the browser history, the back button works for free, and so does
  Android's back button in the app: Capacitor goes back in the web view's history, and closes
  the app on the first screen.
- **The board** is the same `<flip-tiles>` widget as on the website. After every move it sends a
  `flip-tiles-change` event with the moves on the board; the level screen counts flips and
  forces from it and hands out the stars.
- **Saving.** Stars, coins, opened difficulties, bought hints and each level's best solution are
  saved with the Capacitor [Preferences](https://capacitorjs.com/docs/apis/preferences) plugin
  (`src/progress.ts`). Everything about a level is stored by its board, so it stays with the level
  when the levels are curated again (as long as the level stays: the curation keeps released
  levels). Reset progress also puts the start's look (Classic, the square) back on.
- **A stage on the home screen.** Its card has a progress bar of the stars earned, blue while
  under way. With every star earned the stage is complete: the bar turns gold, the card gets a
  gold trim and a crown with "Complete", and a sheen of light sweeps over it now and then
  (`.tier-card.complete` in `styles.css`). Completing a stage pays 50 coins (`STAGE_REWARD`):
  the solve that earns its last star shows "Stage complete!" without buttons and goes to the
  menu by itself, where "+50" rises from the stage's card and its coins burst out and fly into
  the coin pouch, which counts up (`payStageRewards` in `progress.ts`, `flyCoins` in `home.ts`;
  the wallet remembers which stages were paid, so each pays once). After a stage's last level
  otherwise, the button under the stars says *Menu* and leads home.
- **Unlocking.** A stage opens when 70% of all the stars of the stages before it are earned
  (`UNLOCK_SHARE` in `progress.ts`, rounded up: Beta needs 7 of Alpha's 9, Gamma 15 of the 21 of
  Alpha and Beta, ...), so the cost grows with the game; or right away for 100 coins
  (`UNLOCK_COST`). Within a stage, the levels come in groups (a grade: the levels with the same
  minMoves); the first group is open, and each next one opens when 10 stars are earned in the
  group before it (`UNLOCK_GRADE_STARS`; all its stars when it has fewer). The divider line above
  a locked group says how many stars are still needed, and the locked group next in line can be
  unlocked for 50 coins (`GRADE_UNLOCK_COST`). Locked or open is not saved: it follows from the
  stars every time (only coin purchases are saved), so only stars on levels that are in the game
  count.
- **First time: the tutorial.** The app opens a new player in level α 1 (a gold plus on green):
  a hand over the middle tile shows a tap, with "Tap to flip" under it, on the board. Solved, the
  only button is *Next level*, to α 2 (one green tile in gold), where the hand shows a tap and
  hold ("Tap and hold to force"). In each step only that move on that tile works, so it is always
  solved; the presses are caught on their way down to the board (`capture`) and only the right
  one is let through. (So the levels have no "Tap to flip, tap and hold to force" caption.) The
  hand is a white cartoon hand with a dark outline, tilted a little, the way casual games draw
  it (drawn from the "hand-pointer" icon of Font Awesome Free, CC BY 4.0); a hold is shown the common way, as a hollow ring that a growing disc
  fills, like a loading circle. Solving it ends the tutorial, with
  5 stars (`tutorialStep` in `progress.ts`, `guided` in `level.ts`). Until then every other
  screen leads back to the step they are at, and there is no back arrow, Retry, hints, or
  stepping back. A player with stars elsewhere never gets it. How to play stays behind the ?.
- **Stages.** In the app the difficulty tiers are stages named after the Greek letters: Alpha
  (difficulty 3), Beta, Gamma, ... (`STAGES` in `src/levels/levels.ts`). Their titles show the
  lower-case letter in gold before the name ("α Alpha", `stageTitle` in `ui.ts`), and a level is
  called by its stage and number ("Alpha 7"). The code and the addresses (`#/tier/3`) still
  use the difficulty.
- **Coins.** A new player gets 1,000 (`STARTING_COINS`, generous while testing). There is no way
  to earn coins yet.
- **The shop** (`#/shop`: the bag button on the home screen, or tap your coins) sells the look
  of the tiles in two separate parts, which go together in any combination: **skins** (the two
  colors of the tiles: 25 to find besides Classic) and **shapes** (the outline of every tile: a
  heart, a paw, a flower, a strawberry, a kitty, a ghost, ...: 12 to find besides the square).
  Each has its own mystery box of 25 coins (`SKIN_COST`): a random one you don't have yet, each
  equally likely (`buyMysterySkins`, `buyMysteryShapes` in `progress.ts`); it shakes, the lid pops
  off and the new look's board flips in (`openBox` in `shop.ts`). **Open 10** opens ten at once
  for 250 (`BOX_BUNDLE`, `BUNDLE_COST`: the same price per box), ten different ones, while at
  least ten are left: they come out one after the other in a grid, and you tap one to put it on.
  Some shapes have two colors: a detail drawn in the tile's other color (a daisy's core, a
  strawberry's leaves, a crown's jewels: `detail` in `SHAPES`), set as the tile's background image
  (`--skin-detail-zero`, `--skin-detail-one`), which switches with the color halfway through a
  tile's turn. The shop shows one thing at a
  time: at the top your look as it is now (a small board, with the skin's and shape's names), then
  tabs: **Skins** and **Shapes** (each with how many you have, its mystery box, and the collection
  below it) and **Extras** (Unlock all). A box is gone once there is nothing left to find, and
  the Extras tab once Unlock all has nothing left to give; the shop remembers the open tab. In a
  collection, one you own can be put on at any time, the others are gray cards with a "?". A
  skin's card shows it in your shape, a shape's card in your skin, so you see the combination.
  Both are listed in `src/skins.ts` (`SKINS` in three sections: rich & sweet, light & bright, and
  dark; `SHAPES`). A shape is a small SVG outline, used as a CSS mask on every tile
  (`--skin-shape`): what is outside it is cut away, and the page's background shows there (the
  board has no white of its own in the app). Every shape covers the middle of the tile, where the
  hint and move marks go. When the board is solved, each tile turns back into a square as the
  wave of light reaches it, so the wave and the wires play on square tiles (a CSS transition of
  `mask-image` with `transition-behavior: allow-discrete`, delayed per tile).
- **Unlock all** (the shop's Extras tab, 10,000 coins: `UNLOCK_ALL_COST`) opens every stage and
  group of levels and gives every skin and shape at once (`buyUnlockAll` in `progress.ts`); bought
  one by one that would cost over 2,000. It is gone once there is nothing left to get.
- **Taking a skin or shape out of the game** is safe: when progress loads, ones that no longer
  exist leave the wallet, and if one was on, Classic (or the square) goes on instead.
- **While building the game**, `DEV_MODE` in `src/dev.ts` shows the skins and shapes you haven't
  found yet in the shop, in their look and with their names. Set it to `false` before handing out a
  version: players see gray cards with a "?".
  A skin sets the CSS variables `--skin-zero` and `--skin-one` on the page; the board, the mini
  boards and the home screen's art take their colors from them (the art mixes lighter and darker
  shades with CSS `color-mix`). The "Solved!" text is in the skin's other color (on a board
  solved to one color, the text is the other), its hue turning very slightly from left to right.
  Stars and the logo keep their gold and green.
- **Your moves on the board.** Every move made shows on its tile: a tiny filled diamond, blue
  for a flip and red for a force (told apart by color: the shapes were too alike at this size);
  a tile both flipped and forced gets a blue and red checkerboard diamond. Making the same move
  again undoes it and its mark goes away. This is in the widget (`draw` in
  `FlipTilesElement.ts`), so the replays show it too. Once solved, these marks and the hints'
  fade out after a moment (so the last move is seen filling its slot), for the celebration.
- **Hints.** On a level, the goals "N moves" and "N flips" are buttons: tap one to show its
  hints on the board, and buy the next hint for 1 coin (`HINT_COST`) with the Hint button, at
  the top right above the goals (with ▶ Replay next to it once there is a solve to watch; no
  text around them). A hint marks one move of a
  solution for that goal: a hollow diamond (a slot), blue = flip that tile, red = force it, and
  making the move fills the slot with its diamond. A tile that needs both gets the two slots
  side by side, slightly apart. All of these marks are in `flip-tiles.css`. The solutions are
  stored with the levels by the curation script (`solutionFlips`, `solutionMoves`), so the app
  needs no solver. The order of moves doesn't matter, so the marks stay right whatever the
  player has done.
- **Replay.** A solve that earns the flips star or the moves star is recorded as that star's
  solve. *▶ Replay* (only there once one of them is earned) opens a popup
  (`src/screens/replayDialog.ts`) with a tab for each; a tab stays locked until its star is
  earned. Nothing plays by itself: the board's < and >, or a tap on the tile of the next move,
  step through the moves. Each move is marked on its tile with its number, in a blue circle for a
  flip and a red one for a force; the next move is highlighted, the moves made are faded.
- **The level grid.** A level with all three stars has a gold border; others have none.
- **Solving a level**: once the board's own solved animation has played, Solved! included
  (`RESULT_DELAY_MS` in `level.ts`), decorations come over the board, without a box: the level's
  best stars (also the ones from earlier solves) drop into an arc at the top, one after the other;
  a line under Solved! ("in 3 moves"); the buttons Retry and Next level at the bottom, in the
  skin's two tile colors with a cream rim. A soft dark fade at the top and bottom, and white text
  with a thin dark outline (like the logo's letters) for the line and the buttons, keep
  everything readable on every skin; this was checked on all skins, on boards solved to both
  colors. The stars are drawn in
  detail (`bigStarGold` in `ui.ts`); the socket under a star fades out as it lands. The solve that gives a level its third star ends
  with a finale: "Three stars!" and a gold glow behind the stars.

**Adding a plugin** (as was done for Preferences): `npm install @capacitor/<name>`, then
`npm run sync` so the native projects get its native half. In the browser, most plugins fall
back to a web version (Preferences uses `localStorage`).

**Testing the levels in the browser:** `npm run dev`, then play. On a computer, right-click
forces a tile. To try a locked difficulty, open it with coins. To start over (stars, coins,
hints, solutions), use *Reset progress* at the bottom of the home screen.

## Glossary

- **npm**: Node's package manager. `package.json` lists the packages; `npm install` fetches them.
- **Web view**: a browser without an address bar, inside a native app.
- **Emulator**: a virtual phone running on your computer.
- **Gradle**: Android's build tool; Android Studio runs it for you.
- **App id** (`com.kasperarfman.fliptiles`): the app's unique name in the stores. It can't be
  changed after the first release.

## Learning log

Notes added as the project goes along: what was learned, problems hit, and how they were solved.

- **2026-11-06**: Set up this tutorial. The project builds (`npm run build`). Next: install
  Android Studio and run the app on an emulator.
- **2026-11-06**: Wrote the level curation script (`npm run curate`). Learned: a Node script can
  do heavy one-off work at build time (here 33 million boards in under 2 seconds) so the app
  only ships the result. Scripts in plain JavaScript (`.mjs`) run directly with `node`; the
  `.mjs` ending tells Node it uses `import`.
- **2026-11-06**: Made the levels playable: home, tier grid, level screen with stars, how to play.
  Learned: a first Capacitor plugin (Preferences) for saving; hash addresses give back-button
  support without extra code. A bug worth remembering: CSS class names are global, so the new
  class `.solved` on the level screen picked up the widget's `.solved` style (meant for its
  Solved! banner) and made the whole screen invisible. Check that a class name isn't already
  in use. Tested by driving the app in Chrome from a script (Playwright).
- **2026-11-06**: Added difficulty 3 (difficulty 4 was a hard start). Learned: with one shared
  random generator, adding a tier at the front reshuffled the picks of every tier after it, so
  each tier now has its own seed.
- **2026-11-06**: Graded the levels within a tier by minFlips, with divider lines in the grid.
  Learned: picking at random follows the natural spread (most boards are middling), so to get
  easy and hard levels too, pick evenly from each grade ("stratified" sampling).
- **2026-11-06**: 5 levels per grade (190 levels in all). Difficulties now open with stars (30 in
  the one before), and a level with all three stars gets a gold border.
- **2026-11-06**: A star animation for the result (stars drop into sockets, a three-star finale)
  and anthracite menu cards. Learned: CSS custom properties (`--ink`, `--muted`) can be redefined
  inside an element, so one rule turns everything in a dark card light. And an animation with a
  delay and `fill-mode: both` shows its first frame *during* the delay; use `forwards` when the
  element should stay hidden until the animation starts.
- **2026-11-06**: Background art on the home screen: the solved-board pattern (pluses with golden
  edges), large, green with bands of gold, made as an SVG in code with an SVG noise filter
  (`feTurbulence`) for grain. Learned: an element placed *behind* the page (`z-index: -1`) is
  hidden by a background on `body`; put the page background on `html` only.
- **2026-11-07**: 28 skins (13 with pictures on the tiles), 25 coins a box, 100 coins to start.
  Learned: an SVG can be a CSS image (`url("data:image/svg+xml,...")`), but it is a document of
  its own: it doesn't see the page's CSS variables, so the colors are written into it.
- **2026-11-07**: Skins now come from mystery boxes: a random skin you don't have yet. Learned:
  `animationend` bubbles up from the element that animates, so one listener on a wrapper can
  wait for an animation inside it (the box's shake) before the next step (the reveal).
- **2026-11-07**: Stages open at a total number of stars (5, 20, 35, ...), and after Delta every
  level needs a force for the fewest moves (minMoves < minFlips). Learned: a rule can empty a
  whole tier: applied from 4 flips on, it removed the 4-flip stage (no 4-flip board is solvable
  in 3 moves) and the later stages moved up a letter (they are named by position), so the rule
  now starts after 4 flips. Print the counts per tier after changing a rule.
- **2026-11-06**: The level grid is now dark with white level tiles. Learned: `html:has(.tier-screen)`
  styles the whole page depending on which screen is in it (the `:has()` selector).
- **2026-11-06**: A game logo for the title: every letter on a puzzle tile, in the Lilita One
  font, flipping in when the home screen opens (tap a letter to flip it). How to play became a
  round ? button. Learned: a font for an app goes *inside* the app (here via the npm package
  `@fontsource/lilita-one`, which Vite bundles), not from Google Fonts, so it also works offline.
- **2026-11-06**: Coins, hints and replays (and test mode removed again). Learned: work that can be
  done once ahead of time (here: a solution per level for the hints) belongs in the build script,
  not in the app. And a custom element can offer methods to the page (`setMarks`, `playMove`,
  `resetGame`), described by a TypeScript `interface`.
- **2026-11-06**: Replay became a popup to step through recorded solves. Learned: the HTML
  `<dialog>` element with `showModal()` gives a popup with a dimmed backdrop, Escape to close and
  focus kept inside, for free. And when the format of saved data changes, old saved data must
  still be read (here: the first replay format is read as the "last solve").
- **2026-11-06**: A shop with skins. Learned: theming through CSS variables: set two variables on
  the page (`document.documentElement.style.setProperty`) and everything that uses them changes
  color at once. In an SVG, a `fill="..."` attribute can't use CSS variables, but `style="fill: ..."`
  can. And CSS relative colors, `oklch(from var(--one) l c calc(h + 18))`, make a color from
  another one: here the same lightness and saturation with the hue turned a bit (for the
  "Solved!" gradient).
- **2026-11-06**: Nine dark skins (near-black with a strong color), checkerboard previews in the
  shop, outlined hint marks. Learned: an element cut out with `clip-path` can't get a shadow or
  outline (the cut removes it too); drawing the shape as a small SVG picture instead can.
- **2026-11-07**: The web app now plays offline. Installed to the home screen from Netlify it
  didn't: an installed web app is still a website, and asks the server for its files every time
  it opens. Learned: a manifest makes a web app *installable*, a **service worker** makes it work
  *offline*. It is a small script (`src/sw.js`) the browser keeps next to the site: on the first
  visit it saves the app's files on the device (the Cache Storage), after that it answers every
  request from there. The build writes the list of files and a version into it (a little Vite
  plugin in `vite.config.ts`, after the build: the file names have hashes that change every
  build), so a new deploy gives a new service worker, which swaps in the new files on the next
  visit online. `main.ts` registers it, on the web only (not in the native apps, which have their
  files already, and not in `npm run dev`). Tested by opening the built app, stopping the server,
  and opening it again: it still started. Nothing to set up on Netlify.
- **2026-11-07**: Friends lost their progress with every update. The cause was not the storage
  but the levels: progress is saved per board, and re-running the curation with new rules had
  replaced 139 of the 153 first levels, so their stars belonged to boards no longer in the game.
  Fixed for the future: the curation keeps released levels, and the saved data has a version
  with a one-time conversion (`migrate`). (A first try also *saved* every stage once it was open,
  and opened stages by every saved star: that unlocked everything for players with many stars on
  removed levels. Now locked or open is always worked out from the stars on the current levels,
  and only coin purchases are saved.) Learned: once players have saved data, the data's *meaning* (which
  board, which group, which rule) is part of the app's contract; change it only with a migration.
  Also: stages now cost 70% of the stars before them, 16 to 32 levels per stage from Gamma on,
  an Expert tag on Alpha 2 and 3's flips star, and the reset puts the start's look back on at once.
- **2026-11-06**: Made the game installable as a web app (for an iPhone without a Mac), and the
  replay only shows the two star solutions, locked until earned; tapping the next tile steps
  forward. Learned: a *progressive web app* needs little more than a manifest, icons and a few
  tags; and events can be caught on their way *down* to an element (`capture: true`) and stopped
  there, so the element's own handlers never see them.
- **2026-11-06**: Groups of levels within a difficulty open one by one, with 10 stars in the group
  before, so a difficulty doesn't feel overwhelming. The next locked group can be bought for 50
  coins, and the difficulties are called stages: Alpha, Beta, Gamma, ...
- **2026-11-06**: New players go through How to play first; the result became a popup. Learned:
  CSS animations of an element that is hidden (`display: none`) only start when it appears, so
  their delays count from that moment.
- **2026-11-06**: The result moved onto the board itself, as decorations around Solved!, with
  skin-proof buttons and more detailed stars. Learned: to guarantee contrast whatever is behind,
  give text its own solid (or nearly solid) background, and check every case: a script that
  photographs each skin made one overview of all 32 boards.
- **2026-11-06**: Release check for the iPhone: the whole game played through by touch in Chrome
  and WebKit, with progress surviving a full close. Learned: Playwright can test in WebKit, the
  engine of Safari on an iPhone, from Windows (`npx playwright-core install webkit`), and a
  browser profile on disk (`launchPersistentContext`) stands in for an app that is closed and
  opened again.
