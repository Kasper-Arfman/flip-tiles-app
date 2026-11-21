// The puzzles of ranked mode: made on the spot, at random, so they need no list and no server
// (ranked mode plays offline). A puzzle of difficulty d in a mode:
//   flips  its fewest flips (with flips only) is exactly d
//   moves  its fewest moves (flips and forces) is exactly d
// Made by playing d random moves on a solved board, then checking with the solvers that it
// can't be done in fewer (a few tries are thrown away; see tests/ranked.test.ts for the speed).
import { ALL_WHITE, MASKS, N, isSolved, solveFlips, solveMoves, type Move } from "../game/flipTiles";

export type RankedMode = "flips" | "moves";
export const RANKED_MODES: RankedMode[] = ["flips", "moves"]; // (in this order on the screens)

// The difficulties a player can choose, per mode: from 4 (fewer is over too quickly); at most 12
// flips and 8 moves (harder boards are so rare that making one takes too long)
export const DIFFICULTIES: Record<RankedMode, number[]> = {
  flips: [4, 5, 6, 7, 8, 9, 10, 11, 12],
  moves: [4, 5, 6, 7, 8],
};

export interface RankedPuzzle {
  mode: RankedMode;
  difficulty: number;
  board: number; // tile k (row by row from the top left) is bit k
  maxForces: number; // the forces the player has (moves mode; 0 in flips mode)
}

const popcount = (s: number) => {
  let n = 0;
  for (; s; s &= s - 1) n++;
  return n;
};

// `count` different tiles, at random
function randomTiles(count: number, random: () => number): number[] {
  const pool = Array.from({ length: N }, (_, k) => k);
  const tiles: number[] = [];
  for (let i = 0; i < count; i++) tiles.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return tiles;
}

// Of the solutions in `minMoves` moves, one with the fewest forces (as the levels: the player gets
// that many forces). Tries the sets of flips that can still make it in minMoves; the forces are
// then the tiles left wrong.
export function fewestForcesSolution(board: number, minMoves: number): { flips: number[]; forces: number[] } | null {
  const wrongTiles = (s: number) => Math.min(popcount(s), N - popcount(s));
  let least = Infinity;
  let best: number[] | null = null;
  const chosen: number[] = [];
  const visit = (state: number, from: number) => {
    const wrong = wrongTiles(state);
    if (chosen.length + wrong === minMoves && wrong < least) {
      least = wrong;
      best = [...chosen];
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
  if (!best) return null;
  const flips: number[] = best;
  let state = board;
  for (const k of flips) state ^= MASKS[k];
  const target = popcount(state) * 2 <= N ? 0 : ALL_WHITE;
  const forces = Array.from({ length: N }, (_, k) => k).filter((k) => ((state ^ target) >>> k) & 1);
  return { flips, forces };
}

export const fewestForces = (board: number, minMoves: number) =>
  fewestForcesSolution(board, minMoves)?.forces.length ?? Infinity;

// A random puzzle of this mode and difficulty
// The solution ranked's hints show, one move at a time: the fewest flips (flips mode), or the
// fewest moves with the fewest forces the puzzle allows, forces first (moves mode)
export function hintSolution(puzzle: RankedPuzzle): Move[] {
  if (puzzle.mode === "flips") return (solveFlips(puzzle.board) ?? []).map((tile) => ({ kind: "flip", tile }));
  const s = fewestForcesSolution(puzzle.board, puzzle.difficulty);
  if (!s) return [];
  return [
    ...s.forces.map((tile): Move => ({ kind: "force", tile })),
    ...s.flips.map((tile): Move => ({ kind: "flip", tile })),
  ];
}

export function makePuzzle(mode: RankedMode, difficulty: number, random: () => number = Math.random): RankedPuzzle {
  for (let tries = 0; tries < 10_000; tries++) {
    // A random color: all green or all yellow at the end
    let board = random() < 0.5 ? 0 : ALL_WHITE;
    if (mode === "flips") {
      for (const k of randomTiles(difficulty, random)) board ^= MASKS[k];
      if (isSolved(board) || solveFlips(board)?.length !== difficulty) continue;
      return { mode, difficulty, board, maxForces: 0 };
    }
    // Moves: mostly flips, with a few forces (a solution of many forces is little fun)
    const forces = Math.floor(random() * Math.min(3, difficulty));
    const tiles = randomTiles(difficulty, random);
    tiles.forEach((k, i) => (board ^= i < forces ? 1 << k : MASKS[k]));
    board >>>= 0;
    if (isSolved(board)) continue;
    const best = solveMoves(board);
    if (best.flips.length + best.forces.length !== difficulty) continue;
    return { mode, difficulty, board, maxForces: fewestForces(board, difficulty) };
  }
  throw new Error(`No ${mode} puzzle of difficulty ${difficulty} found`);
}

// The board as the widget's `start` text: 25 zeros and ones, the first the top left tile
export const boardText = (board: number) =>
  Array.from({ length: N }, (_, k) => (board >>> k) & 1).join("");
