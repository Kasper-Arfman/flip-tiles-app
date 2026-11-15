// The levels (levels.json): every one can be solved by its stored solutions, in the moves its
// stars ask for. The same checks run on a phone from the debug screen (src/selfCheck.ts).
import { describe, expect, it } from "vitest";
import { TIERS, totalLevels } from "../src/levels/levels";
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
    expect(TIERS.flatMap((t) => t.levels).flatMap(checkFewestMoves)).toEqual([]);
  });
});
