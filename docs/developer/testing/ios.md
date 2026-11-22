# Testing: on iOS

Back to [the developer guide](../../index.md).

## iOS

`npm run ios` does the same with Xcode, on a Mac. On a Mac, Safari's *Develop* menu does what
`chrome://inspect` does for Android.

## On an iPhone without a Mac: as a web app

A native iPhone app needs a Mac and the Apple Developer Program ($99/year). But the game is a
web app at heart, so it can also be played from a website, and *installed* from Safari:

1. `npm run build`, and put the contents of `dist/` online, in any folder of any website (the
   build uses relative paths, see `vite.config.ts`). The easiest way: **Netlify Drop**. Go to
   <https://app.netlify.com/drop>, make a free account, and drag the `dist` folder onto the page.
   You get an address like `something.netlify.app` (rename it under *Site configuration*). For an
   update, build again and drag the new `dist` onto the site's *Deploys* page.
2. On the iPhone, open that address in **Safari**, tap **Share → Add to Home Screen**.
3. Open the game from its new icon: full screen, without Safari's bars, like an app.

Good to know:

- What makes this work: `public/manifest.webmanifest` (name, colors, full screen), the icons in
  `public/` (`icon.svg` is the source; the PNGs are made from it), and the `apple-…` tags in
  `index.html`.
- Progress is saved on the phone, in the home-screen app. Safari in a normal tab has separate
  storage, so always play from the icon. Removing the icon removes the progress.
- An update is just putting a new build online; the app picks it up the next time it is opened
  (fully closed and reopened).
- Android phones can do the same from Chrome (*Add to Home screen*).
- After the first visit it plays offline (`src/sw.js`); progress is stored on the phone.
- It needs a recent iPhone system (iOS 16.4 or newer) for all the colors to show right.
