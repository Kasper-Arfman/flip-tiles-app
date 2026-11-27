// The texture on the final challenge's tiles (styles/screens/final.css): irregular cobblestones,
// as on a video game's floor, that repeat seamlessly (the stones' edges wrap around the tile's
// sides). Writes two files, one per tile color (an SVG used as an image can't be recolored by
// CSS): src/styles/screens/final-texture-red.svg and final-texture-black.svg.
// Run: node scripts/make-final-texture.mjs (made once; change the seed for other stones).
import { writeFileSync } from "node:fs";

const SIZE = 100; // the tile, in the SVG's units
const STONES = 13;
let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// The stones' middles, spread out a little (no two too close)
const points = [];
while (points.length < STONES) {
  const p = [rand() * SIZE, rand() * SIZE];
  const near = points.some((q) => {
    const dx = Math.min(Math.abs(p[0] - q[0]), SIZE - Math.abs(p[0] - q[0]));
    const dy = Math.min(Math.abs(p[1] - q[1]), SIZE - Math.abs(p[1] - q[1]));
    return Math.hypot(dx, dy) < 18;
  });
  if (!near) points.push(p);
}
// ... and their copies around the tile, so the stones at the sides continue on the other side
const all = points.flatMap(([x, y]) => [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [x + i * SIZE, y + j * SIZE])));

// A stone: the area closer to its middle than to any other (a Voronoi cell), cut out of a big
// square one half-plane at a time
function cell(p) {
  let poly = [[p[0] - 80, p[1] - 80], [p[0] + 80, p[1] - 80], [p[0] + 80, p[1] + 80], [p[0] - 80, p[1] + 80]];
  for (const q of all) {
    if (q === p || (q[0] === p[0] && q[1] === p[1])) continue;
    // keep the side of the bisector nearer p: (x - m) . (q - p) <= 0
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const n = [q[0] - p[0], q[1] - p[1]];
    const side = (v) => (v[0] - m[0]) * n[0] + (v[1] - m[1]) * n[1];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const sa = side(a), sb = side(b);
      if (sa <= 0) out.push(a);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
        const t = sa / (sa - sb);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    poly = out;
  }
  return poly;
}

// Each stone a little smaller than its cell (a groove between stones), its corners rounded by
// the stroke. Every stone and its copies drawn, the tile cuts off what lies outside.
const shrink = (poly, center, by) => poly.map(([x, y]) => [center[0] + (x - center[0]) * by, center[1] + (y - center[1]) * by]);
const paths = all.map((p) => {
  const poly = shrink(cell(p), p, 0.9);
  return `M${poly.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}Z`;
}).join(" ");

const svg = (color, opacity) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <path d="${paths}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.4" stroke-linejoin="round"/>
</svg>
`;
const dir = new URL("../src/styles/screens/", import.meta.url);
writeFileSync(new URL("final-texture-red.svg", dir), svg("#000000", 0.07)); // on the red tiles: darker
writeFileSync(new URL("final-texture-black.svg", dir), svg("#c8212f", 0.07)); // on the black tiles: redder
console.log("Wrote final-texture-red.svg and final-texture-black.svg");
