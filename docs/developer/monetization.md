# Monetization: coins, ads and prices

Back to [the developer guide](../index.md).

All the numbers are in one file, **`src/monetization.ts`**: what a hint costs (`HINT_COST`, 10
coins), the coin packs (`BASE_COINS` and `COIN_PACKS`), the first-purchase bonus, and how ads pay.
Change them there; the shop, the levels and the tests follow.

**Coin packs** (real money, in the apps; set up in the stores as above): 1, 3, 7 and 30 times
`BASE_COINS` for $0.99, $1.99, $3.99 and $14.99. The shop shows how many more coins per dollar each
gives than the smallest (+49%, +74%, +98%), a *Most popular* and a *Best value* ribbon, and the
**first purchase gives double coins** (`FIRST_PURCHASE_MULTIPLIER`): the first purchase is the
hardest one to make.

**Ads: rewarded videos only.** The player taps to watch a short video and gets coins: exactly one
hint (`AD_REWARD = HINT_COST`). No ad ever interrupts the game, which players hate and which
gets bad reviews. To make watching attractive, and coming back too:
- *Free hint* right where it is needed: on a level, when there aren't enough coins for a hint, a
  **▶ Free hint** button: the video pays the hint and the hint opens.
- **Welcome bonus**: the very first video pays 3× (`AD_WELCOME_MULTIPLIER`).
- **Daily bonus**: the first video of each day pays 2× (`AD_DAILY_MULTIPLIER`): a reason to come
  back every day.
- **Scarcity**: videos come in a stack of 3 (`AD_STACK`) that refills one every 20 minutes
  (`AD_REFILL_MINUTES`), at most 10 a day (`AD_DAILY_LIMIT`). A small, refilling supply feels
  like a gift to use up, and brings players back when it has refilled; unlimited videos would be
  grinded once and devalue the coin packs.
- Quietly placed: the shop's **Top up** button (beside *Your look*) opens a popup with the free
  video (its bonus, how many are ready, when the next one comes) and the four coin packs
  (`src/screens/topUp.ts`); the home screen has a small round **video button** (a clapperboard,
  with a badge: how many videos are ready, 1 to 3) that opens *Watch a video?*: what it pays
  (and the bonus, if any), how many are ready, when the next one comes, how many are left today,
  and *Not now* / *Watch*.

The ad bookkeeping (`src/adRewards.ts`) is saved apart from the progress, so *Reset progress*
doesn't hand out the welcome bonus again.

**Setting up ads (Google AdMob).**
1. Make an account at [apps.admob.com](https://apps.admob.com) and add the app twice (Android and
   iOS; link them to the store listings once they exist). Each gets an **app id**
   (`ca-app-pub-...~...`).
2. In each app, create an ad unit of type **Rewarded**; each gets an **ad unit id**
   (`ca-app-pub-.../...`).
3. Put them in:
   - `src/monetization.ts`, `ADMOB`: the two rewarded ad unit ids;
   - `android/app/src/main/AndroidManifest.xml`: the Android app id (`APPLICATION_ID`);
   - `ios/App/App/Info.plist`: the iOS app id (`GADApplicationIdentifier`);
   - `public/app-ads.txt`: your publisher id (`pub-...`, in AdMob under *Settings*). It must be
     online at the root of the website given in the store listings (Netlify serves it from
     `public/`); without it ads earn far less.
4. In AdMob, *Privacy & messaging*: create a **GDPR message** (Europe) and an **IDFA explainer**
   (iPhone). The app shows them before the first video (`ads.ts`), and the home screen gets a
   *Privacy settings* button where the law requires one.
5. Until all that is done, and in every test build and while developing, the app uses Google's
   **test ads** (they say "Test Ad" and pay nothing). **Never tap your own real ads**: Google
   closes accounts for it. To see real ads safely on your own phone, add it as a *test device*
   in AdMob.

The release check refuses a release until the real ids are in (each release workflow checks only
its own platform's, so Android can go out before the iOS ids exist).

**Where the money comes from, roughly.** A rewarded video pays the developer about $0.01 to
$0.03 (much more in the US and Western Europe than elsewhere); coin packs bring $0.99 to $14.99
minus the stores' 15%. A free game earns mostly from a few players who buy, and from many who
watch now and then. Watch the numbers in AdMob and the stores, and change prices and rewards in
`monetization.ts` as you learn.
