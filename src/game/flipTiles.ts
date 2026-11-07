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
