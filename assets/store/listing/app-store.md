# The App Store listing

What App Store Connect asks for, ready to paste: *your app → App Information* (name, subtitle,
category, age rating), *the version page* (texts, URLs, screenshots, review notes), *App Privacy*.
The limits are Apple's; `node scripts/check-listing.mjs` counts them. The Google Play texts are in
this folder too (`title.txt`, `short-description.txt`, `full-description.txt`).

## App Information

**Name** (30):

```
Flip Tiles - Color Puzzle
```

If Apple says the name is taken, try `Flip Tiles: Logic Puzzle` or `Flip Tiles Puzzle`.

**Subtitle** (30):

```
Turn the whole board one color
```

**Category**: primary *Games*, subcategories *Puzzle* and *Board*.

**Content rights**: *does not contain third-party content*.

**Age rating** (the questionnaire): *None* for everything, *No* to unrestricted web access,
gambling and contests. Result: 4+. (The ads are Google's to keep suitable; in AdMob, set the
content rating of the ad units to *G* or *PG*.)

## The version page

**Promotional text** (170; can be changed any time, without a new review):

```
Flip a tile and its four neighbours flip too. 223 hand-picked puzzles, three stars each, and a ranked mode against the clock. How few moves do you need?
```

**Keywords** (100, commas, no spaces; words in the name and subtitle count already, so they aren't repeated):

```
logic,brain,teaser,grid,tile,flip,mind,iq,strategy,relaxing,offline,math,switch,game,levels
```

**Description** (4000):

```
Tap a tile and it flips, together with its four neighbours. Your goal: make every tile on the 5x5 board the same color, all green or all gold. Easy to learn, surprisingly deep to master.

★ 223 HAND-PICKED PUZZLES
Twelve stages, from Alpha to Mu, each one a step harder. We checked all 33 million possible boards and selected 223 of the most interesting puzzles, all unique, and all waiting to be solved!

★ THREE STARS PER LEVEL
• Solve it, any way you like
• Solve it in the fewest flips possible
• Solve it in even fewer moves, but using "forces" to change individual tiles

★ RANKED MODE
Race the clock on freshly generated puzzles. Choose your difficulty, beat your best time and, if you like, climb the online leaderboards.

★ MAKE IT YOURS
Collect 24 color themes and 13 tile shapes with the coins you earn.

★ PLAY YOUR WAY
• Plays fully offline, no account needed
• Stuck? Use a hint, or open the Codex to learn the patterns
• No forced ads: watch a short video only when you want extra coins
• Relaxing sounds, and quick levels that fit in any spare minute
• Made for iPhone and iPad

A modern take on a classic logic puzzle. How few moves do you need?
```

**Support URL**: `https://fliptilespuzzle.netlify.app/support.html` (`public/support.html`)

**Marketing URL** (optional): `https://fliptilespuzzle.netlify.app`

**Privacy Policy URL** (on *App Privacy*): `https://fliptilespuzzle.netlify.app/privacy.html`

**Copyright**: `2026 Kasper Arfman`

**Screenshots**: `assets/store/ios/iphone-*.png` under *iPhone 6.9" Display*, `ipad-*.png` under
*iPad 13" Display* (`node scripts/make-store-images.mjs`).

**App Review Information**: no sign-in needed (leave *Sign-in required* off). Contact: your name,
phone and email. **Notes**:

```
No account or sign-in is needed. Tap a tile to flip it and its four neighbours; make all tiles one color. In levels that allow it, tap and hold a tile to "force" it (changes only that tile). The first two levels are a short tutorial.

Coins: the four coin packs are consumable in-app purchases (Top up, in the shop). A rewarded video ad is optional and only plays when the player taps to watch one, for coins; the App Tracking Transparency prompt appears before the first ad.

Ranked mode (home screen) works offline; joining the online leaderboard is optional and only asks for a display name.
```

## In-App Purchases (each coin pack)

Type *Consumable*. Reference name and display name as below; the *review screenshot* for each:
`assets/store/ios/iphone-5.png` (the shop). The coin pack pictures (`coins_pack_*.png`) can be
used as their *promotional image* (optional).

| Product ID | Reference name | Display name (30) | Description (45) | Price |
| --- | --- | --- | --- | --- |
| `coins_pack_1` | Coins 100 | 100 Coins | A small pouch of coins for hints and looks. | $0.99 |
| `coins_pack_2` | Coins 300 | 300 Coins | A bag of coins for hints, colors and shapes. | $1.99 |
| `coins_pack_3` | Coins 700 | 700 Coins | A chest of coins: the most popular pack. | $3.99 |
| `coins_pack_4` | Coins 3000 | 3,000 Coins | A treasure of coins: the best value. | $14.99 |

## App Privacy

*Data collection: Yes.* Then, per data type (what to tick, from `docs/developer/deploy/stores.md`):

| Data type | Used for | Linked to the user | Tracking |
| --- | --- | --- | --- |
| Identifiers → Device ID | Third-Party Advertising | No | Yes (only after the player allows tracking) |
| Usage Data → Advertising Data | Third-Party Advertising | No | Yes |
| Diagnostics → Other Diagnostic Data (crash, performance) | Third-Party Advertising | No | No |
| User Content → Gameplay Content (ranked games, if joined) | App Functionality | No | No |
| Contact Info → Name (leaderboard name, if joined) | App Functionality | No | No |
