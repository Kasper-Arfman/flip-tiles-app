// The store listing's pictures, made from the game itself:
//   node scripts/make-store-images.mjs
// Google Play (uploaded by hand: Play Console → Store presence → Main store listing):
//   assets/store/android/feature-graphic.png  1024x500, Google Play's banner: the title and a board
//   assets/store/android/phone-N.png          1080x1920 (9:16) screenshots for Play's "Phone"
//                                             slot (0: the tutorial, 1-7: a player some way in),
//                                             taken in a phone-sized browser (Playwright, as the
//                                             smoke tests). Phones' own screenshots are often
//                                             20:9, which Google Play refuses (no side may be
//                                             more than twice the other).
//   assets/store/android/tablet-7in-N.png     1200x1920, the same for the "7-inch tablet" slot
//   assets/store/android/tablet-10in-N.png    1600x2560, and for the "10-inch tablet" slot
// The App Store (uploaded by hand: App Store Connect → the app → the version):
//   assets/store/ios/iphone-N.png             1206x2622, the same shots for the iPhone 6.1"/6.3" slot
//   assets/store/ios/ipad-N.png               2064x2752, and for the iPad 13" slot
// (The coin packs' pictures: scripts/make-pack-images.mjs.)
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createServer } from "vite";

mkdirSync("assets/store/android", { recursive: true });
mkdirSync("assets/store/ios", { recursive: true });

// --- the feature graphic ------------------------------------------------------------------------
const icon = readFileSync("public/icon.svg", "utf8");
const defs = icon.slice(icon.indexOf("<defs>"), icon.indexOf("</defs>") + 7);
// A tile as in the icon: a darker edge below, the face with a light rim, a shine on top
const tile = (x, y, s, yellow) => {
  const [face, edge] = yellow ? ["#e3a21a", "#a86f05"] : ["#2e9e4f", "#1d6e35"];
  const r = s * 0.18;
  return (
    `<rect x="${x}" y="${y + s * 0.08}" width="${s}" height="${s}" rx="${r}" fill="${edge}" />` +
    `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" fill="${face}" stroke="#fff4dc" stroke-width="${s * 0.055}" />` +
    `<rect x="${x + s * 0.07}" y="${y + s * 0.07}" width="${s * 0.86}" height="${s * 0.38}" rx="${r * 0.75}" fill="#fff" opacity="${yellow ? 0.18 : 0.12}" />`
  );
};
// A board halfway: a flip's plus of yellow on the green, and a few more
const BOARD = ["00100", "01110", "00100", "10001", "11011"];
const size = 64, gap = 12, left = 600, top = 68;
const board = BOARD.flatMap((row, r) => [...row].map((c, k) => tile(left + k * (size + gap), top + r * (size + gap), size, c === "1"))).join("");
const feature =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">${defs}` +
  `<rect width="1024" height="500" fill="url(#bg)" />${board}` +
  `<text x="70" y="235" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="800" font-size="92" fill="#fff4dc">Flip Tiles</text>` +
  `<text x="74" y="300" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="600" font-size="34" fill="#ffd24a">Make every tile one color</text>` +
  `</svg>`;
await sharp(Buffer.from(feature)).png().toFile("assets/store/android/feature-graphic.png");
console.log("assets/store/android/feature-graphic.png");

// --- the App Store's creative assets (iOS 27 and later; optional) -------------------------------
// Two pictures for the product page (App Store Connect: the version's Product Page Information),
// in the feature graphic's look. Apple's spec (developer.apple.com/help/app-store-connect/
// reference/app-information/creative-assets-specifications): no transparency; the "safe area"
// in the middle is what every device shows, the rest may be cut off. So the board and the words
// go in the safe area, and a faint wall of tiles, lined up with the board, fills the rest.
//   header          3840x1646 (21:9), safe area 1646x661: the board only (the App Store shows
//                   the app's name with it)
//   search results  3840x2560 (3:2), safe area 2168x1030: the name, the line, the board
const FONT = "Segoe UI, Roboto, Helvetica, Arial, sans-serif";
function creative(width, height, s, boardLeft, boardTop, extra = "") {
  const pitch = s * 1.19; // (a tile and the gap after it, as in the feature graphic: 64 + 12)
  // The wall: the board's grid carried on over the whole picture, faint, some tiles yellow
  const wall = [];
  const c0 = Math.floor(-boardLeft / pitch) - 1, r0 = Math.floor(-boardTop / pitch) - 1;
  for (let r = r0; boardTop + r * pitch < height; r++) {
    for (let c = c0; boardLeft + c * pitch < width; c++) {
      if (r >= 0 && r < 5 && c >= 0 && c < 5) continue; // (the board itself)
      const yellow = ((r * 7 + c * 3) % 5 + 5) % 5 === 0 || ((r * 2 + c * 5) % 7 + 7) % 7 === 0;
      wall.push(tile(boardLeft + c * pitch, boardTop + r * pitch, s, yellow));
    }
  }
  const front = BOARD.flatMap((row, r) => [...row].map((v, c) => tile(boardLeft + c * pitch, boardTop + r * pitch, s, v === "1"))).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs}` +
    `<rect width="${width}" height="${height}" fill="url(#bg)" />` +
    `<g opacity="0.13">${wall.join("")}</g>` +
    // (a soft dark ring around the safe area, so the wall fades away from the board)
    `<radialGradient id="fade" cx="50%" cy="50%" r="60%"><stop offset="0.35" stop-color="#0d3a1c" stop-opacity="0" />` +
    `<stop offset="1" stop-color="#0d3a1c" stop-opacity="0.55" /></radialGradient>` +
    `<rect width="${width}" height="${height}" fill="url(#fade)" />` +
    `${front}${extra}</svg>`
  );
}
const boardSize = (s) => s * 1.19 * 4 + s; // (5 tiles, 4 gaps)
// Header: the board in the middle, as tall as the safe area allows (its 661, less a margin)
{
  const s = 96, side = boardSize(s);
  const svg = creative(3840, 1646, s, (3840 - side) / 2, (1646 - side) / 2 - s * 0.04);
  await sharp(Buffer.from(svg)).removeAlpha().png().toFile("assets/store/ios/header.png");
  console.log("assets/store/ios/header.png");
}
// Search results: the feature graphic's layout, in the safe area (2168x1030, from x 836, y 765)
{
  const s = 150, side = boardSize(s);
  const safe = { x: 836, y: 765, w: 2168, h: 1030 };
  const left = safe.x + safe.w - side - 20, top = safe.y + (safe.h - side) / 2 - s * 0.04;
  const words =
    `<text x="${safe.x + 20}" y="${safe.y + 500}" font-family="${FONT}" font-weight="800" font-size="230" fill="#fff4dc">Flip Tiles</text>` +
    `<text x="${safe.x + 30}" y="${safe.y + 650}" font-family="${FONT}" font-weight="600" font-size="88" fill="#ffd24a">Make every tile one color</text>`;
  const svg = creative(3840, 2560, s, left, top, words);
  await sharp(Buffer.from(svg)).removeAlpha().png().toFile("assets/store/ios/search-results.png");
  console.log("assets/store/ios/search-results.png");
}

// --- the screenshots ----------------------------------------------------------------------------
// A player some way in (a new one would only see the tutorial): the first stages with all stars,
// the next one half done, some coins. Saved as the game saves (Capacitor Preferences: localStorage
// in a browser), from the game's own level list (so Vite's dev server, which serves the sources).
const DONE = 4; // stages with all their stars
const SHOTS = [
  [`#/level/${DONE + 1}/3`, "a level"],
  ["#/", "home"],
  [`#/tier/${DONE + 1}`, "a stage"],
  ["#/ranked", "ranked"],
  ["#/shop", "the shop"],
  ["#/how-to-play", "how to play"],
];
// The same shots for each store's screen sizes, on a touch screen (so the game says "tap", not "click"):
const DEVICES = [
  // Google Play: 360x640 at 3x = 1080x1920
  { file: "assets/store/android/phone", width: 360, height: 640, scale: 3 },
  // Google Play's tablet slots, at common tablet shapes (10:16, 2x): 7-inch (600x960 dp, 1200x1920)
  // and 10-inch (800x1280 dp, 1600x2560). On a tablet the app zooms the page in (MainActivity.java):
  // as far as leaves a page of at least 440x780, so at this shape 488x780 (10:16) for both.
  { file: "assets/store/android/tablet-7in", width: 488, height: 780, scale: 1200 / 488 },
  { file: "assets/store/android/tablet-10in", width: 488, height: 780, scale: 1600 / 488 },
  // App Store Connect: the iPhone 6.1"/6.3" slot (1206x2622, a 402x874 screen at 3x) and the
  // largest iPad (13", 2064x2752); it scales these for the other sizes. The iPad ones are needed because the app runs on iPads too.
  // On an iPad the app zooms the page in (the viewport script in index.html),
  // by the same rule: the 13" iPad (1032x1376 points) gets a 585x780 page (3:4).
  { file: "assets/store/ios/iphone", width: 402, height: 874, scale: 3 },
  { file: "assets/store/ios/ipad", width: 585, height: 780, scale: 2064 / 585 },
];
const server = await createServer({ server: { port: 4179, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ channel: "msedge" });
for (const device of DEVICES) await screenshots(device);
await browser.close();
await server.close();

async function screenshots({ file: name, width, height, scale }) {
  // (a new page: its own storage, so each size starts as a new player)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: true, isMobile: true });
  // shot 0: a new player's first sight, the tutorial's "Tap to flip" (before the player below)
  await page.goto("http://localhost:4179/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${name}-0.png` });
  console.log(`${name}-0.png  the tutorial`);
  // The saved player (see above), and the whole shop bought: every color and shape on show
  await page.evaluate(async (done) => {
    const { TIERS } = await import("/src/levels/levels.ts");
    const { SKINS, SHAPES } = await import("/src/skins.ts");
    const stars = {};
    TIERS.forEach((tier, t) => {
      tier.levels.forEach((level, i) => {
        if (t < done) stars[level.key] = 7; // (all three stars)
        else if (t === done && i < tier.levels.length / 2) stars[level.key] = i % 3 === 0 ? 7 : 3;
      });
    });
    const save = (key, value) => localStorage.setItem(`CapacitorStorage.${key}`, JSON.stringify(value));
    save("progress-v1", stars);
    save("tutorial-done-v1", true);
    save("wallet-v1", { coins: 340, skins: SKINS.map((s) => s.id), shapes: SHAPES.map((s) => s.id) });
  }, DONE);

  // One screen: loaded from a blank page, so the game starts afresh and reads the saved player.
  // (Going to another # in a running game keeps its old state in memory: it could even send a
  // level it thinks is locked back home before a reload.)
  async function shoot(hash, file, what, then) {
    await page.goto("about:blank");
    await page.goto(`http://localhost:4179/${hash}`);
    await page.waitForLoadState("networkidle");
    // (the version line says "(test)" in a test build: not for the store)
    await page.addStyleTag({ content: ".app-version { visibility: hidden !important; }" });
    await page.waitForTimeout(800); // (the screen's entrance animations)
    if (then) {
      await then();
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: file });
    console.log(`${file}  ${what}`);
  }
  for (const [i, [hash, what]] of SHOTS.entries()) await shoot(hash, `${name}-${i + 1}.png`, what);

  // The last one: a hard level with hints, in another look. Kappa (stage 10) opened (as with coins),
  // the Lagoon colors on, 2 hints bought for Kappa 28's flips goal, and that goal tapped so the
  // board shows them.
  await page.evaluate(async () => {
    const { TIERS } = await import("/src/levels/levels.ts");
    const kappa = TIERS.find((t) => t.difficulty === 10);
    const load = (key) => JSON.parse(localStorage.getItem(`CapacitorStorage.${key}`) ?? "{}");
    const save = (key, value) => localStorage.setItem(`CapacitorStorage.${key}`, JSON.stringify(value));
    const wallet = load("wallet-v1");
    wallet.unlocked = [...(wallet.unlocked ?? []), kappa.difficulty];
    wallet.grades = [...(wallet.grades ?? []), ...kappa.grades.map((g) => `${kappa.difficulty}/${g[0].minMoves}`)];
    wallet.skin = "lagoon";
    save("wallet-v1", wallet);
    save("hints-v1", { ...load("hints-v1"), [kappa.levels[27].key]: { flips: 2 } });
  });
  await shoot("#/level/10/28", `${name}-${SHOTS.length + 1}.png`, "Kappa 28, 2 hints, Lagoon", () =>
    page.tap('[data-goal="flips"]'),
  );
  await page.close();
}
