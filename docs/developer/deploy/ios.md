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

1. **Apple Developer Program** ($99 a year) and, in [App Store Connect](https://appstoreconnect.apple.com),
   the app itself (*Apps → +*), with the bundle id `com.kasperarfman.fliptiles`, and the *Paid
   Apps* agreement signed (for the coin packs).
2. **Capabilities**: in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers)
   → the app's identifier → enable *In-App Purchase*.
3. **An API key**: App Store Connect → *Users and Access → Integrations → App Store Connect API* →
   *+*, role **App Manager**. Download the `.p8` file (only possible once!) and note its *Key ID*
   and the *Issuer ID* shown above the list.
4. **Your Team ID**: [developer.apple.com/account](https://developer.apple.com/account) → *Membership details*.
5. **The GitHub secrets** (*Settings → Secrets and variables → Actions*):

| Secret | What |
| --- | --- |
| `APPSTORE_API_KEY_ID` | the key's *Key ID* |
| `APPSTORE_API_ISSUER_ID` | the *Issuer ID* |
| `APPSTORE_API_PRIVATE_KEY` | the whole content of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` lines |
| `APPLE_TEAM_ID` | your Team ID |

Keep the `.p8` file in your password manager too: it can't be downloaded again (a new key can be
made, and the old one revoked).

6. **Switch it on**: *Settings → Secrets and variables → Actions → Variables* → *New repository
   variable* `IOS_RELEASE` = `true`. Until then a release only builds Android (so it can go out
   before the Apple setup is done); *Actions → Release iOS → Run workflow* still works by hand.
   A release marked *pre-release* skips the release check (a test build for TestFlight).

## Good to know

- GitHub's Mac minutes count ten times against the free minutes of a private repository; a
  release takes about 10 to 15 minutes. Public repositories run free.
- The first build may need a manual step in App Store Connect (export compliance: the game uses
  no encryption beyond HTTPS, so answer *None of the above*). To skip that question for every
  build, add `ITSAppUsesNonExemptEncryption` = `NO` to `ios/App/App/Info.plist`.
- Without a cloud Mac, the manual way still works on any Mac: `npm run ios`, then in Xcode
  *Product → Archive → Distribute App*.
