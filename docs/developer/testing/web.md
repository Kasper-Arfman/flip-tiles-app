# Testing: in the browser

Most testing happens here. Back to [the developer guide](../../index.md).

## In the desktop browser (most of the time)

Run `npm run dev` and open the Local URL. To see it at phone size, open DevTools (`F12`) and
turn on the device toolbar (`Ctrl+Shift+M`): pick a phone and the mouse acts as a finger
(tap-and-hold to force works). The *Console* tab shows errors.

## Type check and production build

```sh
npm run build     # fails on type errors; writes dist/
npm run preview   # serves dist/ exactly as the app will get it
```

Run this before testing on a phone: the phone gets `dist/`, not the dev server.

## In your phone's browser (quick, no install)

With `npm run dev` running, open the Network URL in the phone's browser (same Wi-Fi). If
Windows asks whether Node.js may use the network, allow it on *private* networks. This is a
quick check of touch and screen size, but it is still a browser, not the app.

## Automated tests

See *Testing before an update* above: `npm test` (unit tests) and `npm run test:e2e` (the built
game in a browser), or both with `npm run check`.

## Ranked mode: testing the leaderboards on your computer

`npm run serve` runs the whole site on this computer at **http://localhost:8888**: the game (with
live reload, like `npm run dev`) and the leaderboards' function, with a data store of its own.
Nothing is uploaded, no Netlify credits are used, and the live leaderboards are never touched.
Test every change to the leaderboards here first; deploy only what works.

To see busy leaderboards, fill the local ones with made-up players: with `npm run serve`
running, run `npm run seed` in a second terminal (100 players with about 11,000 real games, a few
minutes; `npm run seed -- 30` for 30). The script (`scripts/seed-leaderboard.mjs`) only sends to
localhost and refuses any other address, so the live leaderboards are safe. Its games are
checked by the server like any others. The players' scores are spread evenly from 0:05 to 4:55
(each one sends its score, as the app does, and plays games of about that time). To start over, stop
the server and delete the folder `.netlify/blobs-serve` (all local leaderboard data).

Plain `npm run dev` (port 5173) has no leaderboard server: its leaderboards say they need a
connection. That is on purpose, so testing never writes to the live leaderboards.

## Testing before an update

Three layers, from fast to real. Run the first two before every commit you hand out; they need
nothing but this computer.

1. **`npm test`**: the unit tests (`tests/`, with [Vitest](https://vitest.dev)), under a
   second. They check the puzzle logic and solvers (`game.test.ts`), that every level is solved
   by its stored solutions in the right number of moves (`levels.test.ts`), and what the player
   keeps (`progress.test.ts`): stars, unlocking (Beta at 5 stars, then 80%), coins and stage
   rewards, purchases credited once and given back by *Reset progress*, saves from older versions
   converted, the moves star taken back when a solve used too many forces, the Codex, replays,
   and copying a save. Each test starts the app on a save of its choosing, with the phone's
   storage replaced by one in memory (`tests/setup.ts`). `npm run test:watch` reruns them on
   every change.
2. **`npm run test:e2e`**: the smoke tests (`e2e/`, with [Playwright](https://playwright.dev)):
   the built game in Microsoft Edge at phone size, played as a player would. A new player plays
   the tutorial and keeps the stars after a reload; every screen opens; forces run out; the
   coin pack works (test builds); the debug screen's checks pass; and the web version plays
   offline. Any error on the page fails the test. When one fails, it names a `trace.zip`:
   `npx playwright show-trace <that file>` replays the test step by step.
   `npm run check` runs the type check, both kinds of tests, in one go.
3. **On phones**: Internal testing (Google Play) and TestFlight (iOS), with a test build, then
   with real store purchases (above). Things only a phone can show: touch, the store, the
   back button, closing the app in the middle of a purchase.

**The debug screen.** Tap the version at the bottom of the home screen 5 times. It shows which
build this is (version, git commit, build time: a `*` after the commit means it was built with
uncommitted changes), what is saved, what the store answered (price, errors), and the log: the
last 200 errors and events, kept on the phone (`src/log.ts`), such as a purchase coming in or an
old save converted. *Run the checks* checks every level and the saving on that phone. A tester
with a problem can *Copy log* and *Copy save* and send them to you; in a test build, *Load
save* puts their save on your phone, to see what they see. Nothing is sent anywhere by itself:
there is no crash reporting service. Crashes of the app itself (not its web page) also appear in
the Play Console (*Android vitals*) and in Xcode's *Organizer* for TestFlight builds.
