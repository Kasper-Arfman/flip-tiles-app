// The puzzle itself: moves, and the solvers
import { describe, expect, it } from "vitest";
import { ALL_WHITE, MASKS, N, apply, isSolved, solveFlips, solveMoves, tilesToForce, type Move } from "../src/game/flipTiles";

// A fixed sequence of "random" numbers, so a failing test fails the same way every time
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}
const rand = random(42);
const randomBoard = () => Math.floor(rand() * 2 ** N);
const play = (board: number, moves: Move[]) => moves.reduce(apply, board);

describe("moves", () => {
  it("a flip changes the tile and its neighbours, cut off by the edges", () => {
    const count = (mask: number) => mask.toString(2).split("1").length - 1;
    expect(count(MASKS[0])).toBe(3); // a corner
    expect(count(MASKS[2])).toBe(4); // an edge
    expect(count(MASKS[12])).toBe(5); // the middle
    expect(MASKS[12]).toBe((1 << 7) | (1 << 11) | (1 << 12) | (1 << 13) | (1 << 17));
  });

  it("a force changes only its tile", () => {
    expect(apply(0, { kind: "force", tile: 24 })).toBe(1 << 24);
  });

  it("every move is its own inverse, and the order doesn't matter", () => {
    for (let i = 0; i < 50; i++) {
      const board = randomBoard();
      const moves: Move[] = Array.from({ length: 6 }, () => ({ kind: rand() < 0.5 ? "flip" : "force", tile: Math.floor(rand() * N) }));
      for (const move of moves) expect(apply(apply(board, move), move)).toBe(board);
      expect(play(board, moves)).toBe(play(board, [...moves].reverse()));
    }
  });

  it("solved is one color: all green or all yellow", () => {
    expect(isSolved(0)).toBe(true);
    expect(isSolved(ALL_WHITE)).toBe(true);
    expect(isSolved(1)).toBe(false);
  });
});

describe("solvers", () => {
  it("solveFlips solves every board that flips can solve, and says null otherwise", () => {
    for (let i = 0; i < 200; i++) {
      const board = randomBoard();
      const flips = solveFlips(board);
      if (flips) expect(isSolved(play(board, flips.map((tile) => ({ kind: "flip", tile }))))).toBe(true);
    }
    // A board made by flips can always be solved with flips, in at most as many
    for (let i = 0; i < 100; i++) {
      const tiles = [...new Set(Array.from({ length: 4 }, () => Math.floor(rand() * N)))];
      const board = play(0, tiles.map((tile) => ({ kind: "flip", tile })));
      expect(solveFlips(board)!.length).toBeLessThanOrEqual(tiles.length);
    }
  });

  it("solveMoves solves every board, never in more moves than flips alone", () => {
    for (let i = 0; i < 40; i++) {
      const board = randomBoard();
      const { flips, forces } = solveMoves(board);
      const moves: Move[] = [...forces.map((tile): Move => ({ kind: "force", tile })), ...flips.map((tile): Move => ({ kind: "flip", tile }))];
      expect(isSolved(play(board, moves))).toBe(true);
      const onlyFlips = solveFlips(board);
      if (onlyFlips) expect(moves.length).toBeLessThanOrEqual(onlyFlips.length);
    }
  });

  it("solveMoves finds the one move of a board one move from solved", () => {
    for (let tile = 0; tile < N; tile++) {
      const { flips, forces } = solveMoves(1 << tile);
      expect(flips.length + forces.length).toBe(1);
    }
  });

  it("tilesToForce: one force opens exactly the tiles that flips can then solve", () => {
    const open = tilesToForce(0, 1);
    for (let k = 0; k < N; k++) expect(((open >>> k) & 1) === 1).toBe(solveFlips(1 << k) !== null);
  });
});
