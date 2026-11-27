# The App Store listing

What App Store Connect asks for, ready to paste: *your app → App Information* (name, subtitle,
category, age rating), *the version page* (texts, URLs, screenshots, review notes), *App Privacy*.
The limits are Apple's; `node scripts/check-listing.mjs` counts them. A text shared with Google
Play is kept once, in its own file in this folder, and linked here: copy it from there. (Google
Play uses [title.txt](title.txt), [short-description.txt](short-description.txt) and
[full-description.txt](full-description.txt).)

## App Information

**Name** (30): [title.txt](title.txt)

If Apple says the name is taken, try `Flip Tiles: Logic Puzzle` or `Flip Tiles Puzzle`.

**Subtitle** (30):

```
Turn the whole board one color
```

**Category**: primary *Games*, subcategories *Puzzle* and *Board*.

**Content rights**: *does not contain third-party content*.

**Age rating** (the questionnaire): **Yes** to *Advertising* (the rewarded video ads) and to
*In-App Purchases* (the coin packs); *None* for all content (violence, mature themes, ...); *No*
to unrestricted web access, gambling, contests, and user-generated content or messaging (other
players only see a leaderboard name). Result: 4+. (The ads are Google's to keep suitable; in
AdMob, set the content rating of the ad units to *G* or *PG*.)

## The version page

**Promotional text** (170; can be changed any time, without a new review):

```
Flip a tile and its four neighbours flip too. 223 hand-picked puzzles, three stars each, and a ranked mode against the clock. How few moves do you need?
```

**Keywords** (100, commas, no spaces; words in the name and subtitle count already, so they aren't repeated):

```
logic,brain,teaser,grid,tile,flip,mind,iq,strategy,relaxing,offline,math,switch,game,levels
```

**Description** (4000): [full-description.txt](full-description.txt)

**Support URL**: `https://fliptilespuzzle.netlify.app/support.html` (`public/support.html`)

**Marketing URL** (optional): `https://fliptilespuzzle.netlify.app`

**Privacy Policy URL** (on *App Privacy*): `https://fliptilespuzzle.netlify.app/privacy.html`

**Copyright**: `2026 Kasper Arfman`

**Screenshots**: `assets/store/ios/iphone-*.png` (1206x2622) under *iPhone 6.1"/6.3" Display*, `ipad-*.png` under
*iPad 13" Display* (`node scripts/make-store-images.mjs`).

**Product page header** and **Search results** (optional, iOS 27 and later): `assets/store/ios/header.png`
(3840x1646) and `assets/store/ios/search-results.png` (3840x2560), from the same script. Check
them in App Store Connect's preview: the board (and the words) must stay inside the safe area.

**App Review Information**: no sign-in needed (leave *Sign-in required* off). Contact: your name,
phone and email. **Notes** (4000): [app-review-notes.txt](app-review-notes.txt). They answer the questions of App
Review's *Guideline 2.1 - Information Needed*, the first submission's rejection. Attach the screen
recording (see below) to the reply, or put its link where the notes say so.

The screen recording: on the iPhone, *Settings → Control Center*, add *Screen Recording*; then
start it from Control Center, and launch the app from the home screen. Follow the order of point
1 (about 2-3 minutes). For the purchase, sign in to a *Sandbox Apple Account* (*Settings →
Developer*, or App Store Connect → *Users and Access → Sandbox*) so nothing is really paid. Upload
it (e.g. as an unlisted YouTube video or a shared iCloud link) and put the link in the Notes, or
attach the file in the reply in App Store Connect.

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

*Data collection: Yes.* Then, per data type (what to tick, from `docs/developer/deploy/stores.md`;
the AdMob rows follow Google's [Apple privacy disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure),
check it there when the SDK is updated):

| Data type | Used for | Linked to the user | Tracking |
| --- | --- | --- | --- |
| Identifiers → Device ID | Third-Party Advertising, Analytics, App Functionality | No | Yes (only after the player allows tracking) |
| Location → Coarse Location (AdMob, from the IP address) | Third-Party Advertising | No | Yes |
| Usage Data → Advertising Data (and Product Interaction) | Third-Party Advertising, Analytics | No | Yes |
| Diagnostics → Crash, Performance, Other Diagnostic Data | Analytics, App Functionality | No | No |
| User Content → Gameplay Content (ranked games, if joined) | App Functionality | No | No |
| Contact Info → Name (leaderboard name, if joined) | App Functionality | No | No |
