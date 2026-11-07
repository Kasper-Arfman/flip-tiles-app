// The rules, with two tiny boards to try the two moves on. A new player comes here before their
// first level (see main.ts); "Start playing" at the bottom marks the rules as seen.
import { createFlipTiles } from "../game/createFlipTiles";
import { TIERS } from "../levels/levels";
import { hasSeenRules, markRulesSeen } from "../progress";
import { screen, star, topbar } from "./ui";

export function howToPlayScreen() {
  const element = screen("how-to-play-screen", `
    ${topbar("How to play", "#/")}
    ${hasSeenRules() ? "" : `<p class="first-rules">First, a quick look at how to play. Tap
      <strong>Start playing</strong> at the bottom when you're ready.</p>`}
    <div class="rules">
      <p>Turn every tile the same color: all green, or all gold.</p>

      <h2>Flip</h2>
      <p><strong>Tap</strong> a tile to flip it: the tile and its four neighbours change color.
        Try it: flip the middle tile.</p>
      <div class="demo" data-demo="flip"></div>

      <h2>Force</h2>
      <p><strong>Tap and hold</strong> a tile to force it (on a computer: right-click): only that
        tile changes color. Try it on the middle tile.</p>
      <div class="demo" data-demo="force"></div>

      <h2>Good to know</h2>
      <ul>
        <li>The order of the moves doesn't matter.</li>
        <li>Making the same move twice cancels it out: it doesn't count.</li>
        <li>Use <strong>&lt;</strong> and <strong>&gt;</strong> to step through your moves, and Reset to start over.</li>
      </ul>

      <h2>Stars</h2>
      <ol class="star-rules">
        <li>${star(true)}<span><strong>Solve it</strong>, in any number of moves.</span></li>
        <li>${star(true)}<span><strong>Only flips</strong>, in the fewest flips possible.</span></li>
        <li>${star(true)}<span><strong>Fewest moves</strong>: flips and forces, in the fewest moves possible.</span></li>
      </ol>
      <p>The levels come in stages, Alpha, Beta, Gamma and on, each harder than the one before: the
        number of stars next to a stage is the number of moves of its levels' best solutions. Earn
        stars to open the next group of levels, and the next stage.</p>
      <h2>Coins and hints</h2>
      <p>Stuck? Tap the goal <strong>Only flips</strong> or <strong>In … moves</strong> above the
        board, and buy a hint for one coin: it marks one move of a solution for that goal (a blue
        plus: flip that tile; a red dot: force it). Coins can also unlock levels and stages early.</p>
      <p>Earned the <strong>Only flips</strong> or <strong>Fewest moves</strong> star? <strong>▶ Replay</strong>
        lets you step through your solution again.</p>
      <a class="button primary start-playing" href="#/tier/${TIERS[0].difficulty}">Start playing</a>
    </div>`);

  const demos = {
    flip: "00000 00100 01110 00100 00000",
    force: "11111 11111 11011 11111 11111",
  };
  for (const slot of element.querySelectorAll<HTMLElement>(".demo")) {
    slot.append(createFlipTiles({ solver: false, newGame: false, maxMoves: 3, start: demos[slot.dataset.demo as keyof typeof demos] }));
  }
  // (before the link goes to the first stage, so that screen is let through)
  element.querySelector(".start-playing")!.addEventListener("click", markRulesSeen);
  return element;
}
