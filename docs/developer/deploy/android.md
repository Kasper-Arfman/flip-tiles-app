# Deploying: Android (Google Play)

A release is one step once this is set up: **publish a GitHub release** with a tag like `v1.2.3`.
The workflow `.github/workflows/release-android.yml` then:

1. runs the release check (`npm run release-check`: no test build, real ad ids, privacy contact, ...)
   and the tests;
2. takes the version from the tag (`v1.2.3` → `1.2.3`, build number `10203`) and builds the game;
3. builds the Android app bundle (`.aab`) and **signs it with your upload key**, from GitHub secrets;
4. attaches the `.aab` to the GitHub release;
5. uploads it to Google Play's **internal testing** track.

You then check it on your phone (internal testers get it from the Play Store) and **promote it to
production by hand** in the Play Console (*Testing → Internal testing → Promote release*). That last
click is on purpose: nothing reaches players without you looking at it first.

What the stores need in general (accounts, the coin products, version numbers, store listing):
[Releasing to the stores](stores.md). Back to [the developer guide](../../index.md).

## The first release, step by step

The shortest way from "account verified, secrets set" to the app in the Play Console. Do the
[one-time setup](#one-time-setup) below first (the five secrets).

1. **Create the app in the Play Console.** *Home → Create app*: name *Flip Tiles*, default
   language, *Game*, *Free* (it can't become paid later; the coin packs are fine in a free app),
   tick the declarations, *Create app*.
2. **Build the `.aab` with a GitHub pre-release.** On GitHub: *Releases → Draft a new release* →
   *Choose a tag* → type `v1.0.0` → *Create new tag on publish*, target `main`. Title `1.0.0`,
   tick **Set as a pre-release**, *Publish release*.
   - A pre-release skips the release check, so the current test build (`TEST_BUILD = true`,
     Google's test ads) is fine for internal testing. A normal release runs the check and stops
     until everything on the [road to a release](stores.md) is done.
   - The iOS workflow doesn't start: it is off until the repository variable `IOS_RELEASE` is
     `true` (see [iOS](ios.md)).
3. **Wait for the run** under *Actions → Release Android* (about 5 to 10 minutes). It will be green,
   and its summary page will say **"Not uploaded to Google Play"**. That is expected the first time:
   Google only accepts uploads through the API for an app that already has a build.
4. **Download `app-release.aab`** from the release page on GitHub (under *Assets*).
5. **Upload it by hand.** Play Console → your app → *Test and release → Testing → Internal
   testing* → *Testers* tab: create an e-mail list with your own Google account, save. Then
   *Create new release* → accept *Play App Signing* (Google keeps the signing key; your
   `upload.jks` is only the upload key) → drop in the `.aab` → *Next* → *Save and publish*.
6. **Install it on your phone**: the *Testers* tab has a *Copy link*. Open it on your phone, accept,
   and install from the Play Store. Internal testing builds are usually there within minutes.
   - **"Webpage not available, localhost:5173"**: the phone still has your own test install (from
     `npm run android:live`, the same app id, loading the game from the dev server), and the Play
     Store opened that one. Uninstall Flip Tiles from the phone, then install it from the Play
     Store. The same goes the other way: uninstall the store version before `npm run android:live`
     (a phone can't have two apps with one id, signed by different keys).

From now on it is automatic. For every next version:

1. A new tag, higher than the last (`v1.0.1`, `v1.1.0`, ...): the stores refuse a build number
   they already have.
2. Pre-release for test builds, a normal release for a store version (the release check then
   runs).
3. The run uploads to internal testing by itself. If its summary says *"uploaded as a draft"* (an
   app that was never published only takes drafts): Play Console → *Internal testing* → the
   release → *Save and publish*.

## From test build to the Play Store

A pre-release is a **test build**: free coin packs, Google's test ads. The real version needs
these, in order (the release check names whatever is still missing:
`npm run release-check -- --android`):

1. **Real ads**: an AdMob account with the Android app and a *Rewarded* ad unit, the ids in the
   code, and the GDPR message ([Monetization](../monetization.md), *Setting up ads*). The iOS ids
   can wait until iOS: the Android workflow only checks Android's.
2. **The coin packs** in the Play Console (*Monetize with Play → Products → In-app products*): the
   four ids from [Releasing to the stores](stores.md). Creating products needs an uploaded build
   (done) and a payments profile. Add yourself under *Settings → License testing*, so test
   purchases cost nothing.
3. **The privacy policy**: your contact address in `public/privacy.html`, pushed, so it is online
   on the Netlify site (its URL goes in the store listing).
4. **`TEST_BUILD = false`** in `src/dev.ts`, commit, push.
5. **A normal release** (not a pre-release), e.g. `v1.1.0`: the release check now runs, and the
   build goes to internal testing like before. On your phone, check everything with real ads (watch
   them, but never tap them: Google closes accounts for clicking your own ads; or add your phone as
   a test device in AdMob) and a test purchase (*Test card, always approves*).

**Then the Play Store.** New personal developer accounts must first run a **closed test with at
least 12 testers for 14 days** before Google allows production (*Test and release → Production*
shows what is still missing):

1. *Closed testing* → create a track (*Alpha* is there already) → *Testers*: an e-mail list of at
   least 12 people (friends, family; each needs a Google account), and send them the join link.
   Then on *Internal testing*, the release → **Promote release → Closed testing**.
2. Meanwhile, the console's *Dashboard → Set up your app*: store listing (icon:
   `assets/store-icon-512.png`, a 1024x500 feature graphic, at least 2 phone screenshots,
   descriptions), content rating, data safety, ads (*yes*), target audience (13+), privacy policy
   URL. What to answer: [Releasing to the stores](stores.md).
3. After 14 days with 12 testers who stayed opted in: *Production → Apply for production access*
   (a few questions about the test). Once granted: the closed testing release → **Promote release
   → Production**. Google reviews it (hours to a few days), then it is in the Play Store.

## One-time setup

### 1. The upload key (signs every update)

Google Play only accepts updates signed with the same key, so this key must never be lost or
leaked. Make it once, on your own computer (Android Studio's Java has `keytool`):

```sh
"C:\Program Files\Android\Android Studio\jbr\bin\keytool" -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

It asks for a password (twice) and your name. Then:

- keep `upload.jks` and its password in a **password manager** (and a second safe place), never in
  the project folder: `.gitignore` refuses `*.jks` anyway;
- in the Play Console, use **Play App Signing** (the default for new apps): Google keeps the real
  signing key, and `upload.jks` is only the *upload* key. If it is ever lost, Google can reset it.

### 2. A service account (lets GitHub upload to Google Play)

1. [Google Cloud Console](https://console.cloud.google.com) → a project → *IAM & Admin → Service
   accounts* → *Create*. No roles needed there.
2. On the account: *Keys → Add key → JSON*: a `.json` file downloads. Keep it secret like the key.
3. [Play Console](https://play.google.com/console) → *Users and permissions* → *Invite new users*:
   the service account's e-mail address, with access to this app: *Release to testing tracks*
   (and *Release to production* only if you ever want the workflow to do that too).
4. The very first upload must be done by hand (Play Console → your app → *Internal testing* →
   upload an `.aab` built by Android Studio or by this workflow run by hand from the *Actions* tab):
   Google only accepts API uploads for an app that exists.

### 3. The GitHub secrets

GitHub → the repository → *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | What |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `upload.jks` as text: in PowerShell, `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks")) \| Set-Clipboard`, then paste |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore's password |
| `ANDROID_KEY_ALIAS` | `upload` (the `-alias` above) |
| `ANDROID_KEY_PASSWORD` | the key's password (the same as the keystore's, unless you chose another) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | the whole content of the service account's `.json` file |

Secrets can be replaced but never read back, also not by you: keep the originals in the password
manager. Workflows only get them on this repository, never in pull requests from forks.

### How the signing works

`android/app/build.gradle` signs a release build when `ANDROID_KEYSTORE_FILE` (and the passwords)
are in the environment, which the workflow sets from the secrets. Without them (on your own
computer) a release build is unsigned, and Android Studio's *Build → Generate Signed App Bundle*
still works as before.

## Making a release

1. Everything committed and pushed to `main`, the checks green (the *Checks* workflow).
2. GitHub → *Releases → Draft a new release* → a new tag `v1.2.3` (higher than the last: the
   stores refuse an equal or lower build number), a title, what's new.
3. *Publish release*. Follow it under *Actions*. Both the Android and the [iOS](ios.md) workflow
   start.
4. When it is green: try the internal testing version on your phone, then promote it in the Play
   Console.

A workflow can also be started by hand (*Actions → Release Android → Run workflow*): it then builds
and uploads the version in `package.json`.
