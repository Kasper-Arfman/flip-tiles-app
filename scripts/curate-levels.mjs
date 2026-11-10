// Curates the levels: picks, from all 2^25 boards, the ones that make good puzzles, sorts them into
// difficulty tiers, and writes src/levels/levels.json.
//
//   npm run curate                  keeps the levels already released (see RELEASED below) and
//                                   picks new ones only where there is room
//   npm run curate -- --fresh       picks every level anew (players lose what they earned on
//                                   levels that are left out: only before a first release)
//
// How many levels per grade (the levels between two divider lines in the app), from Gamma on:
//   1 grade: 16;  2 grades: 8 + 8;  3 grades: 8 + 8 + 8;  4 or more: 4 per grade
// so a stage has 16 to 32 levels. A grade with fewer boards than its share is left out (it would
// be a short row on its own), and the shares are worked out again for the grades left.
//
// A tier is the length of the flips-only solution (minFlips: the second star, the hardest one),
// and within a tier the levels are graded by minMoves: fewer moves is easier.
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
//   c. minMoves <= minFlips: always so (flips are moves too). When minMoves < minFlips the best
//      solution needs a force, and the second and third stars have different solutions; when
//      equal, the flips-only solution is also the fewest moves, and earns both stars
//   d. minFlips >= 3 (MIN_DIFFICULTY): anything shorter is too easy
//   e. after Delta (minFlips > STRICT_AFTER): minMoves < minFlips, so the third star always needs
//      a force and a different solution than the second (a 5-flip board solvable in 4 moves).
//      (Not for 4 flips: no 4-flip board can be solved in 3 moves, so that tier would be empty.)
// Its difficulty (the tier) is minFlips; its grade within the tier is minMoves.
//
// Boards that are rotations or mirror images of each other, or have the colors swapped, are the
// same puzzle: only one of each such group (up to 16 boards) is kept. It is shown turned or
// mirrored at random, with its colors swapped half the time.
//
// Each level also gets the two solutions that its hints show (tiles are numbered 5r + c):
//   solutionFlips   the flips of a flips-only solution with minFlips flips
//   solutionMoves   { flips, forces } of a solution with minMoves moves, with the fewest forces
//                   of all such solutions: its number of forces is the level's limit
//
// Where the numbers come from: the two solution tables in public/flip-tiles/ (see CLAUDE.md).
// Following fewest_moves from a board gives a solution with the fewest moves. Following
// fewest_forces gives one with the fewest forces, and among those the fewest moves; when that
// solution has no forces at all, the board is solvable by flips and its length is minFlips.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FRESH = process.argv.includes("--fresh");
const SEED = 1; // change it to pick other levels from the same tiers
const MIN_DIFFICULTY = 2; // (the tutorial, difficulty 1, is made by hand: see TUTORIAL)
const STRICT_AFTER = 4; // tiers past Delta (4 flips) need minMoves < minFlips (rule e)

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
const representative = (s) => Math.min(...SYMMETRIES.map((perm) => half(transform(s, perm))));

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

const fromBoardString = (board) => {
  const bits = board.replace(/\s/g, "");
  let s = 0;
  for (let k = 0; k < N; k++) if (bits[k] === "1") s |= 1 << k;
  return s >>> 0;
};

// The board a written level ends on after its fewest-moves solution (0 or ALL)
const endsOn = (level) => {
  let t = fromBoardString(level.board);
  for (const k of level.solutionMoves.flips) t ^= MASKS[k];
  for (const k of level.solutionMoves.forces) t ^= 1 << k;
  return t;
};

// Of all the solutions in minMoves moves, one with the fewest forces (`current` if none has fewer)
const fewerForces = (board, minMoves, current) => {
  const count = (s) => {
    let n = 0;
    for (; s; s &= s - 1) n++;
    return n;
  };
  const wrongTiles = (s) => Math.min(count(s), N - count(s));
  let least = current.forces.length;
  let bestFlips;
  const chosen = [];
  const visit = (state, from) => {
    const wrong = wrongTiles(state);
    if (chosen.length + wrong === minMoves && wrong < least) {
      least = wrong;
      bestFlips = [...chosen];
    }
    for (let k = from; k < N; k++) {
      const next = state ^ MASKS[k];
      if (chosen.length + 1 + Math.ceil(wrongTiles(next) / 5) > minMoves) continue;
      chosen.push(k);
      visit(next, k + 1);
      chosen.pop();
    }
  };
  visit(board, 0);
  if (!bestFlips) return current;
  let state = board;
  for (const k of bestFlips) state ^= MASKS[k];
  const target = count(state) * 2 <= N ? 0 : ALL;
  const forces = Array.from({ length: N }, (_, k) => k).filter((k) => ((state ^ target) >>> k) & 1);
  return { flips: bestFlips, forces };
};

// --- the levels already released ----------------------------------------------------------
// Players' stars, hints and replays are saved by the board (see src/progress.ts). A level that
// leaves the game takes them along, so the levels in the current levels.json are kept: by their
// group's representative -> the level exactly as it is written there (the board as shown, its
// solutions). In each grade they are picked before any new board, and shown just as before.
const RELEASED = new Map();
if (!FRESH) {
  try {
    for (const tier of JSON.parse(readFileSync(OUT, "utf8")).tiers) {
      for (const level of tier.levels) RELEASED.set(representative(fromBoardString(level.board)), level);
    }
  } catch {
    // (no levels.json yet: nothing released)
  }
}

// --- the curation ---------------------------------------------------------------------------
const started = Date.now();
console.log("Reading the tables and following every board's solutions...");
const fewestMovesTable = readTable("fewest_moves.bin.gz");
const fewestForcesTable = readTable("fewest_forces.bin.gz");
const best = solutionLengths(fewestMovesTable);
const flipFirst = solutionLengths(fewestForcesTable);

// How many boards are left after each criterion (a board and its inverse count as two)
const funnel = { all: 2 * HALF, a: 0, b: 0, c: 0, d: 0, e: 0 };
const tiers = new Map(); // difficulty (minFlips) -> [{ state, minMoves, minFlips }]

for (let s = 0; s < HALF; s++) {
  const minMoves = best.moves[s];
  const yellow = popcount(s);
  if (!(minMoves < Math.min(yellow, N - yellow))) continue;
  funnel.a += 2;
  if (flipFirst.forces[s] !== 0) continue;
  funnel.b += 2;
  const minFlips = flipFirst.moves[s];
  if (!(minMoves <= minFlips)) continue; // (always true: flips are moves too; kept for the funnel)
  funnel.c += 2;
  if (minFlips < MIN_DIFFICULTY) continue;
  funnel.d += 2;
  if (minFlips > STRICT_AFTER && minMoves === minFlips) continue;
  funnel.e += 2;
  if (!isRepresentative(s)) continue;
  if (!tiers.has(minFlips)) tiers.set(minFlips, []);
  tiers.get(minFlips).push({ state: s, minMoves, minFlips });
}

// The first tier (difficulty 1) is the tutorial, made by hand rather than by the rules above: the
// two puzzles of How to play (a plus in the middle: 1 flip; a single odd tile in the middle: 1
// force), and the other boards that 1 force solves and flips alone can solve too: a single odd
// tile, in a place where flips can also clear it. (A single tile breaks rule a: forcing it is
// the third star. In the tutorial that is the point.)
// They are shown exactly as listed here (not turned, mirrored or recolored at random): 1.1 and
// 1.2 are the app's guided first steps (a tap, then a tap and hold), 1.3 is the other single tile.
//   1.1  a gold plus in the middle of green: 1 flip
//   1.2  one green tile in gold, diagonally next to the middle (row 4, column 4): 1 force
//   1.3  one green tile in gold, in the middle: 1 force
const TUTORIAL = 1;
const tutorial = [MASKS[12], ALL ^ (1 << 18), ALL ^ (1 << 12)];
for (let k = 0; k < N; k++) {
  // (check: these are all the single tiles that flips alone can clear, up to symmetry)
  const s = 1 << k;
  if (flipFirst.forces[half(s)] === 0 && isRepresentative(half(s)) && ![6, 12].includes(k)) {
    throw new Error(`Single tile ${k} can also be cleared by flips: add it to the tutorial`);
  }
}
tiers.set(TUTORIAL, tutorial.map((s) => ({
  state: half(s), minMoves: best.moves[half(s)], minFlips: flipFirst.moves[half(s)], shown: s,
})));
for (const board of tiers.get(TUTORIAL)) {
  if (flipFirst.forces[board.state] !== 0) throw new Error(`Tutorial board ${board.state} can't be solved by flips`);
}

// The second tier (difficulty 2, Beta) is made by hand too: the random 2-flip boards were mostly
// too trivial. Four boards, each given by its 2 flips as (row, column), counted from 1 at the top
// left, and the color it ends on. Shown exactly as listed, in this order.
const BETA = 2;
const beta = [
  { flips: [[3, 3], [3, 4]], endsOn: 0 }, // two side by side in the middle
  { flips: [[1, 3], [5, 3]], endsOn: 1 }, // the top and bottom middle
  { flips: [[1, 5], [2, 4]], endsOn: 0 }, // diagonal neighbours at the top right corner
  { flips: [[3, 1], [5, 2]], endsOn: 1 }, // a knight's move apart at the left
].map(({ flips, endsOn }) => flips.reduce((s, [r, c]) => s ^ MASKS[(r - 1) * C + (c - 1)], endsOn ? ALL : 0));
tiers.set(BETA, beta.map((s) => {
  const board = { state: half(s), minMoves: best.moves[half(s)], minFlips: flipFirst.moves[half(s)], shown: s };
  if (flipFirst.forces[board.state] !== 0 || board.minFlips !== BETA) {
    throw new Error(`Beta board ${toBoardString(s)} isn't solved by ${BETA} flips at best`);
  }
  return board;
}));

// Pick the levels of a tier: within the tier, the boards are grouped by minMoves (the grades),
// and the same number is picked from each grade at random (a grade with fewer boards gives all it
// has). Most boards have a middling minMoves, so this way the easiest and hardest grades get as
// many levels as the others. The levels are then ordered by minMoves.
// How many per grade (perGrade): see the top of this file. A stage has 16 to 32 levels.
// The levels already released (RELEASED) come first in their grade, so they stay as long as the
// grade still has room for them; new boards fill up what is left.
// Each tier has its own random generator (seeded with SEED and its difficulty), so adding or
// removing a tier doesn't change the levels picked for the others.
const MIN_PER_TIER = 16;
const MAX_PER_TIER = 32;
const perGrade = (grades) => (grades === 1 ? 16 : grades <= 3 ? 8 : 4);

function pickGraded(all, rand, difficulty) {
  const groups = new Map(); // minMoves -> boards
  for (const board of all) {
    if (!groups.has(board.minMoves)) groups.set(board.minMoves, []);
    groups.get(board.minMoves).push(board);
  }
  // Leave out the grades with fewer boards than their share, until all left can fill theirs
  let grades = [...groups.keys()].sort((x, y) => x - y);
  for (let left; (left = grades.filter((g) => groups.get(g).length >= perGrade(grades.length))).length < grades.length;) {
    grades = left;
  }
  const share = perGrade(grades.length);
  if (grades.length * share < MIN_PER_TIER || grades.length * share > MAX_PER_TIER) {
    throw new Error(`Difficulty ${difficulty} would get ${grades.length * share} levels, not ${MIN_PER_TIER} to ${MAX_PER_TIER}`);
  }
  return grades.flatMap((grade) => {
    const group = groups.get(grade);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    const released = group.filter((b) => RELEASED.has(b.state));
    const fresh = group.filter((b) => !RELEASED.has(b.state));
    return [...released, ...fresh].slice(0, share).sort((x, y) => x.state - y.state);
  });
}

const output = {
  _comment: "Made by scripts/curate-levels.mjs (npm run curate). Don't edit by hand: run the script.",
  seed: SEED,
  tiers: [...tiers.keys()].sort((x, y) => x - y).map((difficulty) => {
    const all = tiers.get(difficulty);
    // (the hand-made tiers, the tutorial and Beta: all of their boards, in their order)
    const handMade = difficulty === TUTORIAL || difficulty === BETA;
    const picked = handMade ? all : pickGraded(all, random(SEED * 1000 + difficulty), difficulty);
    const grades = {}; // minMoves -> [available, picked]
    for (const board of all) (grades[board.minMoves] ??= [0, 0])[0]++;
    for (const board of picked) grades[board.minMoves][1]++;
    // How each level is shown: the boards kept are each group's lowest number, which leans to
    // the first color (and always has it in the bottom right corner). So every level is turned
    // or mirrored at random, and in each grade half the levels end on one color and half on the
    // other (the color the fewest-moves solution ends on), in random order, by swapping the
    // colors where needed: the player can't guess the color to aim for. This changes nothing
    // about solving it: the same moves, turned along. A released level stays as it was shown
    // (its saved replays are moves on that board); the new ones even out the colors around it.
    const orient = random(SEED * 7919 + difficulty);
    const releasedOf = (b) => (handMade ? undefined : RELEASED.get(b.state));
    const endsOnOne = []; // per picked level: should its fewest-moves solution end on color 1?
    for (const grade of new Set(picked.map((b) => b.minMoves))) {
      const inGrade = picked.flatMap((b, i) => (b.minMoves === grade ? [i] : []));
      const at = inGrade.filter((i) => !releasedOf(picked[i]));
      const keptOnOne = inGrade.filter((i) => releasedOf(picked[i]) && endsOn(releasedOf(picked[i])) === ALL).length;
      const ones = Math.min(at.length, Math.max(0, Math.floor(inGrade.length / 2) - keptOnOne));
      const wants = at.map((_, j) => j < ones);
      if ((inGrade.length % 2) && ones < at.length && orient() < 0.5) wants[ones] = true; // odd: either way
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
      levels: picked.map((board, i) => {
        const { state, minMoves, minFlips, shown: fixed } = board;
        const id = `${difficulty}-${String(i + 1).padStart(2, "0")}`;
        const kept = releasedOf(board);
        if (kept) {
          if (kept.minMoves !== minMoves || kept.minFlips !== minFlips) {
            throw new Error(`Released level ${kept.board} has other numbers now: ${minMoves} moves, ${minFlips} flips`);
          }
          const { board: shown, solutionFlips } = kept;
          const solutionMoves = fewerForces(fromBoardString(shown), minMoves, kept.solutionMoves);
          return { id, board: shown, minMoves, minFlips, solutionFlips, solutionMoves };
        }
        // The two solutions the hints show: flips only (second star), and fewest moves (third)
        const flipsOnly = solutionOf(fewestForcesTable, state);
        const fewest = fewerForces(state, minMoves, solutionOf(fewestMovesTable, state));
        if (flipsOnly.forces.length || flipsOnly.flips.length !== minFlips ||
            fewest.flips.length + fewest.forces.length !== minMoves) {
          throw new Error(`The solutions of board ${state} don't match its minFlips and minMoves`);
        }
        // Turn or mirror it (one of the 8 symmetries); the solutions' tiles turn along. (Not a
        // hand-made board: that is shown as it is.)
        const perm = fixed === undefined ? SYMMETRIES[Math.floor(orient() * SYMMETRIES.length)] : SYMMETRIES[0];
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
        const shown = fixed ?? turned ^ (swap ? ALL : 0);
        // Checked: the solutions still solve the board shown
        const solved = (t) => t === 0 || t === ALL;
        if (!solved(end(shown, solutionFlips, [])) || !solved(end(shown, solutionMoves.flips, solutionMoves.forces))) {
          throw new Error(`The turned solutions of board ${state} don't solve it`);
        }
        return {
          id,
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
  c. + minMoves <= minFlips                    ${fmt(funnel.c)}
  d. + minFlips >= ${MIN_DIFFICULTY}                            ${fmt(funnel.d)}
  e. + minMoves < minFlips after ${STRICT_AFTER} flips          ${fmt(funnel.e)}

Unique levels (rotations, mirror images and swapped colors counted once), per difficulty:`);
for (const tier of output.tiers) {
  console.log(`  ${String(tier.difficulty).padStart(2)} flips: ${fmt(tier.available)} available, ` +
    `${tier.levels.length} picked`);
  for (const [moves, [available, picked]] of Object.entries(tier.grades)) {
    console.log(`      ${moves.padStart(2)} moves: ${fmt(available)} available, ${String(picked).padStart(2)} picked`);
  }
}
// Released levels that are no longer in the game: players lose what they earned on them (it stays
// saved, and comes back if the level does)
const written = new Set(output.tiers.flatMap((t) => t.levels.map((l) => representative(fromBoardString(l.board)))));
const dropped = [...RELEASED.entries()].filter(([s]) => !written.has(s)).map(([, level]) => level.id);
console.log(FRESH
  ? "\n--fresh: every level picked anew"
  : `\nReleased levels kept: ${RELEASED.size - dropped.length} of ${RELEASED.size}` +
    (dropped.length ? `\n  LEFT OUT (players lose their stars on these): ${dropped.join(", ")}` : ""));
console.log(`\nWrote ${tiers.size} tiers to ${OUT} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
