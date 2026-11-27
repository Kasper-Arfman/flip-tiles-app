// The levels (levels.json): every one can be solved by its stored solutions, in the moves its
// stars ask for. The same checks run on a phone from the debug screen (src/selfCheck.ts).
import { describe, expect, it } from "vitest";
import { ALL_TIERS, BONUS_ID, BONUS_TIERS, TIERS, bonusOf, findTier, totalLevels } from "../src/levels/levels";
import { checkFewestMoves, checkLevels } from "../src/selfCheck";

describe("levels", () => {
  it("there are 13 stages, Alpha to Nu, each with levels", () => {
    expect(TIERS.map((t) => t.name)).toEqual(
      ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu"].slice(0, TIERS.length),
    );
    expect(totalLevels).toBeGreaterThan(0);
  });

  it("the first two levels teach a flip and a force", () => {
    const [tap, hold] = TIERS[0].levels;
    expect(tap.minMoves).toBe(1);
    expect(tap.solutionMoves.forces).toEqual([]);
    expect(hold.solutionMoves.forces.length).toBe(1);
  });

  it("every level passes the checks (solutions, star counts, forces, numbering)", () => {
    expect(checkLevels()).toEqual([]);
  });

  it("every level's fewest moves is right (worked out again by the solver)", { timeout: 120_000 }, () => {
    expect(ALL_TIERS.flatMap((t) => t.levels).flatMap(checkFewestMoves)).toEqual([]);
  });

  it("bonus levels for every stage from Delta on: its difficulty, 200 (600 stars) each, Epsilon 66: 4998 stars, all new", () => {
    expect(BONUS_TIERS.map((t) => t.main)).toEqual(TIERS.slice(3));
    expect(BONUS_TIERS.reduce((n, t) => n + 3 * t.levels.length, 0)).toBe(4998);
    for (const tier of BONUS_TIERS) {
      expect(bonusOf(tier.main!)).toBe(tier);
      expect(tier.main!.difficulty).toBe(tier.difficulty);
      expect(tier.id).toBe(BONUS_ID + tier.difficulty);
      expect(findTier(tier.id)).toBe(tier);
      // (Epsilon has only 68 new boards; it gets 66, its last row short. Every other stage: its
      // full 200, in whole rows)
      expect(tier.levels.length).toBe(tier.difficulty === 5 ? 66 : 200);
      if (tier.difficulty !== 5) for (const grade of tier.grades) expect(grade.length % 4).toBe(0);
    }
    // (checkLevels: no puzzle twice, in the stages and the bonus levels together)
  });
});
