# Flip Tiles: documentation

Flip Tiles is a 5×5 tile-flipping puzzle for Android, iOS and the web: a web app (Vite +
TypeScript) wrapped in native apps with [Capacitor](https://capacitorjs.com). For what the game
is, see the [README](https://github.com/Kasper-Arfman/flip-tiles-app#readme).

## Developer guide

- [Setting up](developer/setup.md): what to install, the first run, all the commands
- **Testing**
  - [In the browser](developer/testing/web.md): day to day, the automated tests, the leaderboards locally
  - [On Android](developer/testing/android.md): the emulator, your own phone, live reload
  - [On iOS](developer/testing/ios.md)
- **Deploying**
  - [The web version and the leaderboards](developer/deploy/web.md) (Netlify)
  - [Android](developer/deploy/android.md): a GitHub release builds, signs and uploads to Google Play
  - [iOS](developer/deploy/ios.md): a GitHub release builds, signs and uploads to TestFlight
  - [What both stores need](developer/deploy/stores.md): accounts, coin products, versions, listings
- [Monetization](developer/monetization.md): coins, ads, prices, AdMob

## The code

- [The project, file by file](structure.md): what each file does and how they relate
- [How the app works](game/how-it-works.md): every part of the game explained
- [The levels](game/levels.md): how they are chosen
- [Learning log](learning-log.md): what was learned along the way
