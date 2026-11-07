// The art behind the home screen: the pattern of a solved board (plus signs tiling the plane,
// with golden lines along their edges, see createFlipTiles.ts), large, in the skin's first color
// with bands of its second, under a fine grain. One SVG, made once, always the same (the randomness is seeded).
//
// The pluses: a plus is 5 cells (a center and its 4 neighbours), and pluses whose centers (x, y)
// have x + 2y a multiple of 5 fit together without gaps.

const W = 14; // the picture, in cells; it is scaled to cover the screen (cropping the sides)
const H = 30;

// The colors come from the skin (--skin-zero, --skin-one, see skins.ts): each plus gets a
// slightly lighter or darker shade of it, mixed by CSS, so the field isn't flat
const shades = (variable: string) => [
  `var(${variable})`,
  `color-mix(in srgb, var(${variable}), black 7%)`,
  `color-mix(in srgb, var(${variable}), white 8%)`,
  `color-mix(in srgb, var(${variable}), black 13%)`,
  `color-mix(in srgb, var(${variable}), white 4%)`,
];
const ZEROS = shades("--skin-zero");
const ONES = shades("--skin-one");

// Small seeded random generator (mulberry32), so the picture is the same every time
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// Where the gold goes: a smooth wavy field; above the threshold is gold. Gives broad diagonal
// bands and patches rather than scattered single pluses.
const goldness = (x: number, y: number) =>
  Math.sin(x * 0.33 + y * 0.13) + Math.sin(y * 0.26 - x * 0.17 + 1.3) + 0.6 * Math.sin((x + y) * 0.45 + 0.4);

// The outline of the plus around center cell (cx, cy): 12 corners
const plusPoints = (cx: number, cy: number) =>
  [
    [cx, cy - 1], [cx + 1, cy - 1], [cx + 1, cy], [cx + 2, cy], [cx + 2, cy + 1], [cx + 1, cy + 1],
    [cx + 1, cy + 2], [cx, cy + 2], [cx, cy + 1], [cx - 1, cy + 1], [cx - 1, cy], [cx, cy],
  ].map((p) => p.join(",")).join(" ");

let cached: string | undefined;

export function homeArt(): string {
  if (cached) return cached;
  const rand = random(7);
  const pluses: string[] = [];
  for (let cy = -2; cy <= H + 1; cy++) {
    for (let cx = -2; cx <= W + 1; cx++) {
      if ((((cx + 2 * cy) % 5) + 5) % 5 !== 0) continue;
      const gold = goldness(cx, cy) + (rand() - 0.5) * 0.5 > 0.75;
      const options = gold ? ONES : ZEROS;
      const fill = options[Math.floor(rand() * options.length)];
      // (as a style: a fill="" attribute can't use CSS variables)
      pluses.push(`<polygon points="${plusPoints(cx, cy)}" style="fill: ${fill}" />`);
    }
  }
  cached = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <!-- grain: fine grey noise, laid over the colors -->
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="2" seed="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <!-- light from the top left, shade towards the bottom right -->
        <linearGradient id="light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
          <stop offset="0.5" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="1" stop-color="#0b1a10" stop-opacity="0.35" />
        </linearGradient>
      </defs>
      <g class="art-pluses" stroke="#fff3c4" stroke-opacity="0.3" stroke-width="0.05" stroke-linejoin="round">
        ${pluses.join("")}
      </g>
      <rect width="${W}" height="${H}" fill="url(#light)" />
      <rect class="art-grain" width="${W}" height="${H}" filter="url(#grain)" />
    </svg>`;
  return cached;
}
