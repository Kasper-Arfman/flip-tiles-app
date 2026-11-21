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
import { go } from "../nav";
import { confirmFlips, warnsAboutFlips } from "./flipsWarning";
import { LOCK, coin, miniBoard, plural, screen, stageTitle, star, starRow, topbar } from "./ui";

// A group to show when the tier screen opens next (ranked's popup of what to complete: "Epsilon,
// 5 moves" scrolls to that group)
let scrollTo: number | null = null;
export const showGrade = (minMoves: number) => {
  scrollTo = minMoves;
};

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
    // At the start of each group: its number of moves, written upwards along its left side
    // (a narrow first column, as tall as the group's rows of 4)
    const firstOfGrade = i === 0 || level.grade !== tier.levels[i - 1].grade;
    const rows = Math.ceil(tier.grades[level.grade].length / 4);
    const label = firstOfGrade
      ? `<li class="grade-label" data-moves="${level.minMoves}" style="grid-row: span ${rows}"><span>${plural(level.minMoves, "move")}</span></li>`
      : "";
    const item = `<li data-moves="${level.minMoves}">`;
    if (missing) {
      return `${divider}${label}${item}<div class="level-tile locked" aria-label="Level ${level.number}, locked">
        ${miniBoard(level.board)}
        <span class="level-number">${level.number}</span>
        ${starRow(0, "small")}
      </div></li>`;
    }
    // All three stars: a gold border (no border before that: the stars show how far it is)
    const finish = bits === ALL_STARS ? " perfect" : "";
    const warn = warnsAboutFlips(level) ? ` data-warn="${level.number}"` : "";
    return `${divider}${label}${item}<a class="level-tile${finish}"${warn} href="#/level/${tier.difficulty}/${level.number}"
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
  // A level whose flips-only solution is very hard (flipsWarning.ts): asks before opening it
  for (const link of element.querySelectorAll<HTMLAnchorElement>("[data-warn]")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      confirmFlips(() => go(link.getAttribute("href")!));
    });
  }

  // The group asked for (showGrade): scrolled to, just under the top bar, and its levels flash
  if (scrollTo !== null) {
    const moves = scrollTo;
    scrollTo = null;
    const target = element.querySelector(`.grade-label[data-moves="${moves}"]`);
    // (once the screen is on the page: main.ts scrolls a new screen to the top first)
    if (target) {
      requestAnimationFrame(() => {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
        for (const tile of element.querySelectorAll(`li[data-moves="${moves}"] .level-tile`)) {
          tile.classList.add("flash");
          tile.addEventListener("animationend", () => tile.classList.remove("flash"), { once: true });
        }
      });
    }
  }
  return element;
}
