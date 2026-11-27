// The final challenge's board (src/screens/final.ts): a search for the 7x7 board whose two stars
// are both as hard as can be. Run: node scripts/final-puzzle.mjs [minutes] (default 10).
//
// How hard a goal is: the chance of guessing a perfect solution, knowing how many moves it takes.
// In bits: log2(candidates / optimal solutions).
//   flips only:    k flips among 49 tiles: C(49, k) candidates (the most at 24 or 25)
//   fewest moves:  m moves, each a flip or a force on one of 49 tiles: C(98, m) candidates
// A board with more than one optimal solution is easier to guess: its count divides.
// The board's difficulty: the easier of its two goals (that is the one to make as hard as can
// be); between boards equal in that, the harder of the two.
//
// 7x7 has no "quiet" sets of flips (the flips are independent): each board has exactly one flip
// set to all green and one to all yellow. Fewest moves: a dynamic program row by row (a row's
// leftover tiles, fixed with forces, depend only on the flips in it and the rows next to it),
// exact, and counting the optimal solutions.
import { readFileSync } from "node:fs";

// --- the solvers, for an n x n board as n rows of n bits (bit c: column c) ------------------------
function makeSolver(n) {
  const FULL = (1 << n) - 1;
  const ROWS = 1 << n;
  const pc = new Uint8Array(ROWS);
  for (let v = 1; v < ROWS; v++) pc[v] = pc[v >> 1] + (v & 1);
  const T = new Uint16Array(ROWS); // a row's own flips: each tile and its left and right neighbour
  for (let v = 0; v < ROWS; v++) T[v] = (v ^ (v << 1) ^ (v >> 1)) & FULL;

  // Flips only: every flip set that solves the board to `target` (0: all green, FULL: all yellow).
  // The first row's flips decide the rest (each next row clears the row above it).
  function flipSolutions(rows, target) {
    const found = [];
    for (let f0 = 0; f0 < ROWS; f0++) {
      const f = [f0];
      for (let r = 0; r < n - 1; r++) f.push(rows[r] ^ target ^ (r ? f[r - 1] : 0) ^ T[f[r]]);
      if ((rows[n - 1] ^ target ^ f[n - 2] ^ T[f[n - 1]]) === 0) found.push(f);
    }
    return found;
  }

  // Fewest moves (flips and forces) to `target`, and how many move sets reach it. State: the flips
  // of the last two rows; a row's leftover tiles (forced) are known once the row after it is chosen.
  const INF = 1e9;
  let D = new Float64Array(ROWS * ROWS), C = new Float64Array(ROWS * ROWS);
  let D2 = new Float64Array(ROWS * ROWS), C2 = new Float64Array(ROWS * ROWS);
  function fewestMoves(rows, target) {
    // rows 0: f_-1 = 0, f_0 free
    D.fill(INF); C.fill(0);
    for (let f0 = 0; f0 < ROWS; f0++) { D[f0] = pc[f0]; C[f0] = 1; } // index g * ROWS + f (g = 0)
    for (let r = 0; r < n - 1; r++) {
      D2.fill(INF); C2.fill(0);
      const base = rows[r] ^ target;
      for (let g = 0; g < ROWS; g++) {
        for (let f = 0; f < ROWS; f++) {
          const d = D[g * ROWS + f];
          if (d >= INF) continue;
          const c = C[g * ROWS + f];
          const k = base ^ g ^ T[f]; // row r's leftover before the next row's flips
          const out = f * ROWS;
          for (let h = 0; h < ROWS; h++) {
            const v = d + pc[h] + pc[k ^ h];
            const i = out + h;
            if (v < D2[i]) { D2[i] = v; C2[i] = c; } else if (v === D2[i]) C2[i] += c;
          }
        }
      }
      [D, D2] = [D2, D];
      [C, C2] = [C2, C];
    }
    let best = INF, count = 0;
    const last = rows[n - 1] ^ target;
    for (let g = 0; g < ROWS; g++) {
      for (let f = 0; f < ROWS; f++) {
        const d = D[g * ROWS + f];
        if (d >= INF) continue;
        const v = d + pc[last ^ g ^ T[f]];
        if (v < best) { best = v; count = C[g * ROWS + f]; } else if (v === best) count += C[g * ROWS + f];
      }
    }
    return { moves: best, count };
  }

  const weight = (f) => f.reduce((s, v) => s + pc[v], 0);
  // Both goals of a board: [fewest flips, how many], [fewest moves, how many] (both colors)
  function analyse(rows) {
    const flipSets = [...flipSolutions(rows, 0), ...flipSolutions(rows, FULL)].map(weight);
    const minFlips = flipSets.length ? Math.min(...flipSets) : Infinity;
    const a = fewestMoves(rows, 0), b = fewestMoves(rows, FULL);
    const minMoves = Math.min(a.moves, b.moves);
    const moveCount = (a.moves === minMoves ? a.count : 0) + (b.moves === minMoves ? b.count : 0);
    return { minFlips, flipCount: flipSets.filter((w) => w === minFlips).length, minMoves, moveCount };
  }
  return { analyse, flipSolutions, FULL, pc };
}

// log2 of C(n, k)
const log2C = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log2((n - k + i) / i); return s; };
const difficulty = (a, n) => {
  const flips = log2C(n * n, a.minFlips) - Math.log2(a.flipCount);
  const moves = log2C(2 * n * n, a.minMoves) - Math.log2(a.moveCount);
  return { flips, moves, easier: Math.min(flips, moves), harder: Math.max(flips, moves) };
};

// --- check the solver on the 5x5 levels (their fewest moves and flips are known) -----------------
{
  const s5 = makeSolver(5);
  const data = JSON.parse(readFileSync(new URL("../src/levels/levels.json", import.meta.url), "utf8"));
  const levels = [...data.tiers, ...data.bonus].flatMap((t) => t.levels).filter((_, i) => i % 7 === 0).slice(0, 150);
  let bad = 0;
  for (const level of levels) {
    // (the board's first digit is the top-left tile: bit c of row r is column c)
    const rows = level.board.split(" ").map((row) => [...row].reduce((v, ch, c) => v | (Number(ch) << c), 0));
    const a = s5.analyse(rows);
    if (a.minMoves !== level.minMoves || a.minFlips !== level.minFlips) bad++;
  }
  console.log(`Check on ${levels.length} 5x5 levels: ${bad ? `${bad} WRONG` : "all right"}`);
  if (bad) process.exit(1);
}

// --- a board's solutions, written out (for src/screens/final.ts: its hints) ----------------------
// node scripts/final-puzzle.mjs solve 101010,011000,...   (rows, the first digit the left tile)
if (process.argv[2] === "solve") {
  const text = process.argv[3].split(",");
  const n = text.length;
  const s = makeSolver(n);
  const rows = text.map((row) => [...row].reduce((v, ch, c) => v | (Number(ch) << c), 0));
  const tiles = (f) => f.flatMap((v, r) => [...Array(n)].flatMap((_, c) => ((v >> c) & 1 ? [r * n + c] : [])));
  const T = (v) => (v ^ (v << 1) ^ (v >> 1)) & s.FULL;
  // Fewest moves with its moves: every flip set of the first rows is tried row by row (as the
  // program above), keeping for each state the one way to it; then followed back
  let best = null;
  for (const target of [0, s.FULL]) {
    const R = 1 << n;
    let D = new Map([[0 * R + 0, { cost: 0, path: [] }]]); // (previous row, this row) before row 0: f_-1 = 0
    // row 0's flips
    const first = new Map();
    for (let f = 0; f < R; f++) first.set(f, { cost: s.pc[f], path: [f] });
    D = new Map([...first].map(([f, v]) => [f, v])); // key: g * R + f with g = 0
    for (let r = 0; r < n - 1; r++) {
      const next = new Map();
      for (const [key, v] of D) {
        const g = Math.floor(key / R), f = key % R;
        const k = rows[r] ^ target ^ g ^ T(f);
        for (let h = 0; h < R; h++) {
          const cost = v.cost + s.pc[h] + s.pc[k ^ h];
          const nk = f * R + h;
          const known = next.get(nk);
          if (!known || cost < known.cost) next.set(nk, { cost, path: [...v.path, h] });
        }
      }
      D = next;
    }
    for (const [key, v] of D) {
      const g = Math.floor(key / R), f = key % R;
      const cost = v.cost + s.pc[rows[n - 1] ^ target ^ g ^ T(f)];
      if (!best || cost < best.cost) best = { cost, flips: v.path, target };
    }
  }
  const forces = rows.map((v, r) => (v ^ best.target ^ T(best.flips[r]) ^ (r ? best.flips[r - 1] : 0) ^ (r < n - 1 ? best.flips[r + 1] : 0)) & s.FULL);
  const flipOnly = [0, s.FULL].flatMap((t) => s.flipSolutions(rows, t)).sort((a, b) => tiles(a).length - tiles(b).length)[0];
  console.log(JSON.stringify({
    fewestMoves: { moves: best.cost, flips: tiles(best.flips), forces: tiles(forces) },
    flipsOnly: { flips: tiles(flipOnly) },
  }));
  process.exit(0);
}

// --- the search ---------------------------------------------------------------------------------
// node scripts/final-puzzle.mjs <size> <minutes>
// The boards searched: made from a flip set of exactly half the tiles (18 of 36 on 6x6: the most
// combinations, so the flips-only star as hard as it can be): flipping those on a solved board
// gives the puzzle. (The puzzle's own fewest flips is checked: the other color might need fewer.)
// Among those, the one whose fewest-moves star is hardest: start from a random flip set, and keep
// moving one flip to another tile (every such move tried, the best taken) while it gets harder;
// then start again from another random flip set. The best board of all is kept.
const N = Number(process.argv[2] ?? 6);
const minutes = Number(process.argv[3] ?? 5);
const K = Math.floor((N * N) / 2);
const solver = makeSolver(N);
const t0 = Date.now();
// The puzzle that this flip set (rows of N bits) solves: each flip changes its tile and the 4 around
const boardOf = (f) => f.map((v, r) => (v ^ (v << 1) ^ (v >> 1) ^ (r ? f[r - 1] : 0) ^ (r < N - 1 ? f[r + 1] : 0)) & solver.FULL);
const randomFlips = () => {
  const tiles = [...Array(N * N).keys()].sort(() => Math.random() - 0.5).slice(0, K);
  const f = Array(N).fill(0);
  for (const k of tiles) f[Math.floor(k / N)] |= 1 << (k % N);
  return f;
};
const score = (flips) => {
  const rows = boardOf(flips);
  const a = solver.analyse(rows);
  return { flips, rows, a, d: difficulty(a, N) };
};
const better = (x, y) => x.d.easier > y.d.easier + 1e-9 || (Math.abs(x.d.easier - y.d.easier) < 1e-9 && x.d.harder > y.d.harder + 1e-9);
const show = (s) => s.rows.map((v) => [...Array(N)].map((_, c) => (v >> c) & 1).join("")).join(" ");
const describe = (s) => `flips ${s.a.minFlips} (x${s.a.flipCount}): ${s.d.flips.toFixed(1)} bits, ` +
  `moves ${s.a.minMoves} (x${s.a.moveCount}): ${s.d.moves.toFixed(1)} bits`;

{
  const t = Date.now();
  const s = score(randomFlips());
  console.log(`One ${N}x${N} board: ${Date.now() - t} ms (${describe(s)})`);
}

let best = null, climbs = 0, evals = 0, lastReport = Date.now();
while (Date.now() - t0 < minutes * 60_000) {
  let cur = score(randomFlips());
  evals++;
  for (;;) {
    let step = null;
    const on = [], off = [];
    for (let k = 0; k < N * N; k++) ((cur.flips[Math.floor(k / N)] >> (k % N)) & 1 ? on : off).push(k);
    for (const a of on) {
      for (const b of off) {
        const flips = cur.flips.slice();
        flips[Math.floor(a / N)] ^= 1 << (a % N);
        flips[Math.floor(b / N)] ^= 1 << (b % N);
        const s = score(flips);
        evals++;
        if (better(s, step ?? cur)) step = s;
      }
    }
    if (!step) break;
    cur = step;
    if (Date.now() - t0 > minutes * 60_000) break;
  }
  climbs++;
  if (!best || better(cur, best)) {
    best = cur;
    console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min] new best: ${show(best)}  ${describe(best)}`);
  }
  if (Date.now() - lastReport > 60_000) {
    lastReport = Date.now();
    console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min] ${climbs} climbs, ${evals} boards`);
  }
}
console.log(`\nDone: ${climbs} climbs, ${evals} boards in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.log(`Best: ${show(best)}\n  ${describe(best)}`);
