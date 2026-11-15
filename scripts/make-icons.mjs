// The app icons and splash screens of the native apps, from the game's icon (public/icon.svg):
//   node scripts/make-icons.mjs        (or: npm run icons)
// writes the source pictures to assets/, then has @capacitor/assets make every size Android and
// iOS need (android/app/src/main/res, ios/App/App/Assets.xcassets). Run it again after changing
// public/icon.svg.
//
// The pictures:
//   icon-only.png        1024x1024, the whole icon (iOS, and older Android)
//   icon-foreground.png  the 3x3 tiles on transparent, for Android's adaptive icon (the phone
//                        cuts it to a circle, a squircle...: the tiles stay inside the safe middle)
//   icon-background.png  the green background of the adaptive icon
//   splash.png           2732x2732, the tiles small in the middle of the green: shown while the
//                        app starts
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icon.svg", "utf8");
const tiles = svg.slice(svg.indexOf('<rect x="112"'), svg.lastIndexOf("</svg>"));
const defs = svg.slice(svg.indexOf("<defs>"), svg.indexOf("</defs>") + 7);
const page = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${defs}${body}</svg>`;
const background = `<rect width="512" height="512" fill="url(#bg)" />`;
// The tiles (112..400 of 512) scaled around the middle (256, 259)
const scaled = (s) => `<g transform="translate(256 259) scale(${s}) translate(-256 -259)">${tiles}</g>`;

mkdirSync("assets", { recursive: true });
const png = (name, size, body) => sharp(Buffer.from(page(size, body))).png().toFile(`assets/${name}`);
await Promise.all([
  png("icon-only.png", 1024, background + tiles),
  // (@capacitor/assets shows this in the middle two thirds of the icon; at 1.1 the corners of the
  // tiles stay inside a round icon)
  png("icon-foreground.png", 1024, scaled(1.1)),
  png("icon-background.png", 1024, background),
  png("splash.png", 2732, background + scaled(0.45)),
  png("splash-dark.png", 2732, background + scaled(0.45)),
]);
console.log("assets/: icon and splash pictures written");

execSync("npx capacitor-assets generate --android --ios", { stdio: "inherit" });
