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
