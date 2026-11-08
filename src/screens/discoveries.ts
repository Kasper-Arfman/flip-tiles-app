// Discoveries: every completed stage earns one. The player makes a pattern on a solved board with
// as many forces as the stage's place in the game (Alpha 1, Beta 2, Gamma 3, ...), presses
// Discover, and from then on can see the flips-only solution of that pattern, here and in a popup
// while solving a level. Only a stage completed earns one; coins only clear them again.
//
// Flips alone can solve only one board in four, so the editor grays out every tile that can't
// lead to a pattern flips can solve, again after each force.
import { solveFlips, solveMoves, tilesToForce } from "../game/flipTiles";
import { TIERS, type Tier } from "../levels/levels";
import {
  DISCOVERY_RESET_COST, coins, discover, discoveryForces, discoveryOf, hasDiscoverySlot,
  discoveryResetAllCost, resetAllDiscoveries, resetDiscovery,
} from "../progress";
import { LOCK, coin, plural, screen, stageTitle, topbar } from "./ui";

const TILES = Array.from({ length: 25 }, (_, k) => k);

// A pattern, with a gold diamond on every tile of its flips-only solution
function patternBoard(board: number) {
  const solution = solveFlips(board) ?? [];
  return `<div class="discovery-board" role="img"
      aria-label="A pattern, solved by flipping ${plural(solution.length, "tile")}, marked with diamonds">
    ${TILES.map((k) => `<span class="${(board >>> k) & 1 ? "one" : "zero"}">${
      solution.includes(k) ? `<i class="discovery-mark"></i>` : ""}</span>`).join("")}
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
  return `<div class="discovery-board" role="img"
      aria-label="${plural(flips.length, "flip")} and ${plural(forces.length, "force")}">
    ${TILES.map((k) => {
      const both = flips.includes(k) && forces.includes(k) ? " both" : "";
      return `<span class="${(board >>> k) & 1 ? "one" : "zero"}">${
        flips.includes(k) ? `<i class="discovery-mark${both}"></i>` : ""}${
        forces.includes(k) ? `<i class="discovery-mark force${both}"></i>` : ""}</span>`;
    }).join("")}
  </div>`;
}

// A discovery not made yet: a gray board
const EMPTY_BOARD = `<div class="discovery-board empty" role="img" aria-label="Not discovered yet">
  ${TILES.map(() => "<span></span>").join("")}</div>`;

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

// The popup on a level: all the discoveries in a grid, with only their solutions (a discovery not
// made yet is a gray board), and a switch between the flips-only and the fewest-moves solutions
export function openDiscoveries() {
  const dialog = popup("discoveries-dialog", `<div class="solution-switch" role="radiogroup" aria-label="Solution">
      ${VIEWS.map(({ id, label }) => `<button type="button" role="radio" data-view="${id}">${label}</button>`).join("")}
    </div>`, `<div class="discovery-all"></div>`);
  const grid = dialog.querySelector<HTMLElement>(".discovery-all")!;
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>(".solution-switch button")];
  const draw = () => {
    buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.view === view)));
    grid.innerHTML = TIERS.map((tier) => {
      const board = discoveryOf(tier);
      return board === undefined ? EMPTY_BOARD : solutionBoard(board, view);
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

// Make the pattern of a stage's discovery: on top one red diamond per force to place, filled as
// they are placed; tap a tile of the solved board to force it (tap it again, or press <, to take
// it back). Tiles that can't lead to a pattern flips can solve are gray.
function openEditor(tier: Tier, done: () => void) {
  const forces = discoveryForces(tier);
  const dialog = popup("discovery-editor", `<div class="force-slots" role="img">
      ${Array.from({ length: forces }, () => `<i class="force-slot"></i>`).join("")}
    </div>`, `
    <div class="discovery-grid">
      ${TILES.map((k) => `<button type="button" class="discovery-tile" data-tile="${k}"
        aria-label="Tile ${k + 1}"><i class="force-gem" hidden></i></button>`).join("")}
    </div>
    <div class="discovery-controls">
      <button type="button" class="editor-previous" aria-label="Previous">&lt;</button>
      <button type="button" class="editor-reset">Reset</button>
    </div>
    <button type="button" class="primary discover">Discover</button>`);

  const placed: number[] = []; // the tiles forced, in order
  const board = () => placed.reduce((b, k) => b | (1 << k), 0);
  const tiles = [...dialog.querySelectorAll<HTMLButtonElement>(".discovery-tile")];
  const slots = [...dialog.querySelectorAll<HTMLElement>(".force-slot")];
  const slotRow = dialog.querySelector<HTMLElement>(".force-slots")!;
  const previous = dialog.querySelector<HTMLButtonElement>(".editor-previous")!;
  const reset = dialog.querySelector<HTMLButtonElement>(".editor-reset")!;
  const discoverButton = dialog.querySelector<HTMLButtonElement>(".discover")!;

  const draw = () => {
    const open = tilesToForce(board(), forces);
    tiles.forEach((tile, k) => {
      const forced = placed.includes(k);
      tile.classList.toggle("one", forced);
      tile.disabled = !forced && !((open >>> k) & 1);
      tile.setAttribute("aria-pressed", String(forced));
      tile.querySelector<HTMLElement>(".force-gem")!.hidden = !forced;
    });
    slots.forEach((slot, i) => slot.classList.toggle("filled", i < placed.length));
    slotRow.setAttribute("aria-label", `${placed.length} of ${plural(forces, "force")} placed`);
    previous.disabled = reset.disabled = placed.length === 0;
    discoverButton.disabled = placed.length !== forces;
  };

  tiles.forEach((tile, k) => tile.addEventListener("click", () => {
    const at = placed.indexOf(k);
    if (at >= 0) placed.splice(at, 1);
    else placed.push(k);
    draw();
  }));
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

export function discoveriesScreen(rerender: () => void) {
  const row = (tier: Tier) => {
    const board = discoveryOf(tier);
    const head = `<h2>${stageTitle(tier)}</h2>`;
    if (board !== undefined) {
      return `<li class="discovery-card">
        ${patternBoard(board)}
        <div>${head}
          <p>Solved with ${flipCount(board)}</p>
          <button type="button" class="reset-discovery" data-difficulty="${tier.difficulty}"
            ${coins() < DISCOVERY_RESET_COST ? "disabled" : ""}>Reset · ${coin()} ${DISCOVERY_RESET_COST}</button>
        </div>
      </li>`;
    }
    if (hasDiscoverySlot(tier)) {
      return `<li class="discovery-card ready"><div>${head}
        <button type="button" class="primary new-discovery" data-difficulty="${tier.difficulty}">Discover</button>
      </div></li>`;
    }
    return `<li class="discovery-card locked"><div>${head}<p>${LOCK} Complete ${tier.name} to earn this</p></div></li>`;
  };

  const resetAll = discoveryResetAllCost();
  const element = screen("discoveries-screen", `
    ${topbar("Discoveries", "#/", `${coin()} ${coins()}`)}
    ${resetAll ? `<button type="button" class="reset-all-discoveries" ${coins() < resetAll ? "disabled" : ""}>
      Reset all · ${coin()} ${resetAll}</button>` : ""}
    <p class="discoveries-intro">Every stage you complete earns one discovery: make a pattern, and see
      how to solve it with flips alone, for good. Open them with the Discoveries button while solving.</p>
    <ul class="discovery-cards">${TIERS.map(row).join("")}</ul>`);

  const tierOf = (button: HTMLElement) => TIERS.find((t) => t.difficulty === Number(button.dataset.difficulty))!;
  element.addEventListener("click", (e) => {
    const target = e.target as Element;
    const create = target.closest<HTMLElement>(".new-discovery");
    if (create) {
      openEditor(tierOf(create), rerender);
      return;
    }
    const reset = target.closest<HTMLElement>(".reset-discovery");
    if (reset) {
      const tier = tierOf(reset);
      if (confirm(`Reset the ${tier.name} discovery for ${DISCOVERY_RESET_COST} coins? You can then make a new one.`)
        && resetDiscovery(tier)) rerender();
      return;
    }
    if (target.closest(".reset-all-discoveries")) {
      if (confirm(`Reset all your discoveries for ${resetAll} coins? You can then make new ones.`)
        && resetAllDiscoveries()) rerender();
    }
  });
  return element;
}
