// Commands for the browser's console, to test the game quickly: open stages and bonus levels,
// earn stars, change the coins. Only while developing (npm run dev / npm run serve) and in test
// builds (TEST_BUILD in dev.ts): main.ts leaves this file out of a release build.
//
// In the console (F12, Console tab), type for example:
//   ft.help()               this list
//   ft.unlockAll()          every stage and every group open (no stars given)
//   ft.complete("epsilon")  every star of a stage (by name or difficulty; none: every stage)
//   ft.unlockBonus()        every stage complete and every stage's bonus levels bought
//   ft.completeBonus(5)     every bonus star of a stage (bought too; none: every stage's)
//   ft.coins(500)           +500 coins (ft.coins(-100): 100 fewer)
//   ft.setCoins(0)          exactly this many coins
//   ft.clear("epsilon")     a stage's stars gone (its bonus levels' too); none: every star
//   ft.status()             what is saved now
// The screen is drawn again after each command, so the change shows at once.
import { ALL_TIERS, BONUS_TIERS, TIERS, bonusOf, type Tier } from "./levels/levels";
import { ALL_STARS, coins, devOpen, devSetCoins, devSetStars, saveSummary } from "./progress";

export function installDevConsole(render: () => void) {
  // A stage by name ("epsilon", "Eta") or difficulty (5); none: every stage
  const stages = (which?: string | number): Tier[] => {
    if (which === undefined) return TIERS;
    const key = String(which).toLowerCase();
    const found = TIERS.find((t) => t.name.toLowerCase() === key || String(t.difficulty) === key);
    if (!found) throw new Error(`No stage "${which}". Stages: ${TIERS.map((t) => `${t.name} (${t.difficulty})`).join(", ")}`);
    return [found];
  };
  const bonusesOf = (list: Tier[]) => list.map(bonusOf).filter((t): t is Tier => t !== undefined);
  const done = (message: string) => {
    render();
    return message;
  };

  const ft = {
    help() {
      console.log([
        "Flip Tiles console commands (developing and test builds only):",
        "  ft.unlockAll()          every stage and every group open (no stars given)",
        "  ft.complete(stage?)     every star of a stage (\"epsilon\" or 5); none: every stage",
        "  ft.unlockBonus(stage?)  the stage complete and its bonus levels bought; none: every stage",
        "  ft.completeBonus(stage?) every bonus star of a stage (bought too); none: every stage's",
        "  ft.completeAll()        every star of every stage",
        "  ft.completeBonusAll()   every bonus star of every stage (bought too)",
        "  ft.coins(n)             n more coins (negative: fewer)",
        "  ft.setCoins(n)          exactly n coins",
        "  ft.clear(stage?)        a stage's stars gone, its bonus levels' too; none: every star",
        "  ft.status()             what is saved now",
        "(Completed stages pay their coin reward on the home screen, as in the game.)",
      ].join("\n"));
    },
    unlockAll() {
      devOpen(TIERS);
      return done("Every stage and every group is open.");
    },
    complete(stage?: string | number) {
      devSetStars(stages(stage), ALL_STARS);
      return done(`Complete: ${stages(stage).map((t) => t.name).join(", ")}.`);
    },
    unlockBonus(stage?: string | number) {
      const list = stages(stage);
      devSetStars(list, ALL_STARS); // (bonus levels open only once their stage is complete)
      devOpen(bonusesOf(list));
      return done(`Bonus levels open: ${list.filter(bonusOf).map((t) => t.name).join(", ") || "none (this stage has none)"}.`);
    },
    completeBonus(stage?: string | number) {
      const list = stages(stage);
      devSetStars([...list, ...bonusesOf(list)], ALL_STARS);
      devOpen(bonusesOf(list));
      return done(`Every bonus star: ${list.filter(bonusOf).map((t) => t.name).join(", ") || "none (this stage has none)"}.`);
    },
    completeAll() {
      return ft.complete();
    },
    completeBonusAll() {
      return ft.completeBonus();
    },
    coins(amount: number) {
      devSetCoins(coins() + amount);
      return done(`Coins: ${coins()}.`);
    },
    setCoins(amount: number) {
      devSetCoins(amount);
      return done(`Coins: ${coins()}.`);
    },
    clear(stage?: string | number) {
      const list = stage === undefined ? ALL_TIERS : [...stages(stage), ...bonusesOf(stages(stage))];
      devSetStars(list, 0);
      return done(stage === undefined ? "Every star gone." : `Stars gone: ${stages(stage)[0].name} (and its bonus levels).`);
    },
    status() {
      const summary = saveSummary();
      console.table(summary);
      return `${BONUS_TIERS.length} stages have bonus levels.`;
    },
  };
  (window as unknown as { ft: typeof ft }).ft = ft;
  console.log("Flip Tiles: console commands ready. Type ft.help()");
}
