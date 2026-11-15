# Flip Tiles on Android: testing before release

This guide takes you from "the game works in the browser" to "the game runs as a real Android
app on an emulator and on your own phone", so you can test it before anything goes to the Play
Store. No Android Studio experience needed. The steps for the Play Store itself (signing,
uploading, store listing) are in [README.md](README.md#releasing-to-the-app-store-and-google-play-branch-app-store).

Work on the branch `app-store`: that is the version with the coin pack, the icons and the debug
screen.

## How it fits together

The game is a web app. Capacitor wraps it in a small Android app: an app whose whole screen is
a web view (a browser without bars) that shows the game. So:

- `npm run build` makes the game (`dist/`), exactly as on the web.
- `npm run sync` copies that build **into** the Android project (`android/`). The Android app
  only ever has the copy from the last sync.
- Android Studio turns the `android/` folder into an app and puts it on an emulator or a phone.

The one rule to remember: **after changing the game's code, run `npm run sync` again**, then
press Run in Android Studio. Otherwise the app shows the old version.

## 1. One-time setup

### Android Studio and the SDK

1. Install [Android Studio](https://developer.android.com/studio) (done).
2. Open it once and go through the setup wizard with the *Standard* choices. It downloads the
   Android SDK (the tools and system files for building apps) to
   `C:\Users\Kasper\AppData\Local\Android\Sdk`. This takes a while; let it finish.

### Java 21 for Gradle (needed: the project won't build without it)

Android apps are built by **Gradle**, a build tool that runs on Java. Android Studio comes with
Java 25, but this project's Gradle (8.14) only runs on Java up to 24, and Capacitor 8 is made for
Java 21. Without this step the build stops with *"Unsupported class file major version 69"*.

1. Open the project in Android Studio (step 2 below), or any project.
2. *File → Settings* (Windows), then *Build, Execution, Deployment → Build Tools → Gradle*.
3. At **Gradle JDK**, open the list and choose **Download JDK…**: version **21**, vendor e.g.
   *Eclipse Temurin* or *JetBrains Runtime*. Click *Download*, then *OK*.
4. Android Studio asks to sync: click **Sync Now** (or see *Gradle sync* below).

## 2. Open the project

In a terminal in this project folder:

```sh
npm run android
```

This builds the game, syncs it into `android/`, and opens the `android/` folder in Android
Studio. (You can also open Android Studio yourself, *File → Open*, and pick the `android` folder
inside this project, **not** the project folder itself.)

### Gradle sync

When the project opens, Android Studio first *syncs* it: Gradle reads the project and downloads
what it needs. Watch the bottom-right corner: a progress bar with *Gradle sync*. The first time
this takes several minutes. Wait until it's gone before doing anything else.

- Sync failed? The *Build* window opens at the bottom with the error. The most common one here:
  the Java version (see Java 21 above). After fixing, sync again: the elephant icon with an arrow
  in the top right toolbar (*Sync Project with Gradle Files*), or *File → Sync Project with
  Gradle Files*.

### Where things are in Android Studio

Android Studio has a lot of windows; for this project you need only a few.

| Where | What | What you use it for |
|---|---|---|
| Toolbar, top middle | the **device menu** (a phone name, or *No Devices*) | choose where the app runs: an emulator or your phone |
| Toolbar, next to it | the green **Run ▶** button | build the app and start it on that device |
| Toolbar | the red **Stop ■** button | stop the app |
| Right edge | **Device Manager** (phone icon) | create and start emulators |
| Right edge | **Running Devices** | shows the emulator's screen (or your phone's, mirrored) inside Android Studio |
| Bottom edge | **Logcat** (cat icon) | the log of the device: errors from the app show here |
| Bottom edge | **Build** | build progress and build errors |
| Left edge | **Project** | the files of `android/`; you rarely need to edit anything here |

Hidden a window? *View → Tool Windows* lists them all.

## 3. Test on an emulator (a virtual phone on your computer)

### Create one (once)

1. Open **Device Manager** (right edge; or *View → Tool Windows → Device Manager*).
2. Click **+** → **Create Virtual Device**.
3. Pick a phone, e.g. **Pixel 8** → *Next*.
4. Pick a system image: the newest *API* level with a download icon → click the download icon,
   wait, then select it → *Next*.
5. *Finish*. It now appears in the Device Manager.

### Run the game

1. In the device menu at the top, choose your emulator.
2. Press **Run ▶**. The first build takes a few minutes (Build window at the bottom); later ones
   take seconds.
3. The emulator starts in the **Running Devices** window and opens Flip Tiles.

The mouse is your finger: click to tap, **click and hold** to force a tile. The buttons next to
the emulator turn it, change the volume, and press **Back** (the triangle). Typing on your
keyboard types into the emulator.

The app stays installed on the emulator: you also find it in the emulator's app list, with the
game's icon (long-press it there to see the icon with Android's round mask).

### When the emulator is slow or won't start

- It needs *hardware virtualization*. If Android Studio says it's off, turn on **Virtualization
  (VT-x / AMD-V / SVM)** in your computer's BIOS/UEFI settings, and on Windows make sure
  *Windows Hypervisor Platform* is on (*Turn Windows features on or off*).
- Close other heavy programs; an emulator uses a few GB of memory.

## 4. Test on your own Android phone

The real thing: real touch, real speed, real screen. Do this before every release.

### Over USB

1. On the phone: *Settings → About phone* → tap **Build number** 7 times. It says "You are now a
   developer". (On some phones *Build number* is under *Software information*.)
2. *Settings → System → Developer options* (the place varies a little by brand) → turn on
   **USB debugging**.
3. Connect the phone to the computer with a USB cable. On the phone, accept **"Allow USB
   debugging?"** (tick *Always allow from this computer*).
4. The phone now appears in Android Studio's device menu. Choose it, press **Run ▶**.

The app is installed on the phone and stays there like any other app, also after unplugging.
Running it again from Android Studio updates it; your progress in it stays.

### Without a cable (Wi-Fi)

Phone and computer on the same Wi-Fi, Android 11 or newer: in *Developer options* turn on
**Wireless debugging**. In Android Studio, device menu → **Pair Devices Using Wi-Fi**, and scan
the QR code with the phone (*Wireless debugging → Pair device with QR code*).

### See the phone's screen on the computer

*Running Devices* can mirror a connected phone: in *Settings → Tools → Device Mirroring*, turn
on mirroring of physical devices. Handy for screenshots for the store listing.

## 5. Find out what's wrong

### The game's own debug screen

On the home screen, scroll down and **tap the version 5 times**. You see which build you have
(version and git commit: check you are testing what you think you are testing), what is saved,
what the store answered, and the game's log. **Run the checks** checks every level and the saving
on that phone. See *Testing before an update* in [README.md](README.md#testing-before-an-update).

### Chrome's DevTools for the app (the best tool)

With the app running on the emulator or a connected phone:

1. Open **Chrome** on your computer (Edge works too: `edge://inspect`), and go to
   `chrome://inspect`.
2. Under your device you see *Flip Tiles* / *WebView in com.kasperarfman.fliptiles* →
   click **inspect**.
3. A DevTools window opens, showing the app's screen. It's the same DevTools as for a web page:
   - **Console**: errors and the game's log lines;
   - **Elements**: the page, to see why something looks off;
   - **Application → Local storage**: what the game saved (the keys start with
     `CapacitorStorage.` in the browser; in the app they are in Android's own storage, so look at
     the debug screen instead).

### Logcat

Android Studio's **Logcat** window (bottom edge) shows everything the device logs. Errors of the
app itself (not of the game page) appear here, e.g. when the app crashes on start. Type
`package:mine` in its filter box to see only Flip Tiles.

## 6. What to test before a release

Work through this list on a **real phone**, with a fresh install (uninstall the app first:
long-press its icon → *Uninstall*), and then once more as an *update* over the previous version.

**As a new player**
- [ ] The icon and the splash screen look right (not the Capacitor logo).
- [ ] The tutorial starts, tap and tap-and-hold both work.
- [ ] Play a few levels: stars, hints, replays, the Codex.

**Android-specific**
- [ ] The phone's **Back** button (or back gesture) goes back a screen; on the home screen it
      closes the app.
- [ ] Switch to another app and back: the game is where you left it.
- [ ] Fully close the app (swipe it away in the recent apps) and reopen: stars, coins, skin are
      all still there.
- [ ] **Airplane mode**: the game still opens and plays (only the coin pack needs the store).
- [ ] Turn the phone, change the text size (*Settings → Display*), try dark mode: nothing breaks.
- [ ] Try a small phone or the emulator with a small screen, and a large one.

**Coins** (with `TEST_BUILD = true` in `src/dev.ts`, the test build)
- [ ] The shop shows *100 coins · Free (test)*; buying adds 100 coins at once.
- [ ] They are still there after closing and reopening the app.
- [ ] *Reset progress* gives the bought coins back.

**An update keeps progress**
- [ ] Install the previous version, play a bit, then Run the new version over it (don't
      uninstall): everything is still there.

**The debug screen**
- [ ] *Run the checks* says *All good*.
- [ ] The log has no errors (red ERROR lines) you can't explain.

Also run the automated tests on the computer before each test round: `npm run check`.

## 7. Giving it to testers (still pre-release)

Building on your own phone is the first step; the next is letting friends test the app, before
it is public. The Play Store's way to do that is **Internal testing**:

1. Make a Google Play Console account ($25 once) and create the app.
2. Build a signed *app bundle* (`.aab`): Android Studio, *Build → Generate Signed App Bundle /
   APK…* (the steps, and the keystore you must keep safe, are in README.md).
3. Play Console → your app → *Test and release → Testing → Internal testing* → create a release,
   upload the `.aab`, and add your testers' Google accounts (up to 100).
4. Testers get a link, install the app from the Play Store, and get your updates automatically.
   Nothing is public.

This is also where the **real coin purchase** is tested (with `TEST_BUILD = false`): add the
testers under *Settings → License testing*, and their purchases are never charged. See README.md.

(Quicker, without the Play Console: *Build → Build App Bundle(s) / APK(s) → Build APK(s)* makes
an `.apk` file that you can send to a friend to install directly; their phone will ask to allow
installing apps from that source. Fine for a quick look, but purchases can't be tested this way,
and they don't get updates.)

## Quick reference

| I want to... | Do this |
|---|---|
| open the project in Android Studio | `npm run android` |
| see my code changes in the app | `npm run sync`, then **Run ▶** |
| run on the emulator | device menu → the emulator → **Run ▶** |
| run on my phone | USB debugging on, plug in, device menu → the phone → **Run ▶** |
| see errors | `chrome://inspect` → *inspect*; or Logcat; or the debug screen (tap the version 5 times) |
| start over on a device | long-press the app icon → *Uninstall*, then **Run ▶** |
| fix "Unsupported class file major version" | Gradle JDK → Java 21 (section 1) |
| fix a failed Gradle sync | read the *Build* window; *File → Sync Project with Gradle Files* |
