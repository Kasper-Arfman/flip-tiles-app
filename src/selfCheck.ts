// Checks that the game's data is right: every level can be solved by its stored solutions, in
// exactly the moves its stars ask for. Run by the unit tests (tests/levels.test.ts) on the
// computer, and by the debug screen's "Check the levels" on a phone (the same code, in the
// phone's own browser engine).
//
// Each check returns the problems it found, as text: an empty list means all is well.
import { MASKS, N, apply, isSolved, solveFlips, solveMoves, type Move } from "./game/flipTiles";
import { TIERS, type Level } from "./levels/levels";

// A level's board as a number: tile k (row by row from the top left, as written) is bit k
export function boardOf(level: Level): number {
  const bits = level.board.replace(/\s/g, "");
  if (!/^[01]+$/.test(bits) || bits.length !== N) throw new Error(`${level.id}: "${level.board}" is not a board`);
  let state = 0;
  for (let k = 0; k < N; k++) if (bits[k] === "1") state |= 1 << k;
  return state >>> 0;
}

const play = (board: number, moves: Move[]) => moves.reduce(apply, board);
const flips = (tiles: number[]): Move[] => tiles.map((tile) => ({ kind: "flip", tile }));
const forces = (tiles: number[]): Move[] => tiles.map((tile) => ({ kind: "force", tile }));

// The quick checks of one level (the stored solutions, its numbers)
export function checkLevel(level: Level): string[] {
  const problems: string[] = [];
  const say = (text: string) => problems.push(`${level.id}: ${text}`);
  let board: number;
  try {
    board = boardOf(level);
  } catch (error) {
    return [String(error)];
  }
  if (isSolved(board)) say("is solved from the start");
  if (!isSolved(play(board, flips(level.solutionFlips)))) say("its flips solution doesn't solve it");
  if (level.solutionFlips.length !== level.minFlips) say(`its flips solution has ${level.solutionFlips.length} flips, not minFlips ${level.minFlips}`);
  const { flips: moveFlips, forces: moveForces } = level.solutionMoves;
  if (!isSolved(play(board, [...forces(moveForces), ...flips(moveFlips)]))) say("its moves solution doesn't solve it");
  if (moveFlips.length + moveForces.length !== level.minMoves) say(`its moves solution has ${moveFlips.length + moveForces.length} moves, not minMoves ${level.minMoves}`);
  if (level.maxForces !== moveForces.length) say(`maxForces ${level.maxForces}, but its solution uses ${moveForces.length}`);
  if (level.minMoves > level.minFlips) say(`minMoves ${level.minMoves} is more than minFlips ${level.minFlips}`);
  const tiles = [...level.solutionFlips, ...moveFlips, ...moveForces];
  if (tiles.some((t) => !Number.isInteger(t) || t < 0 || t >= MASKS.length)) say("a solution has a tile that isn't on the board");
  // The fewest flips, worked out again (fast: 64 tries)
  const best = solveFlips(board);
  if (!best) say("flips alone can't solve it");
  else if (best.length !== level.minFlips) say(`minFlips is ${level.minFlips}, but ${best.length} flips solve it`);
  return problems;
}

// The slow check of one level: the fewest moves, worked out again with the solver
export function checkFewestMoves(level: Level): string[] {
  const { flips: f, forces: x } = solveMoves(boardOf(level));
  const found = f.length + x.length;
  return found === level.minMoves ? [] : [`${level.id}: minMoves is ${level.minMoves}, but ${found} moves solve it`];
}

// All levels: the quick checks, and how the tiers hang together (numbers, grades, no level twice)
export function checkLevels(): string[] {
  const problems: string[] = [];
  const keys = new Map<string, string>();
  TIERS.forEach((tier, t) => {
    if (!tier.levels.length) problems.push(`${tier.name}: has no levels`);
    if (t > 0 && tier.difficulty <= TIERS[t - 1].difficulty) problems.push(`${tier.name}: not after ${TIERS[t - 1].name}`);
    tier.levels.forEach((level, i) => {
      problems.push(...checkLevel(level));
      if (level.number !== i + 1) problems.push(`${level.id}: number ${level.number} at place ${i + 1}`);
      if (level.difficulty !== tier.difficulty) problems.push(`${level.id}: difficulty ${level.difficulty} in tier ${tier.difficulty}`);
      if (!tier.grades[level.grade]?.includes(level)) problems.push(`${level.id}: not in its grade ${level.grade}`);
      const same = keys.get(level.key);
      if (same) problems.push(`${level.id}: the same puzzle as ${same}`);
      keys.set(level.key, level.id);
    });
  });
  return problems;
}
