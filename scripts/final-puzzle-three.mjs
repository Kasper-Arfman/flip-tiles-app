// A second final-challenge board, for three puzzles in one: a search for a 6x6 board where
//   flips only:    one solution, 18 flips (half the tiles: the hardest to guess)
//   fewest moves:  one solution, with at least MIN_FORCES forces
//   Solve it:      at most F flips and X forces (X below the fewest-moves solution's forces, F below
//                  18), so neither bonus solution can be played there; between MIN_WAYS and
//                  MAX_WAYS solutions fit; and no light chase (4 sides x 2 colors x 64 first
//                  rows) fits, so the standard method doesn't find one.
// Run: node scripts/final-puzzle-three.mjs [minutes] (default 10). Prints each board found.
const N = 6, R = 1 << N, FULL = R - 1;
const MIN_FORCES = 5, MIN_WAYS = 10, MAX_WAYS = 60;
const MAXF = 18, MAXX = 9; // (counted up to these flips and forces)
const minutes = Number(process.argv[2] ?? 10);

const pc = new Uint8Array(R);
for (let v = 1; v < R; v++) pc[v] = pc[v >> 1] + (v & 1);
const T = new Uint8Array(R);
for (let v = 0; v < R; v++) T[v] = (v ^ (v << 1) ^ (v >> 1)) & FULL;

// Flips only: the one flip set to each color (6x6 has no quiet sets)
function flipSet(rows, target) {
  for (let f0 = 0; f0 < R; f0++) {
    const f = [f0];
    for (let r = 0; r < N - 1; r++) f.push(rows[r] ^ target ^ (r ? f[r - 1] : 0) ^ T[f[r]]);
    if ((rows[N - 1] ^ target ^ f[N - 2] ^ T[f[N - 1]]) === 0) return f;
  }
  return null;
}
const weight = (f) => f.reduce((s, v) => s + pc[v], 0);

// Every way to solve the board, counted by its flips and forces (up to MAXF and MAXX), both colors
const B = (MAXF + 1) * (MAXX + 1);
function counts(rows) {
  const total = new Float64Array(B);
  for (const target of [0, FULL]) {
    let D = new Map();
    for (let f = 0; f < R; f++) {
      const a = new Float64Array(B);
      a[pc[f] * (MAXX + 1)] = 1;
      D.set(f, a);
    }
    for (let r = 0; r < N; r++) {
      const next = new Map();
      for (const [key, a] of D) {
        const g = Math.floor(key / R), f = key % R;
        const k = rows[r] ^ target ^ g ^ T[f];
        for (let h = 0; h < (r < N - 1 ? R : 1); h++) {
          const forces = pc[k ^ h], flips = r < N - 1 ? pc[h] : 0;
          if (forces > MAXX) continue;
          const nk = f * R + h;
          let b = next.get(nk);
          for (let fl = 0; fl + flips <= MAXF; fl++) {
            for (let x = 0; x + forces <= MAXX; x++) {
              const c = a[fl * (MAXX + 1) + x];
              if (!c) continue;
              if (!b) { b = new Float64Array(B); next.set(nk, b); }
              b[(fl + flips) * (MAXX + 1) + x + forces] += c;
            }
          }
        }
      }
      D = next;
    }
    for (const a of D.values()) for (let i = 0; i < B; i++) total[i] += a[i];
  }
  return total; // total[flips * (MAXX + 1) + forces]
}

// Every light chase: (flips, forces) of each
function chases(rows) {
  const out = [];
  let grid = rows.map((v) => [...Array(N)].map((_, c) => (v >> c) & 1));
  for (let side = 0; side < 4; side++) {
    const rs = grid.map((row) => row.reduce((v, b, c) => v | (b << c), 0));
    for (const target of [0, FULL]) {
      for (let f0 = 0; f0 < R; f0++) {
        const f = [f0];
        for (let r = 0; r < N - 1; r++) f.push(rs[r] ^ target ^ (r ? f[r - 1] : 0) ^ T[f[r]]);
        const left = rs[N - 1] ^ target ^ f[N - 2] ^ T[f[N - 1]];
        out.push([weight(f), pc[left]]);
      }
    }
    grid = grid[0].map((_, c) => grid.map((row) => row[c]).reverse());
  }
  return out;
}

const boardOf = (f) => f.map((v, r) => (v ^ (v << 1) ^ (v >> 1) ^ (r ? f[r - 1] : 0) ^ (r < N - 1 ? f[r + 1] : 0)) & FULL);
const randomFlips = () => {
  const tiles = [...Array(N * N).keys()].sort(() => Math.random() - 0.5).slice(0, 18);
  const f = Array(N).fill(0);
  for (const k of tiles) f[Math.floor(k / N)] |= 1 << (k % N);
  return f;
};
const show = (rows) => rows.map((v) => [...Array(N)].map((_, c) => (v >> c) & 1).join("")).join(",");
const log2C = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log2((n - k + i) / i); return s; };

const t0 = Date.now();
let tried = 0, passed = 0, found = 0;
const kept = [];
while (Date.now() - t0 < minutes * 60_000) {
  tried++;
  const rows = boardOf(randomFlips());
  // flips only: 18, the other color more
  const a = flipSet(rows, 0), b = flipSet(rows, FULL);
  if (!a || !b || Math.min(weight(a), weight(b)) !== 18 || weight(a) === weight(b)) continue;
  const c = counts(rows);
  // fewest moves: one solution, with at least MIN_FORCES forces
  let best = Infinity, ways = 0, bestForces = -1;
  for (let fl = 0; fl <= MAXF; fl++) for (let x = 0; x <= MAXX; x++) {
    const n = c[fl * (MAXX + 1) + x];
    if (!n) continue;
    if (fl + x < best) { best = fl + x; ways = n; bestForces = x; } else if (fl + x === best) ways += n;
  }
  if (ways !== 1 || bestForces < MIN_FORCES) continue;
  passed++;
  // Solve it: limits that leave out both bonus solutions, hold MIN_WAYS..MAX_WAYS ways, no chase
  const cs = chases(rows);
  const boxes = [];
  for (let X = 1; X < bestForces; X++) {
    for (let F = 1; F < 18; F++) {
      let n = 0;
      for (let fl = 0; fl <= F; fl++) for (let x = 0; x <= X; x++) n += c[fl * (MAXX + 1) + x];
      if (n < MIN_WAYS || n > MAX_WAYS) continue;
      if (cs.some(([fl, x]) => fl <= F && x <= X)) continue;
      boxes.push({ F, X, n });
    }
  }
  if (!boxes.length) continue;
  found++;
  const bits = log2C(72, best);
  kept.push({ rows: show(rows), best, bestForces, bits, boxes });
  console.log(`\nFound: ${show(rows)}`);
  console.log(`  flips only: 18 (one way, 33.1 bits); fewest moves: ${best} = ${best - bestForces} flips + ${bestForces} forces (one way, ${bits.toFixed(1)} bits)`);
  console.log(`  Solve it, limits that work: ${boxes.slice(0, 6).map((b) => `${b.F} flips & ${b.X} forces: ${b.n} ways`).join("; ")}`);
}
// The best: the fewest-moves star hardest (most moves), then the most forces in it
kept.sort((a, b) => b.bits - a.bits || b.bestForces - a.bestForces);
console.log("\nBest boards:");
for (const k of kept.slice(0, 5)) {
  console.log(`  ${k.rows}: fewest moves ${k.best} (${k.best - k.bestForces} flips + ${k.bestForces} forces, ${k.bits.toFixed(1)} bits); ` +
    `Solve it: ${k.boxes.map((b) => `${b.F} flips & ${b.X} forces: ${b.n}`).join("; ")}`);
}
console.log(`\n${tried} boards tried, ${passed} with one 18-flip and one ${MIN_FORCES}+ force fewest-moves solution, ${found} with a Solve it, in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
