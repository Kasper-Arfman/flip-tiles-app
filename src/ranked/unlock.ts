// Which ranked difficulties are open: difficulty d opens with the stage of the same number (4
// with Delta, 5 Epsilon, ..., 12 Mu), each mode by its own star there:
//   flips  every level of that stage has its flips-only star
//   moves  every level of that stage has its fewest-moves star
// (A stage's number is its difficulty: the fewest flips of its levels.)
import { TIERS } from "../levels/levels";
import { STAR_FLIPS, STAR_MOVES, starsOf } from "../progress";
import type { RankedMode } from "./puzzles";

export const stageFor = (difficulty: number) => TIERS.find((t) => t.difficulty === difficulty);

// The star of a stage's levels that opens a mode's difficulty, and its name
export const STAR_FOR: Record<RankedMode, number> = { flips: STAR_FLIPS, moves: STAR_MOVES };
export const STAR_NAME: Record<RankedMode, string> = { flips: "flips-only", moves: "fewest-moves" };

export function isDifficultyOpen(mode: RankedMode, difficulty: number): boolean {
  const stage = stageFor(difficulty);
  return stage !== undefined && stage.levels.every((level) => (starsOf(level) & STAR_FOR[mode]) !== 0);
}
