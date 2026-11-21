// A warning before a level whose flips-only solution is far harder than the rest of its stage
// (Alpha's levels of 8 and 11 flips, solved in a single force): a new player who has the
// fewest-moves star there is tempted to try for the flips-only star too, much too early.
//
// It shows when a player opens such a level from its stage screen, or presses Retry on it,
// while they have its fewest-moves star and not yet its flips-only star.
import type { Level } from "../levels/levels";
import { go } from "../nav";
import { STAR_FLIPS, STAR_MOVES, starsOf } from "../progress";
import { popup } from "./codex";

// A level of a stage has as many flips as the stage's number; more is the exception
export function warnsAboutFlips(level: Level): boolean {
  const stars = starsOf(level);
  return level.minFlips > level.difficulty && (stars & STAR_MOVES) !== 0 && (stars & STAR_FLIPS) === 0;
}

// The popup: Yes plays (calls play), Practice first goes back to the home screen
export function confirmFlips(play: () => void) {
  const dialog = popup("flips-warning", `<h2>Flips only?</h2>`, `
    <p class="hint-dialog-text">The flips-only solution is very hard, are you sure you are ready?</p>
    <div class="flips-warning-buttons">
      <button type="button" class="practice">Practice first</button>
      <button type="button" class="primary play-anyway">Yes, play</button>
    </div>`);
  dialog.querySelector(".play-anyway")!.addEventListener("click", () => {
    dialog.close();
    play();
  });
  dialog.querySelector(".practice")!.addEventListener("click", () => {
    dialog.close();
    go("#/");
  });
}
