# Setting up

What to install, the first run, and the commands. Back to [the developer guide](../index.md).

## How the pieces fit together

```
src/  (TypeScript, HTML, CSS)
  │  Vite: type check, bundle
  ▼
dist/  (a plain static website)
  │  Capacitor: "cap sync" copies it in
  ▼
android/  and  ios/  (real native projects)
  │  Android Studio / Xcode: compile
  ▼
an app on a phone, showing dist/ in a full-screen web view
```

- **TypeScript** is JavaScript with types. The `tsc` compiler checks the types; it doesn't run
  anything.
- **Vite** is the dev server and bundler. `npm run dev` serves `src/` with instant reload, and
  `npm run build` writes the finished site to `dist/`.
- **Capacitor** turns the site into an app. The app is a native shell with a full-screen
  browser (a *web view*) that loads `dist/` from inside the app, not from the internet. It also
  gives JavaScript access to phone features (vibration, storage, sharing...) through plugins.
- **Android Studio** (Windows, Mac, Linux) and **Xcode** (Mac only) compile the native projects
  and install them on emulators and phones.

So most of the work is web work, tested in a desktop browser. The native tools are only needed
to check the app on a phone and to publish it.

## What to install

| Tool | Needed for | Status / notes |
|---|---|---|
| [Node.js](https://nodejs.org) (LTS) | everything: runs Vite, TypeScript, Capacitor | includes `npm` |
| [Git](https://git-scm.com) | version control | |
| [VS Code](https://code.visualstudio.com) | editing | TypeScript support is built in |
| [Android Studio](https://developer.android.com/studio) | building and running the Android app | brings its own Java (JDK), Android SDK and emulator, so don't install Java separately |
| Google Chrome | debugging the app on Android (`chrome://inspect`) | Edge works too (`edge://inspect`) |
| Mac + [Xcode](https://developer.apple.com/xcode/) | building the iOS app | not possible on Windows; a cloud build service (Codemagic, Ionic Appflow) can do it |

Check what you have from a terminal:

```sh
node --version    # v20 or newer
npm --version
git --version
```

**Setting up Android Studio:** install it with the default options, then open it once and let
the setup wizard download the Android SDK. To get an emulator: *More Actions → Virtual Device
Manager → Create device*, pick a phone (e.g. Pixel), and download a recent system image.

Optional VS Code extensions: *ESLint* and *Prettier* (code style), and the *Ionic* extension,
which can run Capacitor commands from a sidebar.

## First run

```sh
npm install       # once, and after package.json changes: downloads into node_modules/
npm run dev       # start the dev server
```

`npm run dev` prints two URLs:

- `Local: http://localhost:5173/`: open it in your browser.
- `Network: http://192.168.x.x:5173/`: the same app for other devices on your Wi-Fi.

Leave it running while you work. Saving a file updates the page right away. Stop it with
`Ctrl+C`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | download the dependencies into `node_modules/` |
| `npm run dev` | dev server with live reload, also reachable from your phone |
| `npm run build` | type check, then build into `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm test` | the unit tests (`tests/`), once; `npm run test:watch` keeps rerunning them |
| `npm run test:e2e` | the smoke tests (`e2e/`): the built game in Edge |
| `npm run check` | type check, unit tests and smoke tests: run before handing out a version |
| `npm run sync` | write the version into the native projects, build, then copy `dist/` and plugins into `android/` and `ios/` |
| `npm run android` | sync, then open Android Studio |
| `npm run ios` | sync, then open Xcode (Mac only) |
| `npm run release` | the release check, `check`, then `sync`: refuses a test build or uncommitted changes |
| `npm run icons` | make the app icons and splash screens from `public/icon.svg` |
| `npm version patch` | raise the version (1.0.0 → 1.0.1) before an upload to the stores |
| `npm run curate` | pick the levels and write `src/levels/levels.json`, keeping the levels already released (`npm run curate -- --fresh` picks all anew: only before a first release) |

The scripts are defined in `package.json`. `cap` is the Capacitor command line; run it directly
with `npx cap ...` (e.g. `npx cap doctor` checks your Capacitor setup).

## Glossary

- **npm**: Node's package manager. `package.json` lists the packages; `npm install` fetches them.
- **Web view**: a browser without an address bar, inside a native app.
- **Emulator**: a virtual phone running on your computer.
- **Gradle**: Android's build tool; Android Studio runs it for you.
- **App id** (`com.kasperarfman.fliptiles`): the app's unique name in the stores. It can't be
  changed after the first release.
