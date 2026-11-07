// Builds a <flip-tiles> widget: the markup that the Astro component on the website renders
// (astro-website/src/components/FlipTiles.astro), made at runtime. Its behaviour lives in
// FlipTilesElement.ts, and starts as soon as the element is added to the page.
//
// Options (the same as the website's props):
//   solver     false = just the puzzle: no solution switch, status or solve button, and no
//              download (default true)
//   start      the board to start with, 1 = yellow, 0 = green; without it, a random board that
//              can be solved with flips alone. Either a string of 25 zeros and ones, row by row
//              from the top left (spaces are ignored), or a binary number read the same way:
//              0b01000_11100_01000_00000_00000
//   maxMoves   the most moves in one game (default 10)
//   newGame    false = no Scramble or Clear, only Reset (default true)
//   allowForce false = flips only (default true)
//   title      a short title above the board
import "./FlipTilesElement";
import { N } from "./flipTiles";

export interface FlipTilesOptions {
  solver?: boolean;
  start?: string | number;
  maxMoves?: number;
  newGame?: boolean;
  allowForce?: boolean;
  title?: string;
}

// The start board as a number: tile k (row by row from the top left) is bit k
const toState = (start: string | number): number => {
  if (typeof start === "number") {
    if (!Number.isInteger(start) || start < 0 || start >= 2 ** N) {
      throw new Error(`FlipTiles: start=${start} is not a board: use a whole number from 0 to 2^${N} - 1`);
    }
    // Read the 25 binary digits from the first (top left tile) to the last, like the string
    start = start.toString(2).padStart(N, "0");
  }
  const bits = start.replace(/\s/g, "");
  if (!new RegExp(`^[01]{${N}}$`).test(bits)) {
    throw new Error(`FlipTiles: start="${start}" is not a board: use ${N} zeros and ones (spaces are ignored)`);
  }
  return [...bits].reduce((state, bit, k) => state | (Number(bit) << k), 0);
};

// The light wave over a solved board sweeps each row from left to right, one column every
// WAVE_STEP; the next row starts when the one above is two thirds of the way (4 steps) across.
const WAVE_STEP = 70; // ms
const ROW_STEP = (2 / 3) * 4 * WAVE_STEP;
const waveDelay = (k: number) => Math.round((k % 5) * WAVE_STEP + Math.floor(k / 5) * ROW_STEP);
const WAVE_LENGTH = waveDelay(N - 1); // when the last tile (bottom right) starts

// The pattern that emerges in a solved board: plus signs, the shape of a flip, tiling the plane.
// Pluses fit together without gaps when their centers are the cells (x, y) with x + 2y a
// multiple of 5. The board is 10 x 10 cells (a cell is half a tile). The borders between the
// pluses are drawn as wires: long lines that start at the board's edge, as high up as possible,
// and run on, preferably down or to the right, towards the other side.
const CELLS = 10;
type Point = [number, number];
const WIRES: Point[][] = (() => {
  const mod = (a: number, m: number) => ((a % m) + m) % m;
  const plusOf = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (mod(x - dx + 2 * (y - dy), 5) === 0) return `${x - dx},${y - dy}`;
    }
    throw new Error("every cell belongs to a plus");
  };
  const edgeKey = (a: Point, b: Point) => [a.join(","), b.join(",")].sort().join("|");
  // The unit edges between cells of different pluses, inside the board (not on its rim)
  const edges = new Set<string>();
  for (let x = 0; x < CELLS; x++) {
    for (let y = 0; y < CELLS; y++) {
      if (x + 1 < CELLS && plusOf(x, y) !== plusOf(x + 1, y)) edges.add(edgeKey([x + 1, y], [x + 1, y + 1]));
      if (y + 1 < CELLS && plusOf(x, y) !== plusOf(x, y + 1)) edges.add(edgeKey([x, y + 1], [x + 1, y + 1]));
    }
  }
  const used = new Set<string>();
  const freeSteps = (p: Point): Point[] => ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Point[])
    .map(([dx, dy]): Point => [p[0] + dx, p[1] + dy])
    .filter((q) => edges.has(edgeKey(p, q)) && !used.has(edgeKey(p, q)));
  const onRim = (p: Point) => p[0] === 0 || p[1] === 0 || p[0] === CELLS || p[1] === CELLS;
  const corners: Point[] = [];
  for (let x = 0; x <= CELLS; x++) for (let y = 0; y <= CELLS; y++) corners.push([x, y]);
  const wires: Point[][] = [];
  while (used.size < edges.size) {
    // Start on the rim if possible, as high up (then as far left) as possible
    const start = corners.filter((c) => freeSteps(c).length)
      .sort((a, b) => Number(onRim(b)) - Number(onRim(a)) || a[1] - b[1] || a[0] - b[0])[0];
    const wire: Point[] = [start];
    let at = start;
    let dir: Point | null = null;
    for (let steps = freeSteps(at); steps.length; steps = freeSteps(at)) {
      // Down or to the right first, then straight on rather than turning
      const score = (q: Point) => 2 * (q[0] - at[0] + q[1] - at[1]) +
        (dir && q[0] - at[0] === dir[0] && q[1] - at[1] === dir[1] ? 1 : 0);
      const next = steps.sort((a, b) => score(b) - score(a))[0];
      used.add(edgeKey(at, next));
      dir = [next[0] - at[0], next[1] - at[1]];
      wire.push(next);
      at = next;
    }
    wires.push(wire);
  }
  return wires;
})();
// Signals travel at the same speed in every wire, one cell edge every WIRE_STEP
const WIRE_STEP = 110; // ms

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function createFlipTiles(options: FlipTilesOptions = {}): HTMLElement {
  const { solver = true, start, maxMoves = 10, newGame = true, allowForce = true, title } = options;
  if (!Number.isInteger(maxMoves) || maxMoves < 1) {
    throw new Error(`FlipTiles: maxMoves=${maxMoves} must be a whole number of at least 1`);
  }
  const startState = start === undefined ? undefined : toState(start);

  const tiles = Array.from({ length: N }, (_, k) => {
    const one = startState !== undefined && ((startState >>> k) & 1) === 1;
    return `<button type="button" class="tile${one ? " one" : ""}" style="--wave-delay: ${waveDelay(k)}ms"
      data-tile="${k}" aria-label="Tile ${Math.floor(k / 5) + 1}, ${(k % 5) + 1}">
      <span class="force-mark"></span><span class="flip-mark"></span>
      <span class="made-flip"></span><span class="made-force"></span></button>`;
  }).join("");

  const wires = WIRES.map((wire) => {
    const points = wire.map((p) => p.join(",")).join(" ");
    const style = `--wire-start: ${wire[0][1] / CELLS}; --wire-time: ${(wire.length - 1) * WIRE_STEP}ms`;
    return `<polyline class="wire" points="${points}" pathLength="1" style="${style}" />` +
      `<polyline class="pulse" points="${points}" pathLength="1" style="${style}" />`;
  }).join("");

  const solverHtml = solver ? `
    <div class="solver">
      <div class="ranking" role="group" aria-label="Solution">
        <button type="button" data-ranking="hide" aria-pressed="true">Hide</button>
        <button type="button" data-ranking="fewestMoves" aria-pressed="false">MinSteps</button>
        <button type="button" data-ranking="fewestForces" aria-pressed="false">MinForces</button>
      </div>
    </div>
    <p class="status" aria-live="polite"></p>` : "";

  const hint = allowForce
    ? `<span class="with-mouse">Click to flip. Right-click to force.</span>
       <span class="with-touch">Tap to flip, tap and hold to force.</span>`
    : `<span class="with-mouse">Click to flip. No forcing.</span>
       <span class="with-touch">Tap to flip. No forcing.</span>`;

  const controls = newGame || solver ? `
    <div class="controls">
      ${newGame ? `<button type="button" class="scramble">Scramble</button>
        <button type="button" class="clear">Clear</button>
        <button type="button" class="reset">Reset</button>` : ""}
      ${solver ? `<button type="button" class="next">Solve Step</button>` : ""}
    </div>` : "";

  const element = document.createElement("flip-tiles");
  element.className = "flip-tiles";
  element.style.setProperty("--wave-length", `${WAVE_LENGTH}ms`);
  if (startState !== undefined) element.dataset.start = String(startState);
  element.dataset.maxMoves = String(maxMoves);
  element.dataset.allowForce = String(allowForce);
  element.innerHTML = `
    ${title ? `<p class="title">${escape(title)}</p>` : ""}
    ${solverHtml}
    <div class="board" role="grid" aria-label="The board">
      ${tiles}
      <svg class="runes" viewBox="0 0 ${CELLS} ${CELLS}" preserveAspectRatio="none" aria-hidden="true">${wires}</svg>
      <div class="solved" aria-live="polite"><strong></strong></div>
    </div>
    <p class="hint">${hint}</p>
    <div class="moves">
      <button type="button" class="back" aria-label="Back one move" title="Back one move">&lt;</button>
      <span class="move-number" aria-live="polite" style="min-width: ${`Move ${maxMoves} / ${maxMoves}`.length}ch">Move 0 / ${maxMoves}</span>
      <button type="button" class="forward" aria-label="Forward one move" title="Forward one move">&gt;</button>
      ${newGame ? "" : `<button type="button" class="reset">Reset</button>`}
    </div>
    ${controls}`;
  return element;
}
