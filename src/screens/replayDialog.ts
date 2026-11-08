// The replay popup of a level: the solves that earned its flips star and its moves star (a tab
// each; a tab is locked until that star is earned), each on a board of its own. Nothing plays by
// itself: the board's < and > step through the moves, and so does a tap on the tile of the next
// move. Every move is marked on its tile with its number, in a gold circle for a flip and a red
// one for a force; the next move is highlighted, the moves made are faded.
//
// It is a <dialog>: shown over the screen with showModal(), closed with ×, Escape, a tap next to
// it, or going to another screen (Android's back button).
import { createFlipTiles } from "../game/createFlipTiles";
import type { FlipTilesChange, FlipTilesControls } from "../game/FlipTilesElement";
import type { Level } from "../levels/levels";
import { REPLAY_KINDS, recordedSolves, type ReplayKind } from "../progress";
import { LOCK } from "./ui";

const LABELS: Record<ReplayKind, string> = { flips: "Only flips", moves: "Fewest moves" };

export function openReplays(level: Level) {
  const solves = recordedSolves(level);
  const open = REPLAY_KINDS.filter((kind) => solves[kind]);
  if (open.length === 0) return; // nothing earned yet: nothing to watch

  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog replay-dialog";
  // (the content in a box of its own: a tap on the dialog itself is then a tap next to the box)
  dialog.innerHTML = `<div class="dialog-box">
    <header class="dialog-head">
      <h2>Your solutions</h2>
      <button type="button" class="close" aria-label="Close">×</button>
    </header>
    <div class="tabs" role="tablist">
      ${REPLAY_KINDS.map((kind) => solves[kind]
        ? `<button type="button" role="tab" data-kind="${kind}" aria-selected="false">
             ${LABELS[kind]} <span class="tab-count">${solves[kind]!.length}</span></button>`
        : `<button type="button" role="tab" data-kind="${kind}" aria-selected="false" disabled
             title="Earn this star to watch your solution">${LOCK} ${LABELS[kind]}</button>`).join("")}
    </div>
    <div class="replay-board"></div>
    <p class="replay-caption" aria-live="polite"></p>
  </div>`;
  document.body.append(dialog);

  const slot = dialog.querySelector<HTMLElement>(".replay-board")!;
  const caption = dialog.querySelector<HTMLElement>(".replay-caption")!;
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>("[role=tab]")];

  const show = (kind: ReplayKind) => {
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.kind === kind)));
    const moves = solves[kind]!;
    const widget = createFlipTiles({
      solver: false,
      newGame: false,
      start: level.board,
      maxMoves: Math.max(1, moves.length), // so it counts "Move 2 / 3"
    }) as HTMLElement & FlipTilesControls;
    slot.replaceChildren(widget); // in the page now: the widget starts
    const forward = widget.querySelector<HTMLButtonElement>(".forward")!;

    // A numbered badge per move, on its tile (a tile can have a flip and a force: two badges)
    const badges = moves.map((move, i) => {
      const badge = document.createElement("span");
      badge.className = `move-badge ${move.kind}`;
      badge.textContent = String(i + 1);
      const tile = widget.querySelector<HTMLElement>(`.tile[data-tile="${move.tile}"]`)!;
      tile.append(badge);
      if (tile.querySelectorAll(".move-badge").length > 1) tile.classList.add("two-badges");
      return badge;
    });

    // After every step: which moves are made, and which comes next
    let made = 0;
    widget.addEventListener("flip-tiles-change", (e) => {
      made = (e as CustomEvent<FlipTilesChange>).detail.moves.length;
      badges.forEach((badge, i) => {
        badge.classList.toggle("made", i < made);
        badge.classList.toggle("next", i === made);
      });
      widget.querySelectorAll(".tile").forEach((t) => t.classList.remove("next-tile"));
      const next = moves[made];
      widget.querySelector(`.tile[data-tile="${next?.tile}"]`)?.classList.add("next-tile");
      caption.textContent = next
        ? `${made === 0 ? "Tap the next tile, or press >." : ""} Next: ${next.kind} ${made + 1}`.trim()
        : "Solved!";
    });

    // The tiles don't make moves here: the widget's own handlers never hear of a press (the
    // events are stopped on the way down, at the widget). A tap on the next move's tile steps
    // forward, like >.
    for (const type of ["pointerdown", "click", "contextmenu"]) {
      widget.addEventListener(type, (e) => {
        const tile = (e.target as Element).closest<HTMLElement>(".tile");
        if (!tile) return;
        e.stopPropagation();
        e.preventDefault(); // (no menu on a right click or long press)
        if (type === "click" && Number(tile.dataset.tile) === moves[made]?.tile) forward.click();
      }, { capture: true });
    }

    widget.setHistory(moves); // the start board, with the moves ready (the badges get their state)
  };

  for (const tab of tabs) tab.addEventListener("click", () => show(tab.dataset.kind as ReplayKind));

  const close = () => dialog.close();
  dialog.querySelector(".close")!.addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close(); // a tap on the dimmed backdrop, next to the box
  });
  window.addEventListener("hashchange", close, { once: true });
  dialog.addEventListener("close", () => {
    window.removeEventListener("hashchange", close);
    dialog.remove();
  });

  dialog.showModal();
  show(open[0]);
}
