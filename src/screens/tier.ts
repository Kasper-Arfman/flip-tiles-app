// A tier's screen: a grid of its levels, each with a picture of its board and its stars. The
// levels are graded within the tier by minMoves (the length of the fewest-moves solution); a quiet
// line divides the groups, without saying what they are. A group opens when enough stars are
// earned in the group before it (see progress.ts); until then its levels are locked, and its
// line says how many stars are still needed. The locked group next in line can also be bought
// with coins.
import type { Tier } from "../levels/levels";
import {
  ALL_STARS, GRADE_UNLOCK_COST, buyGrade, canBuyGrade, coins, starsOf, starsToUnlockGrade, tierStars,
} from "../progress";
import { LOCK, coin, miniBoard, plural, screen, stageTitle, star, starRow, topbar } from "./ui";

export function tierScreen(tier: Tier, rerender: () => void) {
  const levels = tier.levels.map((level, i) => {
    const bits = starsOf(level);
    const missing = starsToUnlockGrade(tier, level.grade);
    const buy = canBuyGrade(tier, level.grade)
      ? `<button type="button" class="unlock-button" data-grade="${level.grade}"
           ${coins() < GRADE_UNLOCK_COST ? "disabled" : ""}>Unlock for ${coin()} ${GRADE_UNLOCK_COST}</button>`
      : "";
    // The line above each group but the first; for a locked group, with what opens it
    const divider = i > 0 && level.grade !== tier.levels[i - 1].grade
      ? missing
        ? `<li class="grade-divider locked"><span>${LOCK} Earn ${plural(missing, "more star")} above to open</span></li>` +
          (buy ? `<li class="grade-buy">${buy}</li>` : "")
        : `<li class="grade-divider" aria-hidden="true"></li>`
      : "";
    if (missing) {
      return `${divider}<li><div class="level-tile locked" aria-label="Level ${level.number}, locked">
        ${miniBoard(level.board)}
        <span class="level-number">${level.number}</span>
        ${starRow(0, "small")}
      </div></li>`;
    }
    // All three stars: a gold border (no border before that: the stars show how far it is)
    const finish = bits === ALL_STARS ? " perfect" : "";
    return `${divider}<li><a class="level-tile${finish}" href="#/level/${tier.difficulty}/${level.number}"
        aria-label="Level ${level.number}">
      ${miniBoard(level.board)}
      <span class="level-number">${level.number}</span>
      ${starRow(bits, "small")}
    </a></li>`;
  }).join("");

  const element = screen("tier-screen", `
    ${topbar(stageTitle(tier), "#/", `${star(true)} ${tierStars(tier)}/${3 * tier.levels.length}`)}
    <ol class="level-grid">${levels}</ol>`);

  element.querySelector<HTMLButtonElement>(".unlock-button")?.addEventListener("click", (e) => {
    const grade = Number((e.currentTarget as HTMLElement).dataset.grade);
    if (!confirm(`Unlock these levels for ${GRADE_UNLOCK_COST} coins?`)) return;
    if (buyGrade(tier, grade)) rerender();
  });
  return element;
}
