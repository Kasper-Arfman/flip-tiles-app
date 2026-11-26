# Releasing to the App Store and Google Play

What both stores need: accounts, the coin products, version numbers, the release check, the store listings. The automatic builds: [Android](android.md), [iOS](ios.md). Back to [the developer guide](../../index.md).

What the store version has: coins for real money (four coin packs: `src/purchases.ts`, with the
plugin [capacitor-plugin-cdv-purchase](https://github.com/j3k0/cordova-plugin-purchase)),
coins for watching a video ad (`src/ads.ts`, Google AdMob, see *Monetization* below), the app
icons and splash screen, version numbers, a privacy policy, a debug screen, and the automated
tests. The packs and the ads show only inside the native apps (and in a test build); the web
version on Netlify has neither.

**The road to a release, in order.**

1. **Test build**: `TEST_BUILD = true` in `src/dev.ts`. The packs are free and shown everywhere,
   and a pretend 5-second ad stands in for real ads in the browser, so everything around them
   can be tested without a store or an ad account: the coins arrive, they stay after a restart,
   *Reset progress* gives bought coins back. On a phone, a test build shows Google's *test ads*.
   Hand this build to testers (Internal testing on Google Play, TestFlight on iOS).
2. **Store purchases and ads**: set up the four products in both stores and your AdMob account
   (below), set `TEST_BUILD = false`, and test a real purchase with the stores' test accounts
   (nothing is charged) and the ads with test ads.
3. **Release**: fill in the contact address in `public/privacy.html` and your real AdMob ids,
   raise the version, commit, and `npm run release` (it refuses anything left undone, see
   *Releasing* below). Then build and upload.

**Accounts (once).**
- Apple: the [Apple Developer Program](https://developer.apple.com/programs/) ($99 a year). In
  App Store Connect, sign the *Paid Apps* agreement and fill in bank and tax details, or nothing
  can be sold.
- Google: a [Play Console](https://play.google.com/console) account ($25 once), and a *payments
  profile* (merchant account) under *Settings → Payments profile*.

**The products (in each store).** Four *consumables*, with exactly these ids (from
`COIN_PACKS` in `src/monetization.ts`):

| Id | Coins | Price |
| --- | --- | --- |
| `coins_pack_1` | 100 (`BASE_COINS`) | $0.99 |
| `coins_pack_2` | 300 | $1.99 |
| `coins_pack_3` | 700 | $3.99 |
| `coins_pack_4` | 3,000 | $14.99 |

- App Store Connect → your app → *In-App Purchases* → **Consumable**, each id with its price
  (a point on Apple's price list; it shows each country's own price, e.g. €0.99).
- Play Console → your app → *Monetize → In-app products* → create each id with its price (the
  console fills in the other countries; check them), and activate it.
- The price is set only there, never in the code: the shop shows what the store says, in the
  player's own currency. A pack the store doesn't know yet is simply not shown. The stores keep
  about 15% (both have a lower fee for small developers: Apple's *Small Business Program* and
  Google's 15% tier; Apple's must be applied for).
- **Changing prices** (as often as you like): change the price in both stores, and `price` in
  `COIN_PACKS` (only used for the "+49% coins" labels). **Changing what a pack gives**: change
  `coins` there (and the product's description in the stores). Never change or reuse an id: a
  store never lets an id be used again; for a new pack, add a new id.

**Testing a purchase without paying (do this before any public release).** Both stores have test
buyers whose purchases are never charged:
- Apple: App Store Connect → *Users and Access → Sandbox* → add a test account; on the iPhone, sign
  in to it under *Settings → App Store → Sandbox Account*. Every purchase from an app built by
  Xcode or from **TestFlight** then goes through the sandbox: a dialog says *[Sandbox]*, nothing
  is charged.
- Google: Play Console → *Settings → License testing* → add your Google account; upload the app
  to the **Internal testing** track and install it from the link. The payment sheet then offers
  *Test card, always approves*: nothing is charged.
- Check: all four prices show, the first purchase adds double the coins and later ones the pack's
  coins, closing the dialog adds nothing, and the coins are still there after closing and
  reopening the app. Only then promote it to a public release.

What protects buyers (in `purchases.ts`): coins are added and saved *before* the store is told the
purchase is done (an app that stops in between gets the purchase again at its next start), each
purchase is credited once (by its transaction id), and *Reset progress* gives bought coins back.

**Version numbers.** One place: `"version"` in `package.json` (now `1.0.0`). `npm run sync` (and
so `npm run android`, `npm run ios`, `npm run release`) writes it into both native projects
(`scripts/sync-version.mjs`): the version players see (`1.0.0`) and the build number the stores
compare (`10000`: 10000 x major + 100 x minor + patch). Both stores refuse an upload whose
build number isn't higher than the last, so raise the version before every upload:
`npm version patch` (1.0.0 → 1.0.1; `minor` and `major` for bigger steps). It shows at the
bottom of the home screen.

**Releasing.** `npm run release` runs, in order: the release check (`scripts/release-check.mjs`:
stops when `TEST_BUILD` or `DEV_MODE` is on, the privacy policy has no contact yet, an AdMob id is
still Google's sample or a placeholder, or anything isn't committed), then all the tests
(`npm run check`), then the build and the copy into the native projects. Only when it passes,
build and upload as below.

**Building for Android (Windows works).** `npm run android` opens Android Studio. There, *Build →
Generate Signed App Bundle*: create a *keystore* the first time (keep the file and its passwords
safe and backed up, outside the project: every update must be signed with the same one), and
upload the `.aab` in the Play Console, first to *Internal testing*.

**Building for iOS (needs a Mac: GitHub lends one).** A GitHub release builds and uploads it to
TestFlight on a cloud Mac; the setup is in [iOS](ios.md). On your own Mac: `npm run ios`; in
Xcode, *Signing & Capabilities*: pick your team; then *Product → Archive* and upload.

**App icon and splash screen.** Made from `public/icon.svg` by `npm run icons`
(`scripts/make-icons.mjs`): it draws the pictures into `assets/`, then `@capacitor/assets` makes
every size both platforms need. On Android the icon is *adaptive*: the phone cuts it to its own
shape (circle, squircle), so the tiles sit in the middle with room around them. Run it again
after changing the icon.

**Store listings ask for:** screenshots, a short description, an age rating, and a **privacy
policy URL**. The policy is `public/privacy.html`, so it is online at
`https://<your site>.netlify.app/privacy.html` once this branch's build is on Netlify (or put
the file on any website). Both stores also ask what data the app collects; with ads, the answer is
no longer "nothing":
- Google Play, *App content*: **Contains ads: yes**. *Data safety*: *Device or other IDs*
  (advertising ID) and *App interactions*, collected by the AdMob SDK, shared with Google, for
  *Advertising* and *Fraud prevention*, not optional only in the sense that ads need them (ads
  themselves are optional). Google's own guide lists what AdMob collects:
  [AdMob data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure).
- Apple, *App Privacy*: *Identifiers → Device ID*, *Usage Data → Advertising Data*, *Diagnostics*,
  used for **Third-Party Advertising**, and *linked to the user / used for tracking* only when the
  player allowed tracking. Apple's guide: [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- Target audience / age: not for children (under 13). An app for children may only show
  certified family-safe ads, with other rules (Google's *Families* policy).

**The online leaderboards** (ranked mode): see *Ranked mode* under *How the app works*. They are
the one part of the game that talks to the game's own server, and only for players who join: the
stores' privacy forms must then also say "name and game results, for leaderboards, optional".
