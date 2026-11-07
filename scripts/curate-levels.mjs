// Curates the levels: picks, from all 2^25 boards, the ones that make good puzzles, sorts them into
// difficulty tiers, and writes src/levels/levels.json.
//
//   npm run curate                  4 levels per grade (the default: one row of 4 in the app)
//   npm run curate -- 8             8 levels per grade
//
// A tier is graded by minFlips (see below): fewer flips in the flips-only solution is easier.
//
// Each level has three stars:
//   1. solved, in any number of moves
//   2. solved with flips only, in the fewest flips possible       ("minFlips")
//   3. solved in the fewest moves possible, flips and forces       ("minMoves")
//
// A board becomes a level when:
//   a. minMoves < min(yellow, green): forcing every tile of one color takes min(yellow, green)
//      moves, so that never earns the third star
//   b. it can be solved with flips alone: otherwise the second star can't be earned
//   c. minMoves < minFlips: the best solution needs a force, so the second and third stars
//      have different solutions
//   d. minMoves >= 3 (MIN_DIFFICULTY): anything shorter is too easy
// Its difficulty (the tier) is minMoves.
//
// Boards that are rotations or mirror images of each other, or have the colors swapped, are the
// same puzzle: only one of each such group (up to 16 boards) is kept. It is shown turned or
// mirrored at random, with its colors swapped half the time.
//
// Each level also gets the two solutions that its hints show (tiles are numbered 5r + c):
//   solutionFlips   the flips of a flips-only solution with minFlips flips
//   solutionMoves   { flips, forces } of a solution with minMoves moves
//
// Where the numbers come from: the two solution tables in public/flip-tiles/ (see CLAUDE.md).
// Following fewest_moves from a board gives a solution with the fewest moves. Following
// fewest_forces gives one with the fewest forces, and among those the fewest moves; when that
// solution has no forces at all, the board is solvable by flips and its length is minFlips.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PER_GRADE = Number(process.argv[2] ?? 4);
const SEED = 1; // change it to pick other levels from the same tiers
const MIN_DIFFICULTY = 3;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "levels", "levels.json");

// --- the board, as in src/game/flipTiles.ts -------------------------------------------------
// Tile (r, c) is bit 5r + c; 1 = yellow, 0 = green.
const R = 5, C = 5, N = R * C;
const ALL = 2 ** N - 1;
const HALF = 2 ** (N - 1);
const DONE = N;
const FORCE_BIT = 1 << 5;
const TILE_BITS = FORCE_BIT - 1;

const MASKS = Array.from({ length: N }, (_, k) => {
  const [r, c] = [Math.floor(k / C), k % C];
  let mask = 0;
  for (const [i, j] of [[r - 1, c], [r, c - 1], [r, c], [r, c + 1], [r + 1, c]]) {
    if (i >= 0 && i < R && j >= 0 && j < C) mask |= 1 << (i * C + j);
  }
  return mask;
});

// A board and its color inverse share their stored move, and are the same puzzle: use the one
// in the first half as the representative
const half = (s) => (s < HALF ? s : ALL ^ s);

// --- reading the tables -------------------------------------------------------------------
function readTable(name) {
  let bytes = readFileSync(join(ROOT, "public", "flip-tiles", name));
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  if (bytes.length !== HALF) throw new Error(`${name} has ${bytes.length} entries, not ${HALF}`);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

// For every board (of the first half): the length of the solution the table leads to, and how
// many of its moves are forces. Each board is followed only until it reaches a board whose
// length is already known, so every board is visited once.
function solutionLengths(table) {
  const UNKNOWN = 255;
  const moves = new Uint8Array(HALF).fill(UNKNOWN);
  const forces = new Uint8Array(HALF);
  const path = new Int32Array(N + 1);
  for (let s = 0; s < HALF; s++) {
    let t = s;
    let n = 0;
    while (moves[t] === UNKNOWN) {
      const v = table[t];
      if (v === DONE) { moves[t] = 0; break; }
      if (v > (FORCE_BIT | TILE_BITS) || n > N) throw new Error(`The table is corrupt at board ${t}`);
      path[n++] = t;
      t = half(v & FORCE_BIT ? t ^ (1 << (v & TILE_BITS)) : t ^ MASKS[v & TILE_BITS]);
    }
    // Walk back: each board is one move further from solved than the next one on its path
    for (let i = n - 1; i >= 0; i--) {
      const u = path[i];
      moves[u] = moves[t] + 1;
      forces[u] = forces[t] + (table[u] & FORCE_BIT ? 1 : 0);
      t = u;
    }
  }
  return { moves, forces };
}

// The solution a table leads to from board s: its flips and its forces (tile numbers). Checked:
// the moves must solve the board.
function solutionOf(table, s) {
  const flips = [];
  const forces = [];
  let t = s;
  for (let v = table[half(t)]; v !== DONE; v = table[half(t)]) {
    const tile = v & TILE_BITS;
    if (v & FORCE_BIT) { forces.push(tile); t ^= 1 << tile; } else { flips.push(tile); t ^= MASKS[tile]; }
    if (flips.length + forces.length > N) throw new Error(`The table is corrupt at board ${s}`);
  }
  if (t !== 0 && t !== ALL) throw new Error(`The solution of board ${s} doesn't solve it`);
  return { flips, forces };
}

// --- symmetry: rotations and mirror images ------------------------------------------------
const SYMMETRIES = [
  (r, c) => [r, c], (r, c) => [c, 4 - r], (r, c) => [4 - r, 4 - c], (r, c) => [4 - c, r],
  (r, c) => [r, 4 - c], (r, c) => [4 - r, c], (r, c) => [c, r], (r, c) => [4 - c, 4 - r],
].map((f) => Array.from({ length: N }, (_, k) => {
  const [r, c] = f(Math.floor(k / C), k % C);
  return r * C + c;
}));

const transform = (s, perm) => {
  let t = 0;
  for (let k = 0; k < N; k++) if ((s >>> k) & 1) t |= 1 << perm[k];
  return t;
};

// The group's representative: the smallest number among its rotations, mirror images and their
// color inverses (always in the first half)
const isRepresentative = (s) => SYMMETRIES.every((perm) => half(transform(s, perm)) >= s);

const popcount = (s) => {
  let n = 0;
  for (; s; s &= s - 1) n++;
  return n;
};

// Row by row from the top left, a space between rows: the `start` format of createFlipTiles
const toBoardString = (s) =>
  Array.from({ length: R }, (_, r) =>
    Array.from({ length: C }, (_, c) => (s >>> (r * C + c)) & 1).join("")).join(" ");

// A small seeded random generator (mulberry32), so a run with the same seed picks the same levels
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// --- the curation ---------------------------------------------------------------------------
const started = Date.now();
console.log("Reading the tables and following every board's solutions...");
const fewestMovesTable = readTable("fewest_moves.bin.gz");
const fewestForcesTable = readTable("fewest_forces.bin.gz");
const best = solutionLengths(fewestMovesTable);
const flipFirst = solutionLengths(fewestForcesTable);

// How many boards are left after each criterion (a board and its inverse count as two)
const funnel = { all: 2 * HALF, a: 0, b: 0, c: 0, d: 0 };
const tiers = new Map(); // difficulty -> [{ state, minMoves, minFlips }]

for (let s = 0; s < HALF; s++) {
  const minMoves = best.moves[s];
  const yellow = popcount(s);
  if (!(minMoves < Math.min(yellow, N - yellow))) continue;
  funnel.a += 2;
  if (flipFirst.forces[s] !== 0) continue;
  funnel.b += 2;
  const minFlips = flipFirst.moves[s];
  if (!(minMoves < minFlips)) continue;
  funnel.c += 2;
  if (minMoves < MIN_DIFFICULTY) continue;
  funnel.d += 2;
  if (!isRepresentative(s)) continue;
  if (!tiers.has(minMoves)) tiers.set(minMoves, []);
  tiers.get(minMoves).push({ state: s, minMoves, minFlips });
}

// Pick the levels of a tier: within the tier, the boards are grouped by minFlips (the grades),
// and PER_GRADE are picked from each grade at random (a grade with fewer boards gives all it
// has). Most boards have a middling minFlips, so this way the easiest and hardest grades get as
// many levels as the others. The levels are then ordered by minFlips.
// Each tier has its own random generator (seeded with SEED and its difficulty), so adding or
// removing a tier doesn't change the levels picked for the others.
function pickGraded(all, rand) {
  const groups = new Map(); // minFlips -> boards
  for (const board of all) {
    if (!groups.has(board.minFlips)) groups.set(board.minFlips, []);
    groups.get(board.minFlips).push(board);
  }
  return [...groups.keys()].sort((x, y) => x - y).flatMap((minFlips) => {
    const group = groups.get(minFlips);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    return group.slice(0, PER_GRADE).sort((x, y) => x.state - y.state);
  });
}

const output = {
  _comment: "Made by scripts/curate-levels.mjs (npm run curate). Don't edit by hand: run the script.",
  perGrade: PER_GRADE,
  seed: SEED,
  tiers: [...tiers.keys()].sort((x, y) => x - y).map((difficulty) => {
    const all = tiers.get(difficulty);
    const picked = pickGraded(all, random(SEED * 1000 + difficulty));
    const grades = {}; // minFlips -> [available, picked]
    for (const board of all) (grades[board.minFlips] ??= [0, 0])[0]++;
    for (const board of picked) grades[board.minFlips][1]++;
    // How each level is shown: the boards kept are each group's lowest number, which leans to
    // the first color (and always has it in the bottom right corner). So every level is turned
    // or mirrored at random, and in each grade half the levels end on one color and half on the
    // other (the color the fewest-moves solution ends on), in random order, by swapping the
    // colors where needed: the player can't guess the color to aim for. This changes nothing
    // about solving it: the same moves, turned along.
    const orient = random(SEED * 7919 + difficulty);
    const endsOnOne = []; // per picked level: should its fewest-moves solution end on color 1?
    for (const minFlips of new Set(picked.map((b) => b.minFlips))) {
      const at = picked.flatMap((b, i) => (b.minFlips === minFlips ? [i] : []));
      const wants = at.map((_, j) => (j < at.length / 2 ? true : false));
      if (at.length % 2 && orient() < 0.5) wants[Math.floor(at.length / 2)] = true; // odd: either way
      for (let j = wants.length - 1; j > 0; j--) {
        const r = Math.floor(orient() * (j + 1));
        [wants[j], wants[r]] = [wants[r], wants[j]];
      }
      at.forEach((i, j) => (endsOnOne[i] = wants[j]));
    }
    return {
      difficulty,
      available: all.length,
      grades,
      levels: picked.map(({ state, minMoves, minFlips }, i) => {
        // The two solutions the hints show: flips only (second star), and fewest moves (third)
        const flipsOnly = solutionOf(fewestForcesTable, state);
        const fewest = solutionOf(fewestMovesTable, state);
        if (flipsOnly.forces.length || flipsOnly.flips.length !== minFlips ||
            fewest.flips.length + fewest.forces.length !== minMoves) {
          throw new Error(`The solutions of board ${state} don't match its minFlips and minMoves`);
        }
        // Turn or mirror it (one of the 8 symmetries); the solutions' tiles turn along
        const perm = SYMMETRIES[Math.floor(orient() * SYMMETRIES.length)];
        const turn = (tiles) => tiles.map((k) => perm[k]);
        const solutionFlips = turn(flipsOnly.flips);
        const solutionMoves = { flips: turn(fewest.flips), forces: turn(fewest.forces) };
        const end = (board, flips, forces) => {
          let t = board;
          for (const k of flips) t ^= MASKS[k];
          for (const k of forces) t ^= 1 << k;
          return t;
        };
        // Swap its colors when the fewest-moves solution would end on the other color than
        // wanted (the same moves then end on the other color)
        const turned = transform(state, perm);
        const swap = (end(turned, solutionMoves.flips, solutionMoves.forces) === ALL) !== endsOnOne[i];
        const shown = turned ^ (swap ? ALL : 0);
        // Checked: the solutions still solve the board shown
        const solved = (t) => t === 0 || t === ALL;
        if (!solved(end(shown, solutionFlips, [])) || !solved(end(shown, solutionMoves.flips, solutionMoves.forces))) {
          throw new Error(`The turned solutions of board ${state} don't solve it`);
        }
        return {
          id: `${difficulty}-${String(i + 1).padStart(2, "0")}`,
          board: toBoardString(shown),
          minMoves,
          minFlips,
          solutionFlips,
          solutionMoves,
        };
      }),
    };
  }),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");

const fmt = (n) => n.toLocaleString("en-US").padStart(12);
console.log(`
Boards left after each criterion:
  all boards                                   ${fmt(funnel.all)}
  a. minMoves < min(yellow, green)             ${fmt(funnel.a)}
  b. + solvable with flips only                ${fmt(funnel.b)}
  c. + minMoves < minFlips                     ${fmt(funnel.c)}
  d. + minMoves >= ${MIN_DIFFICULTY}                            ${fmt(funnel.d)}

Unique levels (rotations, mirror images and swapped colors counted once), per difficulty:`);
for (const tier of output.tiers) {
  console.log(`  ${String(tier.difficulty).padStart(2)} moves: ${fmt(tier.available)} available, ` +
    `${tier.levels.length} picked`);
  for (const [minFlips, [available, picked]] of Object.entries(tier.grades)) {
    console.log(`      ${minFlips.padStart(2)} flips: ${fmt(available)} available, ${String(picked).padStart(2)} picked`);
  }
}
console.log(`\nWrote ${tiers.size} tiers to ${OUT} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
