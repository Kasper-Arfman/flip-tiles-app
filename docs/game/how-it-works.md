# How the app works

Every part of the game, one by one. Back to [the documentation](../index.md).

- **Sounds** (`src/sound.ts`). Made on the spot with the browser's Web Audio API, so there are no
  sound files: each sound is a few short tones (an *oscillator*, a sine or triangle wave) or a
  burst of noise, with a volume that rises in a few milliseconds and then fades (an *envelope*;
  without the quick rise a sound starts with a click). A tile flip is a light tock, a force a
  deeper thunk, a solve four soft bells up a major chord (a pure tone plus two fainter overtones
  that fade faster, like a marimba), each star a ding as it lands, three stars or a completed
  stage a fanfare, a coin landing in the pouch a ting; in ranked a hint gives a blip, the last 10
  seconds tick, and a loss falls. Every button gives a soft tap (one listener on the whole page).
  The speaker button on the home screen turns the sound off; that is saved apart from the
  progress (Reset progress keeps it). The tiles don't know about sounds: the board tells the page
  that a tile was pressed (the event `flip-tiles-press`) and `main.ts` plays the sound. On an
  iPhone the sounds follow the silent switch (`audioSession.type = "ambient"`).
- **Ranked mode** (`src/ranked/`, screens in `src/screens/ranked.ts`, `#/ranked`). The player
  picks a mode (*Flips only*, the default, or *Fewest moves*) and a difficulty (the number of
  moves of the solution: 4 to 12 flips, or 4 to 8 moves), and gets a random puzzle made on the spot
  (`puzzles.ts`: random moves on a solved board, kept only when the solvers confirm it can't be
  done in fewer). A difficulty opens with stars (`unlock.ts`):
  - *Flips only* n: every level of the stage of number n (4 Delta, ..., 12 Mu) has its flips-only
    star; the stage's other stars don't matter;
  - *Fewest moves* n: every level with an n-move solution, in every stage (the groups labelled
    "n moves" on the stage screens: Delta's, Epsilon's, ...), has its fewest-moves star.

  Tapping a locked difficulty opens a popup listing those groups with how many of their levels
  have the star; each one links to its group on the stage's screen.

  The lobby has *How ranked works* as underlined text under Play; it opens the rules in a popup.
  Its buttons: the trophy (top right) opens Top Ranked Players, the high-scores list (in Your
  record) the leaderboard of the mode and difficulty chosen.

  The rules, in `rules.ts`, are shared with the server:
  - a stopwatch runs from the moment the puzzle appears; 5 minutes, or it's a loss;
  - only a solve in exactly the difficulty counts, never a longer one; the forces are limited as
    on the levels;
  - no hints to buy, but from 3:00 the board shows one move of a solution, and one more every 30
    seconds (`HINT_AFTER`, `HINT_EVERY` and `hintsAt` in `rules.ts`; the solution is
    `hintSolution` in `puzzles.ts`), marked like the hints on the levels;
  - the Codex stays open (the clock keeps running);
  - the rank on a leaderboard is the *score*: a weighted average time that starts at 5:00 and
    moves 1/10 of the way to each game's time, so a new player starts at the bottom, climbing
    takes many good games, and newer games count a little more (`SCORE_UPDATE_RATE` in `rules.ts`).
    Everyone is on a leaderboard from their first game there;
  - a loss (time's up, giving up, leaving) counts as a *penalty* F, chosen so that 5 *good
    games* (`RECOVER_GAMES`) (each in half your score s) bring you back to where you were. With w = 1/10 and
    r = 1 − w, one loss makes the score r·s + w·F, and n good games after it make it
    rⁿ·(r·s + w·F) + (1 − rⁿ)·s/2. Setting that equal to s gives

        F = (s / w) · ((1 − (1 − rⁿ)/2) / rⁿ − r)      (about 4.5 × s for n = 5)

    and the penalty is the smaller of F and 5:00 (`lossPenalty` in `rules.ts`). So most players
    lose the full 5:00, but on a leaderboard where people score 0:04 a loss costs about 0:18
    instead of wiping out a long run of fast games. A win slower than the penalty counts as the
    penalty, so finishing is never worse than giving up;
  - the overall leaderboard, *Top Ranked Players*, ranks first by the number of leaderboards a
    player is on (more is higher), then by their average place on them, then by their average
    score on them, so playing well everywhere beats being best at one. Times are shown in
    minutes and seconds;
  - *Peter Pathetic*, a made-up player, is on every leaderboard with the worst score (5:00, no
    games), so none is empty; he always comes last overall (`netlify/leaderboard.ts`).

  **No cheating by leaving** (`ranked.ts`): the game is saved as *active* before the puzzle is
  shown. Leaving its screen (back arrow, Android's back button) asks first and then counts as a
  loss; an active game found when the app starts (it was closed, crashed or reloaded) is a loss,
  and the lobby says so. The clock is the wall clock, so it runs on in the background, and within
  a run of the app the steady clock (`performance.now`) keeps setting the phone's clock back from
  taking time off.

  **Offline and online**: games are saved on the device, and the lobby's record works offline.
  A player who joins the leaderboards (a name; duplicates allowed) has their games sent with a
  random device id (`online.ts`), at once or when the connection is back. The server
  (`netlify/leaderboard.ts`) checks every game again: the puzzle has the stated difficulty, a win
  is a real solve by the rules, not faster than a human can tap. It can't check the time itself:
  a tampered app could send made-up times, the limit of a game that plays offline. The score on a
  leaderboard is the one the player's app reports with its games (and at every start), so it is
  always the same as in the game, also for players whose games were scored with an older
  version; it counts only where the server has a real game of theirs. Device ids are
  stored only as a hash and never shown. Once joined, a player can change their name, not leave.

  **A player is an install.** The id lives in the app's saved data, so it survives updates of
  the app, but not uninstalling it, and every browser and address is a separate player too (the
  dev server, a draft deploy, the website, each phone's app). The old entry stays on the server,
  under the old id. Test deploys (an address with `--`, see `netlify/functions/ranked.mts`) keep
  their games in a separate store (`ranked-test`), apart from the real leaderboards.

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
  (`.tier-card.complete` in `styles/screens/home.css`). Completing a stage pays 50 coins (`STAGE_REWARD`):
  the solve that earns its last star shows "Stage complete!" without buttons and goes to the
  menu by itself, where "+50" rises from the stage's card and its coins burst out and fly into
  the coin pouch, which counts up (`payStageRewards` in `progress.ts`, `flyCoins` in `home.ts`;
  the wallet remembers which stages were paid, so each pays once). After a stage's last level
  otherwise, the button under the stars says *Menu* and leads home.
- **Unlocking.** A stage opens when 80% of all the stars of the stages before it are earned
  (`UNLOCK_SHARE` in `progress.ts`, rounded up: Gamma needs 17 of the 21 of Alpha and Beta, ...),
  so the cost grows with the game. The one exception is Beta, which opens at 5 of Alpha's 9 stars
  (`BETA_STARS`) so new players get going quickly. Or a stage opens right away for 100 coins
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
- **Coins.** A new player gets 100 (`STARTING_COINS`). More come from completing stages, from
  watching a short video, and from coin packs bought in the app (see *Monetization: coins, ads
  and prices*; all the numbers are in `src/monetization.ts`).
- **The shop** (`#/shop`: the bag button on the home screen, or tap your coins) sells the look
  of the tiles in two separate parts, which go together in any combination: **colors** (the two
  colors of the tiles, called *skins* in the code: 25 to find besides Classic) and **shapes** (the outline of every tile: a
  heart, a paw, a flower, a strawberry, a kitty, a ghost, ...: 12 to find besides the square).
  Each has its own mystery box of 25 coins (`SKIN_COST`): a random one you don't have yet, each
  equally likely (`buyMysterySkins`, `buyMysteryShapes` in `progress.ts`); it shakes, the lid pops
  off and the new look's board flips in (`openBox` in `shop.ts`). One box at a time (an *Open 10*
  button is gone).
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
- **Your moves on the board.** Every move made shows on its tile: a tiny filled diamond, gold
  for a flip and red for a force (told apart by color: the shapes were too alike at this size);
  a tile both flipped and forced gets a gold and red checkerboard diamond. Making the same move
  again undoes it and its mark goes away. This is in the widget (`draw` in
  `FlipTilesElement.ts`), so the replays show it too. Once solved, these marks and the hints'
  fade out after a moment (so the last move is seen filling its slot), for the celebration.
- **Hints.** On a level, the goals "N moves" and "N flips" are buttons: tap one to show its
  hints on the board, and buy the next hint for 10 coins (`HINT_COST`) with the Hint button, at
  the top right above the goals (with ▶ Replay next to it once there is a solve to watch; no
  text around them). A hint marks one move of a
  solution for that goal: a hollow diamond (a slot), gold = flip that tile, red = force it, and
  making the move fills the slot with its diamond. A tile that needs both gets the two slots
  side by side, slightly apart. All of these marks are in `flip-tiles.css`. The solutions are
  stored with the levels by the curation script (`solutionFlips`, `solutionMoves`), so the app
  needs no solver. The order of moves doesn't matter, so the marks stay right whatever the
  player has done.
- **Replay.** A solve that earns the flips star or the moves star is recorded as that star's
  solve. *▶ Replay* (only there once one of them is earned) opens a popup
  (`src/screens/replayDialog.ts`) with a tab for each; a tab stays locked until its star is
  earned. Nothing plays by itself: the board's < and >, or a tap on the tile of the next move,
  step through the moves. Each move is marked on its tile with its number, in a gold circle for a
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

- **Limited forces**: a level gives the player as many forces as its fewest-forces solution in
  *minMoves* moves needs (`maxForces` in `levels.ts`, which is simply the forces of `solutionMoves`:
  0 on Beta to Delta, up to 5 later). Red diamonds above the board show them like the hearts of a game: full, and one empties per force used;
  the widget refuses another force (`maxForces` in `FlipTilesElement.ts`) and the row shakes.
  A moves star earned before the limit, whose recorded solve used too many forces, is taken back
  at the next start (`enforceForceLimits` in `progress.ts`). Solves that earned only *Solve it*
  aren't recorded, so that star can't be checked and stays.
- **Codex** (`#/codex`: the light-bulb button on the home screen, with a red bubble counting the entries earned and not made yet). Every completed stage
  earns one. Its pattern is at most that many forces from a solved board: Alpha 1, the last three stages 3, all others 2
  (`entryForces` in `progress.ts`). The player picks how many forces to use with − and + (the gray tiles depend on it), places them (red diamonds on top show how many are left; < and Reset take them back) and presses Discover;
  the flips-only solution then stays visible, as gold diamonds, on this screen and in the
  *Codex* popup on every level. That popup shows all 12 as a grid of boards with nothing but
  their solutions (gray until made), and a pill switches between the flips-only and the fewest-moves
  solutions (`solveMoves` in `flipTiles.ts`: gold to flip, red to force). Flips alone solve only one board in four, so tiles that can't
  lead to a solvable pattern are gray, worked out again after every force (`tilesToForce`). The solution is calculated on the phone (`solveFlips` in
  `flipTiles.ts`): the flips of the first row, 32 ways, decide all the others, for both solved
  colors, and the shortest is kept. (Saved under the key `discoveries-v1`, the feature's old name: renaming a saved key would lose what players made.) One entry can be cleared for 50 coins, all of them for 50
  each up to 200 in all. Only a completed stage earns a new one.

**Adding a plugin** (as was done for Preferences): `npm install @capacitor/<name>`, then
`npm run sync` so the native projects get its native half. In the browser, most plugins fall
back to a web version (Preferences uses `localStorage`).

**Testing the levels in the browser:** `npm run dev`, then play. On a computer, right-click
forces a tile. To try a locked difficulty, open it with coins. To start over (stars, coins,
hints, solutions), use *Reset progress* at the bottom of the home screen.
