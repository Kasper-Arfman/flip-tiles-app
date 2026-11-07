// Small pieces of markup that the screens share. They return HTML text: a screen puts them
// together into its innerHTML.

const STAR_PATH = "M12 2.6l2.85 6.05 6.6.8-4.86 4.57 1.24 6.55L12 17.33l-5.83 3.24 1.24-6.55L2.55 9.45l6.6-.8z";

// A coin: gold, with a rim, and the plus of a flip on it
export const coin = () =>
  `<svg class="coin" viewBox="0 0 24 24" aria-hidden="true">` +
  `<circle cx="12" cy="12" r="10.5" fill="#e3a21a" stroke="#a86f05" stroke-width="1.5" />` +
  `<circle cx="12" cy="12" r="7.5" fill="none" stroke="#ffd24a" stroke-width="1" />` +
  `<path d="M10.3 7h3.4v3.3H17v3.4h-3.3V17h-3.4v-3.3H7v-3.4h3.3z" fill="#fff4dc" /></svg>`;

// The big stars of a solved level (level.ts): a socket, and the gold star that drops into it. The
// gold star is drawn in detail: a gold gradient, each point bevelled (a light and a dark half, as
// if cut), a dark outline and a shine. Both have the same outline, so the star covers its socket.
const BIG = (() => {
  const c = { x: 50, y: 53 }; // the middle (a little low: the top point is the tallest)
  const point = (i: number, r: number) => {
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    return [c.x + r * Math.cos(a), c.y + r * Math.sin(a)].map((v) => v.toFixed(2));
  };
  const corners = Array.from({ length: 10 }, (_, i) => point(i, i % 2 ? 19 : 45)); // outer, inner, ...
  const outline = `M${corners.map((p) => p.join(",")).join("L")}Z`;
  // Each point: its left half lit, its right half in shade
  const facets = [0, 2, 4, 6, 8].map((i) => {
    const tip = corners[i].join(",");
    const before = corners[(i + 9) % 10].join(",");
    const after = corners[(i + 1) % 10].join(",");
    return `<path d="M${c.x},${c.y}L${before}L${tip}Z" fill="#fff6c8" opacity="0.35" />` +
      `<path d="M${c.x},${c.y}L${tip}L${after}Z" fill="#7a4a00" opacity="0.18" />`;
  }).join("");
  return { outline, facets };
})();

export const bigStarSocket = () =>
  `<svg class="socket" viewBox="0 0 100 100" aria-hidden="true"><path d="${BIG.outline}" stroke-width="3" /></svg>`;

export const bigStarGold = () =>
  `<svg class="gold" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="star-gold" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#ffe680" /><stop offset="0.5" stop-color="#f6bc22" /><stop offset="1" stop-color="#d98a06" />
    </linearGradient></defs>
    <path d="${BIG.outline}" fill="url(#star-gold)" />
    ${BIG.facets}
    <path d="${BIG.outline}" fill="none" stroke="#a96a00" stroke-width="3" stroke-linejoin="round" />
    <ellipse cx="47.6" cy="27" rx="2.2" ry="7" transform="rotate(14 47.6 27)" fill="#ffffff" opacity="0.6" />
  </svg>`;

// A reward star: gold when earned, an outline when not
export const star = (earned: boolean, extra = "") =>
  `<svg class="star${earned ? " earned" : ""}${extra ? ` ${extra}` : ""}" viewBox="0 0 24 24" aria-hidden="true">` +
  `<path d="${STAR_PATH}" /></svg>`;

// The three stars of a level, from its bits (see progress.ts)
export const starRow = (bits: number, extra = "") =>
  `<span class="star-row">${[1, 2, 4].map((s) => star((bits & s) !== 0, extra)).join("")}</span>`;

// A stage's title: its Greek letter, a small dot, then its name ("α · Alpha")
export const stageTitle = (tier: { symbol: string; name: string }) =>
  `<span class="stage-symbol" aria-hidden="true">${tier.symbol}</span>` +
  `<span class="stage-dot" aria-hidden="true">·</span>${tier.name}`;

// Difficulty: a row of small navy marks, one per move of the best solution
export const difficultyMarks = (n: number) =>
  `<span class="difficulty" aria-label="Difficulty ${n}">` +
  Array.from({ length: n }, () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" /></svg>`).join("") +
  `</span>`;

// A small picture of a board, for the level grid
export function miniBoard(board: string) {
  const bits = board.replace(/\s/g, "");
  const cells = [...bits].map((bit, k) =>
    `<rect x="${(k % 5) * 1.1}" y="${Math.floor(k / 5) * 1.1}" width="1" height="1" rx="0.15" class="${bit === "1" ? "one" : "zero"}" />`,
  ).join("");
  return `<svg class="mini-board" viewBox="0 0 5.4 5.4" aria-hidden="true">${cells}</svg>`;
}

const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>`;
export const LOCK = `<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>`;

// The bar at the top of a screen: a back arrow that goes up to `up` (none on the home screen),
// the title, and something on the right
export const topbar = (title: string, up?: string, right = "") => `
  <header class="topbar">
    ${up ? `<button type="button" class="up" data-up="${up}" aria-label="Back">${CHEVRON}</button>` : `<span></span>`}
    <h1>${title}</h1>
    <div class="topbar-right">${right}</div>
  </header>`;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function screen(className: string, html: string) {
  const element = document.createElement("section");
  element.className = `screen ${className}`;
  element.innerHTML = html;
  return element;
}
