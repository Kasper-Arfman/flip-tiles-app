// The coin packs' pictures for the Play Console (and App Store Connect): one 512x512 PNG per pack,
// the game's coin (src/screens/ui.ts) on the icon's green, more coins for a bigger pack.
//   node scripts/make-pack-images.mjs      -> assets/store/coins_pack_1.png ... coins_pack_4.png
// Uploaded by hand, with each product (docs/developer/deploy/stores.md).
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const icon = readFileSync("public/icon.svg", "utf8");
const defs = icon.slice(icon.indexOf("<defs>"), icon.indexOf("</defs>") + 7);

// The coin of ui.ts (drawn on 24x24), at (x, y) with radius r, and a soft shadow under it
const coin = (x, y, r) =>
  `<ellipse cx="${x}" cy="${y + r * 0.92}" rx="${r * 0.8}" ry="${r * 0.18}" fill="#000" opacity="0.25" />` +
  `<g transform="translate(${x - r} ${y - r}) scale(${(2 * r) / 24})">` +
  `<circle cx="12" cy="12" r="10.5" fill="#e3a21a" stroke="#a86f05" stroke-width="1.5" />` +
  `<circle cx="12" cy="12" r="7.5" fill="none" stroke="#ffd24a" stroke-width="1" />` +
  `<path d="M10.3 7h3.4v3.3H17v3.4h-3.3V17h-3.4v-3.3H7v-3.4h3.3z" fill="#fff4dc" /></g>`;

// The coins of each pack, back to front: [x, y, r]
const PACKS = [
  [[256, 256, 150]],
  [[316, 220, 120], [196, 296, 120]],
  [[256, 176, 105], [168, 316, 105], [344, 316, 105]],
  [[256, 140, 78], [196, 250, 78], [316, 250, 78], [136, 362, 78], [256, 362, 78], [376, 362, 78]],
];

mkdirSync("assets/store", { recursive: true });
await Promise.all(
  PACKS.map((coins, i) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}` +
      `<rect width="512" height="512" fill="url(#bg)" />${coins.map(([x, y, r]) => coin(x, y, r)).join("")}</svg>`;
    return sharp(Buffer.from(svg)).png().toFile(`assets/store/coins_pack_${i + 1}.png`);
  }),
);
console.log("assets/store/: coins_pack_1.png ... coins_pack_4.png");
