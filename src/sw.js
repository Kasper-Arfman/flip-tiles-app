// The service worker: lets the game, installed to a phone's home screen from the website, play
// without a connection. A build (vite.config.ts) writes the version and the list of the app's
// files in, and puts it at dist/sw.js; main.ts registers it (on the web only: the native apps
// have their files on the device already).
//   - install: save every file of this version on the device
//   - activate: delete the files of older versions
//   - fetch: answer from the saved files; a page address (the app opened) gets the saved
//     index.html; anything not saved goes to the network as usual
const VERSION = "__VERSION__";
const FILES = __FILES__;
const CACHE = `flip-tiles-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("flip-tiles-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // (the app's addresses differ only after the #, which never reaches here; ?query ignored)
      const saved = await cache.match(request, { ignoreSearch: true });
      if (saved) return saved;
      if (request.mode === "navigate") {
        const page = await cache.match("./index.html");
        if (page) return page;
      }
      return fetch(request);
    }),
  );
});
