// The Codex: every completed stage earns an entry. The player makes a pattern on a solved board with
// at most as many forces as the stage's place in the game (Alpha 1, Beta 2, Gamma 3, ...), presses
// Discover, and from then on can see the flips-only solution of that pattern, here and in a popup
// while solving a level. Only a stage completed earns one; coins only clear them again.
//
// Flips alone can solve only one board in four, so the editor grays out every tile that can't
// lead to a pattern flips can solve, again after each force.
import { solveFlips, solveMoves, tilesToForce } from "../game/flipTiles";
import { TIERS, type Tier } from "../levels/levels";
import {
  ENTRY_RESET_COST, coins, discover, entryForces, entryOf, hasEntrySlot,
  entryResetAllCost, resetAllEntries, resetEntry,
} from "../progress";
import { LOCK, coin, plural, screen, stageTitle, topbar } from "./ui";

const TILES = Array.from({ length: 25 }, (_, k) => k);

// A pattern, with a gold diamond on every tile of its flips-only solution
function patternBoard(board: number) {
  const solution = solveFlips(board) ?? [];
  return `<div class="entry-board" role="img"
      aria-label="A pattern, solved by flipping ${plural(solution.length, "tile")}, marked with diamonds">
    ${TILES.map((k) => `<span class="${(board >>> k) & 1 ? "one" : "zero"}">${
      solution.includes(k) ? `<i class="entry-mark"></i>` : ""}</span>`).join("")}
  </div>`;
}

const flipCount = (board: number) => plural(solveFlips(board)?.length ?? 0, "flip");

// How a pattern is solved in the popup on a level. (Worked out once per pattern: the fewest moves
// take a moment to search.)
type View = "flips" | "moves";
const VIEWS: { id: View; label: string }[] = [{ id: "flips", label: "Flips only" }, { id: "moves", label: "Min moves" }];
let view: View = "flips"; // (kept while the game runs)

const moveSolutions = new Map<number, ReturnType<typeof solveMoves>>();
function solutionOf(board: number, kind: View) {
  if (kind === "flips") return { flips: solveFlips(board) ?? [], forces: [] as number[] };
  if (!moveSolutions.has(board)) moveSolutions.set(board, solveMoves(board));
  return moveSolutions.get(board)!;
}

// A pattern with only its solution on it: gold diamonds to flip, red ones to force
function solutionBoard(board: number, kind: View) {
  const { flips, forces } = solutionOf(board, kind);
  return `<div class="entry-board" role="img"
      aria-label="${plural(flips.length, "flip")} and ${plural(forces.length, "force")}">
    ${TILES.map((k) => {
      const both = flips.includes(k) && forces.includes(k) ? " both" : "";
      return `<span class="${(board >>> k) & 1 ? "one" : "zero"}">${
        flips.includes(k) ? `<i class="entry-mark${both}"></i>` : ""}${
        forces.includes(k) ? `<i class="entry-mark force${both}"></i>` : ""}</span>`;
    }).join("")}
  </div>`;
}

// An entry not made yet: a mystery, like a skin not found yet (a dashed line, a faded
// checkerboard and a question mark)
const EMPTY_BOARD = `<div class="entry-board empty" role="img" aria-label="Not discovered yet">
  ${TILES.map((k) => `<span class="${k % 2 ? "one" : "zero"}"></span>`).join("")}
  <b class="entry-question" aria-hidden="true">?</b></div>`;

// A popup with the shared parts: a heading, ×, closes by a tap next to it or on leaving the screen
function popup(className: string, heading: string, body: string) {
  const dialog = document.createElement("dialog");
  dialog.className = `app-dialog ${className}`;
  dialog.innerHTML = `<div class="dialog-box">
    <header class="dialog-head">
      ${heading}
      <button type="button" class="close" aria-label="Close">×</button>
    </header>
    ${body}
  </div>`;
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.querySelector(".close")!.addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  window.addEventListener("hashchange", close, { once: true });
  dialog.addEventListener("close", () => {
    window.removeEventListener("hashchange", close);
    dialog.remove();
  });
  dialog.showModal();
  return dialog;
}

// The popup on a level: all the entries in a grid, with only their solutions (an entry not
// made yet is a gray board), and a switch between the flips-only and the fewest-moves solutions
export function openCodex() {
  const dialog = popup("codex-dialog", `<div class="solution-switch" role="radiogroup" aria-label="Solution">
      ${VIEWS.map(({ id, label }) => `<button type="button" role="radio" data-view="${id}">${label}</button>`).join("")}
    </div>`, `<div class="entry-all"></div>`);
  const grid = dialog.querySelector<HTMLElement>(".entry-all")!;
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>(".solution-switch button")];
  // A tap on a "?": what it takes to get that entry
  grid.addEventListener("click", (e) => {
    const unknown = (e.target as Element).closest<HTMLElement>(".entry-unknown");
    if (!unknown) return;
    const tier = TIERS.find((t) => t.difficulty === Number(unknown.dataset.difficulty))!;
    popup("entry-locked-dialog", `<h2>${stageTitle(tier)}</h2>`, `<p class="hint-dialog-text">${hasEntrySlot(tier)
      ? "You earned this entry. Make it in the Codex, from the home screen."
      : `Complete stage ${tier.name} to unlock this entry.`}</p>`);
  });
  const draw = () => {
    buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.view === view)));
    grid.innerHTML = TIERS.map((tier) => {
      const board = entryOf(tier);
      return board === undefined
        ? `<button type="button" class="entry-unknown" data-difficulty="${tier.difficulty}">${EMPTY_BOARD}</button>`
        : solutionBoard(board, view);
    }).join("");
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      view = button.dataset.view as View;
      draw();
    });
  }
  draw();
}

// Make the pattern of a stage's entry: on top one red diamond per force to place, filled as
// they are placed; tap a tile of the solved board to force it (tap it again, or press <, to take
// it back). Tiles that can't lead to a pattern flips can solve are gray. The player can lower the
// number of forces with - and +, which changes which tiles are gray.
function openEditor(tier: Tier, done: () => void) {
  const most = entryForces(tier);
  let forces = most;
  const dialog = popup("entry-editor", `<div class="force-slots" role="img"></div>`, `
    <div class="entry-grid">
      ${TILES.map((k) => `<button type="button" class="entry-tile" data-tile="${k}"
        aria-label="Tile ${k + 1}"><i class="force-gem" hidden></i></button>`).join("")}
    </div>
    <div class="entry-controls">
      <button type="button" class="editor-previous" aria-label="Previous">&lt;</button>
      <button type="button" class="editor-reset">Reset</button>
      <div class="force-stepper"${most > 1 ? "" : " hidden"}>
        <button type="button" class="fewer-forces" aria-label="Fewer forces">−</button>
        <button type="button" class="more-forces" aria-label="More forces">+</button>
      </div>
    </div>
    <button type="button" class="primary discover">Discover</button>`);

  const placed: number[] = []; // the tiles forced, in order
  const board = () => placed.reduce((b, k) => b | (1 << k), 0);
  const tiles = [...dialog.querySelectorAll<HTMLButtonElement>(".entry-tile")];
  const slotRow = dialog.querySelector<HTMLElement>(".force-slots")!;
  const previous = dialog.querySelector<HTMLButtonElement>(".editor-previous")!;
  const reset = dialog.querySelector<HTMLButtonElement>(".editor-reset")!;
  const discoverButton = dialog.querySelector<HTMLButtonElement>(".discover")!;
  const fewer = dialog.querySelector<HTMLButtonElement>(".fewer-forces")!;
  const more = dialog.querySelector<HTMLButtonElement>(".more-forces")!;

  const draw = () => {
    const open = tilesToForce(board(), forces);
    tiles.forEach((tile, k) => {
      const forced = placed.includes(k);
      tile.classList.toggle("one", forced);
      tile.disabled = !forced && !((open >>> k) & 1);
      tile.setAttribute("aria-pressed", String(forced));
      tile.querySelector<HTMLElement>(".force-gem")!.hidden = !forced;
    });
    slotRow.innerHTML = Array.from({ length: forces }, (_, i) => `<i class="force-slot${i < placed.length ? " filled" : ""}"></i>`).join("");
    fewer.disabled = forces === 1;
    more.disabled = forces === most;
    slotRow.setAttribute("aria-label", `${placed.length} of ${plural(forces, "force")} placed`);
    previous.disabled = reset.disabled = placed.length === 0;
    discoverButton.disabled = placed.length !== forces;
    discoverButton.textContent = `Discover (${forces === most ? most : `${forces}/${most}`})`;
  };

  tiles.forEach((tile, k) => tile.addEventListener("click", () => {
    const at = placed.indexOf(k);
    if (at >= 0) placed.splice(at, 1);
    else placed.push(k);
    draw();
  }));
  // A new number of forces: the forces placed stay, except the latest ones that no longer fit
  const fits = () => (placed.length === forces
    ? solveFlips(board()) !== null
    : placed.length < forces && tilesToForce(board(), forces) !== 0);
  const setForces = (n: number) => {
    forces = n;
    while (placed.length && !fits()) placed.pop();
    draw();
  };
  fewer.addEventListener("click", () => setForces(forces - 1));
  more.addEventListener("click", () => setForces(forces + 1));
  previous.addEventListener("click", () => {
    placed.pop();
    draw();
  });
  reset.addEventListener("click", () => {
    placed.length = 0;
    draw();
  });
  discoverButton.addEventListener("click", () => {
    if (!discover(tier, board())) return;
    dialog.close();
    done();
  });
  draw();
}

export function codexScreen(rerender: () => void) {
  const row = (tier: Tier) => {
    const board = entryOf(tier);
    const head = `<h2>${stageTitle(tier)}</h2>`;
    if (board !== undefined) {
      return `<li class="entry-card">
        ${patternBoard(board)}
        <div>${head}
          <p>Solved with ${flipCount(board)}</p>
          <button type="button" class="reset-entry" data-difficulty="${tier.difficulty}"
            ${coins() < ENTRY_RESET_COST ? "disabled" : ""}>Reset · ${coin()} ${ENTRY_RESET_COST}</button>
        </div>
      </li>`;
    }
    if (hasEntrySlot(tier)) {
      return `<li class="entry-card ready"><div>${head}
        <button type="button" class="primary new-entry" data-difficulty="${tier.difficulty}">Discover</button>
      </div></li>`;
    }
    return `<li class="entry-card locked">${EMPTY_BOARD}<div>${head}<p>${LOCK} Complete ${tier.name} to earn this</p></div></li>`;
  };

  const resetAll = entryResetAllCost();
  const element = screen("codex-screen", `
    ${topbar("Codex", "#/", `${coin()} ${coins()}`)}
    ${resetAll ? `<button type="button" class="reset-all-entries" ${coins() < resetAll ? "disabled" : ""}>
      Reset all · ${coin()} ${resetAll}</button>` : ""}
    <p class="codex-intro">Draw a pattern to permanently reveal its solution.
    The codex becomes a useful guide as puzzles get harder, so choose wisely!</p>
    <ul class="entry-cards">${TIERS.map(row).join("")}</ul>`);

  const tierOf = (button: HTMLElement) => TIERS.find((t) => t.difficulty === Number(button.dataset.difficulty))!;
  element.addEventListener("click", (e) => {
    const target = e.target as Element;
    const create = target.closest<HTMLElement>(".new-entry");
    if (create) {
      openEditor(tierOf(create), rerender);
      return;
    }
    const reset = target.closest<HTMLElement>(".reset-entry");
    if (reset) {
      const tier = tierOf(reset);
      if (confirm(`Reset the ${tier.name} entry for ${ENTRY_RESET_COST} coins? You can then make a new one.`)
        && resetEntry(tier)) rerender();
      return;
    }
    if (target.closest(".reset-all-entries")) {
      if (confirm(`Reset all your entries for ${resetAll} coins? You can then make new ones.`)
        && resetAllEntries()) rerender();
    }
  });
  return element;
}
