// The levels, from levels.json (made by scripts/curate-levels.mjs), grouped in tiers by difficulty.
import data from "./levels.json";

export interface Level {
  id: string; // e.g. "4-07"
  board: string; // the start board, in the `start` format of createFlipTiles
  minMoves: number; // the third star: the fewest moves, flips and forces
  minFlips: number; // the second star: the fewest flips, with flips only
  solutionFlips: number[]; // a flips-only solution with minFlips flips (tiles 5r + c): its hints
  solutionMoves: { flips: number[]; forces: number[] }; // a solution in minMoves moves, with the
  //                       fewest forces of all such solutions: its hints
  maxForces: number; // the forces the player has on this level: as many as solutionMoves uses
  difficulty: number; // its tier: equal to minFlips (the flips-only star is the hard one)
  number: number; // its place in the tier, from 1
  grade: number; // its group in the tier, from 0: the levels with the same minMoves
  key: string; // the board's standard form: the same for all its rotations, mirror images and
  //              color swaps (stars and hints are saved by it, see progress.ts)
  expertFlips: boolean; // its flips-only star is far harder than its stage: its solution has
  //                       more flips than the stage's difficulty (Alpha 2 and 3: 8 and 11 flips).
  //                       The level screen marks that goal "Expert".
}

// The standard form of a board: of the board, its rotations and mirror images, and their color
// swaps (16 boards that are the same puzzle), the one with the lowest number, written as a board.
// The curation script shows each level turned or mirrored at random and maybe with swapped
// colors; what is saved for a level is kept by this form, so it stays with its level whatever
// way the level is shown (and earlier versions saved by exactly this form).
const SYMMETRIES = [
  (r: number, c: number) => [r, c], (r: number, c: number) => [c, 4 - r],
  (r: number, c: number) => [4 - r, 4 - c], (r: number, c: number) => [4 - c, r],
  (r: number, c: number) => [r, 4 - c], (r: number, c: number) => [4 - r, c],
  (r: number, c: number) => [c, r], (r: number, c: number) => [4 - c, 4 - r],
].map((f) => Array.from({ length: 25 }, (_, k) => {
  const [r, c] = f(Math.floor(k / 5), k % 5);
  return r * 5 + c;
}));
const ALL = 2 ** 25 - 1;

function standardForm(board: string): string {
  const bits = board.replace(/\s/g, "");
  let best = ALL;
  for (const perm of SYMMETRIES) {
    let t = 0;
    for (let k = 0; k < 25; k++) if (bits[k] === "1") t |= 1 << perm[k];
    best = Math.min(best, t, ALL ^ t);
  }
  return Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => (best >>> (r * 5 + c)) & 1).join("")).join(" ");
}

export interface Tier {
  difficulty: number;
  name: string; // what the player sees: "Alpha", "Beta", ...
  stage: string; // the stage's own name: "Alpha", "Beta", ...
  symbol: string; // its Greek letter, lower case: "α", "β", ...
  levels: Level[];
  grades: Level[][]; // the levels in groups, easiest first (the levels are sorted by minMoves)
}

// The tiers are called stages, after the Greek letters, easiest first: their names and letters
const STAGES = [
  ["Alpha", "α"], ["Beta", "β"], ["Gamma", "γ"], ["Delta", "δ"], ["Epsilon", "ε"], ["Zeta", "ζ"],
  ["Eta", "η"], ["Theta", "θ"], ["Iota", "ι"], ["Kappa", "κ"], ["Lambda", "λ"], ["Mu", "μ"], ["Nu", "ν"],
];

export const TIERS: Tier[] = data.tiers.map((tier, t) => {
  const grades: Level[][] = [];
  const levels = tier.levels.map((level, i): Level => {
    if (i === 0 || level.minMoves !== tier.levels[i - 1].minMoves) grades.push([]);
    const full = {
      ...level, difficulty: tier.difficulty, number: i + 1, grade: grades.length - 1, key: standardForm(level.board),
      expertFlips: level.minFlips > tier.difficulty,
      maxForces: level.solutionMoves.forces.length,
    };
    grades[grades.length - 1].push(full);
    return full;
  });
  const [stage, symbol] = STAGES[t] ?? [String(t + 1), ""];
  return { difficulty: tier.difficulty, name: stage, stage, symbol, levels, grades };
});

// A level's name: its stage and its number, e.g. "Alpha 7"
export const levelName = (level: Level) => `${findTier(level.difficulty)!.stage} ${level.number}`;

export const findTier = (difficulty: number) => TIERS.find((t) => t.difficulty === difficulty);

export const findLevel = (difficulty: number, number: number) =>
  findTier(difficulty)?.levels[number - 1];

// The level after this one in its tier (undefined after the last)
export const nextLevel = (level: Level) => findTier(level.difficulty)?.levels[level.number];

export const totalLevels = TIERS.reduce((n, t) => n + t.levels.length, 0);
