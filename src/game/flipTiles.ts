// 5x5 tile-flip puzzle for the flip tiles widget: board encoding, moves, and following the
// solution tables made by the Python solver (main.py in the flip-tiles project).
//
// A board is one number: tile (r, c) is bit r * 5 + c, 1 = white (yellow), 0 = black (green).
// Solved is all black (0) or all white (ALL_WHITE). Flipping tile k inverts its cross:
// state ^ MASKS[k]. Forcing tile k inverts only that tile: state ^ (1 << k).
//
// A table holds, for every board, the first move of an optimal solution:
//   bits 0..4  tile index r * 5 + c
//   bit  5     0 = flip the cross, 1 = force the single tile
//   25         already solved
// The table is symmetric: board s and its inverse ~s = ALL_WHITE - s get the same move. So the
// website only stores the first half (boards 0 .. 2^24 - 1), gzipped: 16 MiB, ~5 MB to download.

export const R = 5;
export const C = 5;
export const N = R * C;
export const ALL_WHITE = 2 ** N - 1;
const HALF = 2 ** (N - 1);
const DONE = N;
const FORCE_BIT = 1 << 5;
const TILE_BITS = FORCE_BIT - 1;

// The flips-only solution of a board with the fewest flips, as tiles, or null when flips alone
// can't solve it. Works without the tables: the flips of the first row (32 ways) decide all the
// rest, because a tile left wrong can then only be put right by the flip right below it.
export function solveFlips(board: number): number[] | null {
  let best: number[] | null = null;
  for (const target of [0, ALL_WHITE]) {
    for (let first = 0; first < 2 ** C; first++) {
      let state = board;
      const flips: number[] = [];
      for (let k = 0; k < N; k++) {
        const flip = k < C ? (first >>> k) & 1 : ((state ^ target) >>> (k - C)) & 1;
        if (flip) {
          state ^= MASKS[k];
          flips.push(k);
        }
      }
      if (state === target && (!best || flips.length < best.length)) best = flips;
    }
  }
  return best;
}

const popcount = (s: number) => {
  let n = 0;
  for (; s; s &= s - 1) n++;
  return n;
};

// A solution of a board with the fewest moves, flips and forces. Also without the tables: tries
// sets of flips, smallest first in spirit (a search that gives up on a set as soon as it can't
// beat the best so far); the forces are then simply the tiles still wrong.
export function solveMoves(board: number): { flips: number[]; forces: number[] } {
  const wrongTiles = (state: number) => Math.min(popcount(state), N - popcount(state));
  let best = wrongTiles(board); // (forcing every tile of the smaller color always solves it)
  let bestFlips: number[] = [];
  const chosen: number[] = [];
  const visit = (state: number, from: number) => {
    const wrong = wrongTiles(state);
    if (chosen.length + wrong < best) {
      best = chosen.length + wrong;
      bestFlips = [...chosen];
    }
    // One more flip is needed to go on, and a move puts right at most 5 tiles
    if (chosen.length + Math.max(1, Math.ceil(wrong / 5)) >= best) return;
    for (let k = from; k < N; k++) {
      chosen.push(k);
      visit(state ^ MASKS[k], k + 1);
      chosen.pop();
    }
  };
  visit(board, 0);
  let state = board;
  for (const k of bestFlips) state ^= MASKS[k];
  const target = popcount(state) * 2 <= N ? 0 : ALL_WHITE;
  const forces = Array.from({ length: N }, (_, k) => k).filter((k) => ((state ^ target) >>> k) & 1);
  return { flips: bestFlips, forces };
}

// Two sets of flips that together change nothing on the board, and don't follow from each other
// (the 5x5 board has exactly two independent ones). They give the test for what flips can solve:
// a board can be solved by flips exactly when it has an even number of 1s on each of the two sets.
let quietSets: number[] | undefined;
function quiet() {
  if (quietSets) return quietSets;
  const found: number[] = [];
  for (let first = 1; first < 2 ** C && found.length < 2; first++) {
    let state = 0;
    let flips = 0;
    for (let k = 0; k < N; k++) {
      if (k < C ? (first >>> k) & 1 : (state >>> (k - C)) & 1) {
        state ^= MASKS[k];
        flips |= 1 << k;
      }
    }
    if (state === 0) found.push(flips);
  }
  return (quietSets = found);
}

// Which tiles (as bits) can still be forced, on the way to a pattern of exactly `total` forces
// that flips can solve, with the tiles in `chosen` already forced. Each tile counts by its "kind"
// (0 to 3: its result on the two sets of flips above); the forces still to come must make up for
// the kinds so far, so only how many of each kind are left matters.
export function tilesToForce(chosen: number, total: number): number {
  const [a, b] = quiet();
  const kind = (board: number) => (popcount(board & a) & 1) | ((popcount(board & b) & 1) << 1);
  const left = total - popcount(chosen) - 1; // (the forces after this tile)
  if (left < 0) return 0;
  const free = [0, 0, 0, 0];
  for (let k = 0; k < N; k++) if (!((chosen >>> k) & 1)) free[kind(1 << k)]++;
  const canMake = (counts: number[], need: number) => {
    for (let one = 0; one <= counts[1]; one++) {
      for (let two = 0; two <= counts[2]; two++) {
        for (let three = 0; three <= counts[3]; three++) {
          const zero = left - one - two - three;
          if (zero < 0 || zero > counts[0]) continue;
          if (((one & 1) * 1 ^ (two & 1) * 2 ^ (three & 1) * 3) === need) return true;
        }
      }
    }
    return false;
  };
  let open = 0;
  for (let k = 0; k < N; k++) {
    if ((chosen >>> k) & 1) continue;
    const counts = [...free];
    counts[kind(1 << k)]--;
    if (canMake(counts, kind(chosen | (1 << k)))) open |= 1 << k;
  }
  return open;
}

// MASKS[k]: the cross of tiles that flipping tile k inverts (borders cut it off)
export const MASKS = Array.from({ length: N }, (_, k) => {
  const [r, c] = [Math.floor(k / C), k % C];
  let mask = 0;
  for (const [i, j] of [[r - 1, c], [r, c - 1], [r, c], [r, c + 1], [r + 1, c]]) {
    if (i >= 0 && i < R && j >= 0 && j < C) mask |= 1 << (i * C + j);
  }
  return mask;
});

export interface Move {
  kind: "flip" | "force";
  tile: number; // r * 5 + c
}

export const apply = (state: number, { kind, tile }: Move) =>
  kind === "flip" ? state ^ MASKS[tile] : state ^ (1 << tile);

export const isSolved = (state: number) => state === 0 || state === ALL_WHITE;

// The two tables: which optimal solution is stored when there is a choice
//   fewestForces: fewest forces first, then fewest moves (flips are free, in a sense)
//   fewestMoves:  fewest moves first, then fewest forces
export type Ranking = "fewestForces" | "fewestMoves";
const URLS: Record<Ranking, string> = {
  fewestForces: "/flip-tiles/fewest_forces.bin.gz",
  fewestMoves: "/flip-tiles/fewest_moves.bin.gz",
};

export class SolutionTable {
  constructor(private readonly half: Uint8Array) {
    if (half.length !== HALF) throw new Error(`A solution table has ${HALF} entries, not ${half.length}`);
  }

  // The stored move for a board, from the half that is stored
  private entry(state: number) {
    return this.half[state < HALF ? state : ALL_WHITE - state];
  }

  // Look up the move, apply it, repeat: the optimal list of moves that solves the board
  solve(state: number): Move[] {
    const moves: Move[] = [];
    for (let v = this.entry(state); v !== DONE; v = this.entry(state)) {
      const move: Move = { kind: v & FORCE_BIT ? "force" : "flip", tile: v & TILE_BITS };
      moves.push(move);
      state = apply(state, move);
      if (moves.length > N) throw new Error("The solution table is corrupt");
    }
    return moves;
  }
}

// Each table is downloaded once, the first time it is asked for
const tables = new Map<Ranking, Promise<SolutionTable>>();

export function loadTable(ranking: Ranking): Promise<SolutionTable> {
  let table = tables.get(ranking);
  if (!table) {
    table = fetchTable(URLS[ranking]);
    table.catch(() => tables.delete(ranking)); // after a failure, asking again retries
    tables.set(ranking, table);
  }
  return table;
}

async function fetchTable(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some servers already unpack .gz files on the way (Content-Encoding: gzip); a gzip file
  // starts with the bytes 1f 8b, so only unpack what is still packed
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new SolutionTable(bytes);
  const unpacked = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
  return new SolutionTable(new Uint8Array(await unpacked.arrayBuffer()));
}
