// Which ranked difficulties are open, each mode by its own star:
//   flips  difficulty d: every level of the stage of number d (4 Delta, 5 Epsilon, ..., 12 Mu) has
//          its flips-only star (the other stars of the stage don't matter)
//   moves  difficulty d: every level of every stage whose fewest-moves solution has d moves (the
//          groups of "d moves" on the stage screens: Delta's, Epsilon's, ...) has its
//          fewest-moves star
// (A stage's number is its difficulty: the fewest flips of its levels.)
import { TIERS, type Level, type Tier } from "../levels/levels";
import { STAR_FLIPS, STAR_MOVES, starsOf } from "../progress";
import type { RankedMode } from "./puzzles";

export const stageFor = (difficulty: number) => TIERS.find((t) => t.difficulty === difficulty);

// The star that opens a mode's difficulties, and its name
export const STAR_FOR: Record<RankedMode, number> = { flips: STAR_FLIPS, moves: STAR_MOVES };
export const STAR_NAME: Record<RankedMode, string> = { flips: "flips-only", moves: "fewest-moves" };

// A group of levels that has to be complete: a whole stage (flips), or one group of a stage (moves)
export interface Requirement {
  tier: Tier;
  levels: Level[];
  minMoves?: number; // moves: the group's number of moves
}

export function requirements(mode: RankedMode, difficulty: number): Requirement[] {
  if (mode === "flips") {
    const stage = stageFor(difficulty);
    return stage ? [{ tier: stage, levels: stage.levels }] : [];
  }
  return TIERS.flatMap((tier) => tier.grades
    .filter((grade) => grade[0].minMoves === difficulty)
    .map((levels) => ({ tier, levels, minMoves: difficulty })));
}

// How many levels of a group have the mode's star
export const earned = (mode: RankedMode, r: Requirement) =>
  r.levels.filter((level) => (starsOf(level) & STAR_FOR[mode]) !== 0).length;

export function isDifficultyOpen(mode: RankedMode, difficulty: number): boolean {
  const needed = requirements(mode, difficulty);
  return needed.length > 0 && needed.every((r) => earned(mode, r) === r.levels.length);
}
