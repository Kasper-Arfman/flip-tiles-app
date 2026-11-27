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
  difficulty: number; // its tier's difficulty: equal to minFlips (the flips-only star is the hard one)
  tier: number; // its tier's id (see Tier.id): in the addresses, #/level/<tier>/<number>
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
  // Its id, in the addresses (#/tier/<id>) and in what is saved about it (bought, its groups
  // bought): a stage's difficulty; a bonus stage's is BONUS_ID + its difficulty
  id: number;
  difficulty: number;
  name: string; // what the player sees: "Alpha", "Beta", ..., "Bonus Epsilon"
  stage: string; // the stage's own name: "Alpha", "Beta", ... (a bonus stage: its stage's)
  symbol: string; // its Greek letter, lower case: "α", "β", ...
  levels: Level[];
  grades: Level[][]; // the levels in groups, easiest first (the levels are sorted by minMoves)
  // A bonus stage: the stage of the same difficulty, which opens it when complete
  main?: Tier;
}

export const BONUS_ID = 100;

// The tiers are called stages, after the Greek letters, easiest first: their names and letters
const STAGES = [
  ["Alpha", "α"], ["Beta", "β"], ["Gamma", "γ"], ["Delta", "δ"], ["Epsilon", "ε"], ["Zeta", "ζ"],
  ["Eta", "η"], ["Theta", "θ"], ["Iota", "ι"], ["Kappa", "κ"], ["Lambda", "λ"], ["Mu", "μ"], ["Nu", "ν"],
];

type TierData = (typeof data.tiers)[number];

function makeTier(tier: TierData, id: number, name: string, stage: string, symbol: string, main?: Tier): Tier {
  const grades: Level[][] = [];
  const levels = tier.levels.map((level, i): Level => {
    if (i === 0 || level.minMoves !== tier.levels[i - 1].minMoves) grades.push([]);
    const full = {
      ...level, difficulty: tier.difficulty, tier: id, number: i + 1, grade: grades.length - 1, key: standardForm(level.board),
      expertFlips: level.minFlips > tier.difficulty,
      maxForces: level.solutionMoves.forces.length,
    };
    grades[grades.length - 1].push(full);
    return full;
  });
  return { id, difficulty: tier.difficulty, name, stage, symbol, levels, grades, main };
}

// The stages
export const TIERS: Tier[] = data.tiers.map((tier, t) => {
  const [stage, symbol] = STAGES[t] ?? [String(t + 1), ""];
  return makeTier(tier, tier.difficulty, stage, stage, symbol);
});

// The bonus levels of each stage from Gamma on: levels of the same difficulty that aren't in the
// game otherwise, up to 40 per group (see scripts/curate-levels.mjs). They are a tier of their
// own (`main`: their stage), shown inside their stage once it is complete (every star), with a tab
// per group; all their groups are open at once. Their stars count in the total, but not towards
// opening the stages, the Codex or ranked mode.
export const BONUS_TIERS: Tier[] = (data.bonus as TierData[]).map((tier) => {
  const main = TIERS.find((t) => t.difficulty === tier.difficulty)!;
  return makeTier(tier, BONUS_ID + tier.difficulty, `Bonus ${main.stage}`, main.stage, main.symbol, main);
});

// A stage's bonus levels (none for Alpha and Beta)
export const bonusOf = (tier: Tier) => BONUS_TIERS.find((b) => b.main === tier);

// Every tier, the stages first
export const ALL_TIERS = [...TIERS, ...BONUS_TIERS];

// A level's name: its stage and its number, e.g. "Alpha 7", "Bonus Epsilon 12"
export const levelName = (level: Level) => `${findTier(level.tier)!.name} ${level.number}`;

// A tier by its id (Tier.id)
export const findTier = (id: number) => ALL_TIERS.find((t) => t.id === id);

export const findLevel = (tier: number, number: number) =>
  findTier(tier)?.levels[number - 1];

// The level after this one in its tier (undefined after the last)
export const nextLevel = (level: Level) => findTier(level.tier)?.levels[level.number];

export const totalLevels = ALL_TIERS.reduce((n, t) => n + t.levels.length, 0);
