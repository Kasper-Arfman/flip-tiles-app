# Deploying: iOS (App Store)

iOS apps can only be built on a Mac. GitHub provides Macs in the cloud, so you don't need one:
**publishing a GitHub release** (tag `v1.2.3`) starts `.github/workflows/release-ios.yml`, which

1. runs the release check and builds the game, with the version from the tag;
2. builds and signs the iOS app on a GitHub Mac. Xcode makes and renews the certificates and
   provisioning profiles itself, through an **App Store Connect API key**: nothing to manage by hand;
3. uploads it to **TestFlight**.

Then you test it on your iPhone with the TestFlight app, and **submit it for review by hand** in
App Store Connect (*your app → the version → add the build → Submit for Review*).

What the stores need in general: [Releasing to the stores](stores.md). Back to
[the developer guide](../../index.md).

## One-time setup

All of it is done in a web browser, so Windows is fine. In this order:

1. **Apple Developer Program** ($99 a year): [developer.apple.com/programs](https://developer.apple.com/programs/).
   Enrolling as an individual takes a day or two; Apple may ask for ID.
2. **Register the bundle id**: [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers)
   → *Identifiers → +* → *App IDs → App*. Description *Flip Tiles*, **Explicit** bundle id
   `com.kasperarfman.fliptiles` (the `appId` in `capacitor.config.ts`). Under *Capabilities*,
   **In-App Purchase** is on by default; leave it on.
3. **The app in [App Store Connect](https://appstoreconnect.apple.com)**: *Apps → + → New App*,
   platform iOS, name *Flip Tiles* (it must be free on the App Store; otherwise add a word),
   language, the bundle id from step 2, and a *SKU* (any text of your own, e.g. `fliptiles`).
4. **Agreements**: *Business* (formerly *Agreements, Tax, and Banking*): sign the **Paid Apps**
   agreement and fill in bank and tax details. Without it the coin packs can't be sold, and won't
   even show in TestFlight. Apply for the **Small Business Program** too (15% instead of 30%).
5. **The coin packs**: your app → *Monetization → In-App Purchases → +* → **Consumable**, four
   times, with the ids and prices in [Releasing to the stores](stores.md) (`coins_pack_1` to
   `_4`). Each needs a display name, a description and a review screenshot (the shop:
   `assets/store/ios/iphone-5.png`). Submit them together with the first version of the app.
6. **Ads**: in [AdMob](https://apps.admob.com), add the iOS app and a **Rewarded** ad unit, and put the
   ids in `ios/App/App/Info.plist` and `src/monetization.ts` (see [Monetization](../monetization.md)).
   Also make the **IDFA explainer** message under *Privacy & messaging*.
7. **An API key**, for the cloud Mac: App Store Connect → *Users and Access → Integrations → App
   Store Connect API* → *Team Keys → +*, access **Admin** (Xcode needs Admin to make the
   distribution certificate in the cloud; with less it stops with *Cloud signing permission
   error*). Download the `.p8` file (only possible once!) and note its *Key ID* and the *Issuer
   ID* shown above the list.
8. **Your Team ID**: [developer.apple.com/account](https://developer.apple.com/account) → *Membership details*.
9. **The GitHub secrets** (*Settings → Secrets and variables → Actions*):

| Secret | What |
| --- | --- |
| `APPSTORE_API_KEY_ID` | the key's *Key ID* |
| `APPSTORE_API_ISSUER_ID` | the *Issuer ID* |
| `APPSTORE_API_PRIVATE_KEY` | the whole content of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` lines |
| `APPLE_TEAM_ID` | your Team ID |

Keep the `.p8` file in your password manager too: it can't be downloaded again (a new key can be
made, and the old one revoked).

10. **A first test build**: *Actions → Release iOS → Run workflow* (by hand, without a release).
    After 10 to 15 minutes, and some processing time at Apple, it shows under *TestFlight* in App
    Store Connect. Add yourself as an *internal tester*, install the **TestFlight** app on your
    iPhone, and play. Test the coin packs with a **sandbox account** (see [Releasing to the
    stores](stores.md)).
11. **Switch it on**: *Settings → Secrets and variables → Actions → Variables* → *New repository
    variable* `IOS_RELEASE` = `true`. Until then a release only builds Android (so it can go out
    before the Apple setup is done); *Actions → Release iOS → Run workflow* still works by hand.
    A release marked *pre-release* skips the release check (a test build for TestFlight).

## The store listing

App Store Connect → your app → the version (*1.0 Prepare for Submission*). Everything to paste
(name, subtitle, keywords, description, review notes, the coin packs' texts, the App Privacy
answers) is ready in `assets/store/listing/app-store.md`; `node scripts/check-listing.mjs`
checks the lengths against Apple's limits after a change.

- **Screenshots**: `node scripts/make-store-images.mjs` makes them in `assets/store/ios/`:
  `iphone-*.png` (1290x2796) go under *iPhone 6.9" Display*, `ipad-*.png` (2064x2752) under
  *iPad 13" Display*. Apple makes the smaller sizes from these. Up to 10 each; the first three
  are what people see in search results.
- **Text**: name, subtitle (30 characters), description and keywords (100 characters, comma
  separated). `assets/store/listing/` has the Google Play texts to start from.
- **Support URL** (`https://fliptilespuzzle.netlify.app/support.html`, from `public/support.html`)
  and **Privacy Policy URL** (`.../privacy.html`). Both are online once the site is deployed
  with them.
- **App Privacy** (the "nutrition label"): what to answer is in [Releasing to the stores](stores.md).
- **Age rating**: a questionnaire; for this game everything is *None*, which gives 4+ (the ads
  are Google's to keep suitable).
- **Build**: pick the build that came through TestFlight; under *In-App Purchases* add the four
  coin packs; then **Add for Review**.

The first review takes a day or two. Common reasons for a rejection, and what's already in place:
the purchases must work in the reviewer's sandbox (test step 10 first), and the tracking question
must say why (`NSUserTrackingUsageDescription` in `Info.plist`).

## Good to know

- GitHub's Mac minutes count ten times against the free minutes of a private repository; a
  release takes about 10 to 15 minutes. Public repositories run free.
- Export compliance (encryption): `ITSAppUsesNonExemptEncryption` = `NO` in `Info.plist` tells
  Apple the game uses no encryption beyond HTTPS, so no build waits for that question.
- The app runs on iPads too (`TARGETED_DEVICE_FAMILY = "1,2"` in the Xcode project). That is why
  iPad screenshots are needed. The game is made for phones, so on an iPad the app zooms the page
  in, like a browser's zoom (`GameViewController` in `ios/App/App/SceneDelegate.swift`): it is
  laid out smaller and drawn larger, so it fills the screen: as much zoom as leaves a page of at
  least 440 x 700 (as wide as a big phone, and tall enough for the level screen). Android tablets
  do the same (`MainActivity.java`).
- Portrait only, on both platforms (`Info.plist`, `AndroidManifest.xml`). On an iPad Apple allows
  that only with `UIRequiresFullScreen` (no Split View). On Android 16 a tablet keeps the lock
  through an opt-out property; from Android 17 tablets may turn the app anyway. Phones, and a narrow Split View window, stay at 1x. Only the iOS app does this; in a
  browser on an iPad the game is still a column in the middle.
- Without a cloud Mac, the manual way still works on any Mac: `npm run ios`, then in Xcode
  *Product → Archive → Distribute App*.
