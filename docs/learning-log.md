# Learning log

- **2026-11-22**: Ready for professional releases. GitHub Actions now runs every check on each
  push (`checks.yml`), and publishing a GitHub release builds, signs and uploads the apps
  (`release-android.yml` to Google Play's internal testing, `release-ios.yml` to TestFlight, on a
  Mac in the cloud). Learned: signing keys never go in git; they live in a password manager and in
  GitHub *secrets*, which workflows can use but nobody can read back. And the README became a
  short showcase, with the documentation split into pages here.

Back to [the documentation](index.md).

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
- **2026-11-07**: Started the branch `app-store`: buying 100 coins in the native apps. Learned:
  an in-app purchase has two halves: the store charges, then the app *delivers* and tells the
  store it is done (`finish`). Until then the store keeps handing the purchase back, so deliver
  first and finish second, and remember what was delivered (the transaction id) so nothing is
  given twice. Both stores have free test buyers (Apple's sandbox and TestFlight, Google's
  license testers): test there before anyone can pay. And `import()` (a dynamic import) makes
  Vite put a library in a separate file that is only downloaded when that code runs: the web
  version never loads the purchase plugin.
- **2026-11-09**: Each level got a limited number of forces. Learned: when a number follows from
  data you already have (the forces of the stored solution), derive it instead of storing it
  again, so the limit and the hints can never disagree.
- **2026-11-10**: Made the `app-store` branch ready for testers: a free test coin pack
  (`TEST_BUILD`), app icons, version numbers, a privacy policy, a debug screen, unit tests and
  smoke tests. Learned: test the tests, by breaking the code on purpose and checking that a test
  fails (it did, for Beta's 5 stars and for a purchase credited twice). And the smoke test for
  offline play found a real bug: a server can answer with `Vary: Origin`, and the service worker's
  saved copy of the script then didn't match the browser's request, so the web app didn't open
  offline. `ignoreVary` in `src/sw.js` fixed it.
- **2026-11-15**: Ranked mode, on the branch `ranked`: random puzzles against the clock, and
  online leaderboards on a Netlify Function. Learned: share the rules between the game and the
  server (one file, `src/ranked/rules.ts`), so they can't disagree. A smoke test with the page's
  clock fast-forwarded (`page.clock`) found a real bug the other tests missed: the first tick of
  the stopwatch ran before the screen was on the page, took that for "the screen is gone" and
  stopped the clock for good. And Vitest can fail with "failed to find the runner" when the
  folder's drive letter is written in lower case (`c:\`): run it from `C:\`.
- **2026-11-21**: Sounds, made in code with the Web Audio API instead of sound files. Learned:
  browsers only allow sound after the player has tapped something, so the audio is set up at the
  first sound (always after a tap), not when the app starts; and a sound needs an *envelope* (a
  very quick fade in, then a fade out), or it starts and stops with a click.
- **2026-11-22**: Monetization, on the branch `monetization`: four coin packs, rewarded video
  ads (Google AdMob) and a hint for 10 coins. Learned: keep every number about money in one file
  (`src/monetization.ts`), because prices change often early on; the stores own the prices, the
  code only the coins. Ads in Europe and on iPhones need the player's consent first (Google's
  consent form, Apple's tracking question), and the privacy policy and the stores' privacy forms
  must say so. And rules that depend on time (a stack of ads that refills every 20 minutes) are
  easiest to test as pure functions of a saved state and the time, so a test can jump ahead
  instead of waiting.
- **2026-11-25**: The first Google Play release, on the branch `play-release`. Learned: Google
  Play's upload API only works for an app that already has a build, so the very first `.aab` is
  uploaded by hand (the GitHub release still builds and signs it); an app that was never
  published only accepts *draft* releases; and new personal accounts need a closed test with 12
  testers for 14 days before production. A GitHub *pre-release* now skips the release check, so
  test builds can go to internal testing. Also: a file committed from Windows isn't executable on
  Linux (`git update-index --chmod=+x android/gradlew`); a square splash picture as the window's
  background is stretched to the phone's shape, so the splash is now Android's own (a color and
  the icon, in `styles.xml`); and the Play Store can say "something went wrong" a few times
  while a first build is still being prepared.
- **2026-11-25**: Getting ready for iOS while Google Play reviews, on the branch `ios-setup`.
  Learned: the whole Apple setup is done in a browser, and the build runs on a GitHub cloud Mac,
  so no Mac is needed. The order matters: register the bundle id first, then the app in App
  Store Connect can use it. The API key for the cloud Mac needs *Admin* access, because Xcode
  makes the distribution certificate itself. An app that also runs on iPads needs iPad
  screenshots, so the screenshot script now makes each store's sizes from the same shots. And
  `ITSAppUsesNonExemptEncryption = NO` saves answering the encryption question for every build.
  Later the same day: the game fills an iPad. The iOS web view has its own zoom
  (`WKWebView.pageZoom`, like a browser's zoom), so a few lines of Swift scale the phone layout
  up on big screens, without touching the CSS. CSS `zoom` would have done it too, but it breaks
  what measures the page (`100dvh` dialogs, an animation placed with `getBoundingClientRect`).
  And Android tablets the same way: Android's web view has no `pageZoom`, but
  `setInitialScale` starts the page zoomed in (counted in screen pixels, so times the screen's
  density), in `MainActivity.java`. The store pictures are now sorted per store
  (`assets/store/android/`, `assets/store/ios/`), named after the store's slot (phone, 7-inch
  and 10-inch tablet, iPhone, iPad). Also: the level screen centers the board in the room under
  the stars on tall phones (auto margins in a flex column), and the ranked lobby fits a small
  phone (360x640) without scrolling: a `max-height` media query tightens it only where needed.
- **2026-11-26**: The first iOS build, from the cloud Mac to TestFlight on an iPad (no iPhone,
  no Mac). Learned: the cloud build needs at least one registered device, even for the App
  Store (Xcode signs the archive for development first); Windows shows a connected iPad's UDID
  in its device id (`USB\VID_05AC&PID_...\<UDID>`, add the dash after 8 characters). An
  *external* TestFlight group waits for Apple's beta review; an *internal* one is there in
  minutes. And the iPad zoom from yesterday didn't hold up on a real iPad: `pageZoom` drew the
  page larger but kept laying it out at the full width, so it was too big and scrolled (the
  screenshots, made in a browser at the zoomed size, couldn't show that). Now the page sets its
  own viewport on an iPad (`width=525, initial-scale=1.54`, worked out from the screen), the
  phone way of zooming, which iOS follows. Lesson: test on the real device; a simulated screen
  only shows what the code *should* do. On the iPad it then still scrolled a little: the zoom
  left a 700 px tall page and the level screen needs 678, too close once the status bar and
  Safari's fonts take their share. Measured (a script that shrinks the browser until a screen
  scrolls): now at least 780, which leaves room on every screen. And quick taps on the board got
  lost on iOS: the board listened for `click`, and when taps come fast or overlap, the phone
  leaves some clicks out. Now a tap counts when the finger lifts (`pointerup`), and its click is
  skipped.
- **2026-11-26**: The first real release build (1.0.4: `TEST_BUILD` off, the iOS AdMob ids). A
  test build had gone to App Review because a run started by hand skips the release check, so it
  was pulled back. Learned: AdMob and in-app purchases are separate (the coin packs live only in
  App Store Connect; AdMob needs its own app per platform), and the Netlify site isn't connected
  to git, so merging into `main` put nothing online. Now a release deploys the site too
  (`release-web.yml`).
- **2026-11-26**: The one big `styles.css` split into `src/styles/` (a file per screen and per
  shared piece; `index.css` lists what is where), and every color that was written in several
  places is now one CSS variable at the top of a file (`tokens.css` for the shared ones), so a
  color is changed in one place. To be sure nothing changed by accident, a script took the
  computed style of every element on 40 screens, before and after, and compared them. Learned:
  the default button's hover is written with `:where()`, which has no weight in the cascade, so
  a button's own color already wins over it: the many `:hover` copies repeating that color could
  go. And the solved animation's timing is now a few numbers at the top of `screens/level.ts`.
- **2026-11-27**: App Review answered the first iOS submission with *Guideline 2.1 - Information
  Needed*: not a bug, but questions (a screen recording from launch on a real iPhone, the app's
  purpose, how to use it, the external services, regional differences). The answers are in the
  *Notes* of *App Review Information* (the text is in `assets/store/listing/app-store.md`).
  Learned: Apple counts leaderboard nicknames as user-generated content, so the app needs a
  filter on names, a way to report one and to block it (the leaderboards' Report), and, because
  joining stores a player on the server, a way to delete it from inside the app (Guideline
  5.1.1(v)): now *Leave the leaderboards*, at the bottom of the Leaderboards screen.
- **2026-11-27**: Bonus levels: 1440 more puzzles, up to 40 per grade, in every stage from Gamma
  on, opening when the stage is complete. Each grade is a page you swipe through. Learned: a
  swipe between pages needs no code, only CSS (`scroll-snap-type` on a sideways scrolling row, and
  `scroll-snap-align` on each page); the code only lights up the dot of the page in view. But
  only for touch: a mouse can't swipe a scrolling row, so on a computer the code drags the row
  itself (pointer events) and lets it snap on release. A stage got the same head, kept at the top
  with `position: sticky`; the code watches the scrolling to show the group in view. And a
  stage's place in the addresses and saves was its difficulty, which the bonus levels share: they
  got an id of their own (100 + the difficulty), so nothing saved before had to change.
