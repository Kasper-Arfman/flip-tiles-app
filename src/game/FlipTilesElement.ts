// The flip tiles widget: its behaviour, as a custom element <flip-tiles>. Copied from the website
// (astro-website/src/components/FlipTiles.astro); the markup it works on comes from createFlipTiles.ts.
import { N, MASKS, apply, isSolved, loadTable, type Move, type Ranking, type SolutionTable } from "./flipTiles";

const HOLD_MS = 450; // how long to hold a tile on a touch screen to force it
const RIPPLE_MS = 60; // each step further from the pressed tile turns over this much later
const CENTER = 12; // Scramble and Clear ripple out from the middle tile
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The detail of the "flip-tiles-change" event, sent after every change to the board
export interface FlipTilesChange {
  moves: Move[]; // the moves made, in order, without the ones undone or cancelled
  solved: boolean; // the moves solved the board
}

// What a page can do with the widget once it is on the page (the app's level screen uses these
// for hints and replays)
export interface FlipTilesControls {
  setMarks(moves: Move[]): void; // show these moves on the board: a hollow diamond, gold = flip, red = force
  playMove(move: Move): void; // make a move, as if the tile was pressed
  resetGame(): void; // back to the start board
  setHistory(moves: Move[]): void; // these moves as the game's history, at its start (step with < >)
}

class FlipTiles extends HTMLElement implements FlipTilesControls {
  // (set in connectedCallback; until then they do nothing)
  setMarks: (moves: Move[]) => void = () => {};
  playMove: (move: Move) => void = () => {};
  resetGame: () => void = () => {};
  setHistory: (moves: Move[]) => void = () => {};

  connectedCallback() {
    const tiles = [...this.querySelectorAll<HTMLButtonElement>(".tile")];
    // Without the solver (solver={false}), there is no status, switch or solve button
    const status = this.querySelector<HTMLParagraphElement>(".status");
    const rankingButtons = [...this.querySelectorAll<HTMLButtonElement>(".ranking button")];
    const next = this.querySelector<HTMLButtonElement>(".next");

    let state = 0;

    // The current game: the board it started with (Reset goes back to it), and the boards
    // after each move since, with the tile of that move (where the ripple starts): at most
    // `maxMoves` of them. `at` is the one on the board.
    const maxMoves = Number(this.dataset.maxMoves);
    const back = this.querySelector<HTMLButtonElement>(".back")!;
    const forward = this.querySelector<HTMLButtonElement>(".forward")!;
    const reset = this.querySelector<HTMLButtonElement>(".reset")!;
    let initial = 0;
    // (The first step is the start board; its kind is never used.)
    let steps: { state: number; tile: number; kind: Move["kind"] }[] = [];
    let at = 0;
    const moveNumber = this.querySelector<HTMLSpanElement>(".move-number")!;
    const solvedText = this.querySelector<HTMLElement>(".solved strong")!;
    const newGame = (board: number) => {
      initial = state = board;
      steps = [{ state: board, tile: CENTER, kind: "flip" }];
      at = 0;
    };
    const full = () => at >= maxMoves; // no more moves allowed in this game
    // The move is one of the moves made so far: making it again cancels it out
    const isRepeat = (move: Move) =>
      steps.slice(1, at + 1).some((s) => s.tile === move.tile && s.kind === move.kind);
    // After a move: forget the moves that were undone (no going forward to them anymore). A move
    // made for the second time cancels the first one: the order of moves doesn't matter, so both
    // leave the history, and the boards in between are worked out again without them.
    const record = (move: Move) => {
      const made = steps.slice(1, at + 1).map(({ tile, kind }): Move => ({ tile, kind }));
      const i = made.findIndex((m) => m.tile === move.tile && m.kind === move.kind);
      if (i >= 0) made.splice(i, 1);
      else made.push(move);
      steps = [steps[0]];
      for (const m of made) steps.push({ state: apply(steps[steps.length - 1].state, m), ...m });
      at = steps.length - 1;
    };
    let showing = false; // the solution is shown on the board
    const loaded = new Map<Ranking, SolutionTable>();
    const loadFailed = new Set<Ranking>(); // tables whose download failed (choosing again retries)
    // The solution shown; while hidden, the move count and Next move use the fewest forces one
    let chosen: Ranking = "fewestForces";
    const ranking = () => chosen;
    const plan = (): Move[] | null => loaded.get(ranking())?.solve(state) ?? null;

    // Tiles that change color turn over, the further from `origin` (the tile that was pressed),
    // the later: a small ripple
    let shown = 0;
    // Moves marked on the board by the page (setMarks), shown when the solver's aren't
    let pageMarks: Move[] = [];
    const draw = (origin = CENTER) => {
      const moves = plan();
      const marked = showing ? moves : pageMarks;
      const flips = new Set(marked?.filter((m) => m.kind === "flip").map((m) => m.tile));
      const forces = new Set(marked?.filter((m) => m.kind === "force").map((m) => m.tile));
      // The moves made so far, marked on their tiles (a gold diamond = flipped, a red one = forced, like the hints),
      // so the player sees what to press again to undo one
      const made = steps.slice(1, at + 1);
      const madeFlips = new Set(made.filter((m) => m.kind === "flip").map((m) => m.tile));
      const madeForces = new Set(made.filter((m) => m.kind === "force").map((m) => m.tile));
      tiles.forEach((tile, k) => {
        if ((((shown ^ state) >>> k) & 1) === 1) {
          const distance = Math.abs(Math.floor(k / 5) - Math.floor(origin / 5)) + Math.abs((k % 5) - (origin % 5));
          tile.style.setProperty("--flip-delay", `${distance * RIPPLE_MS}ms`);
          tile.classList.remove("flipping");
          void tile.offsetWidth; // restart the animation, also when it is still running
          tile.classList.add("flipping");
        }
        tile.classList.toggle("one", ((state >>> k) & 1) === 1);
        tile.classList.toggle("flip", flips.has(k));
        tile.classList.toggle("force", forces.has(k));
        tile.classList.toggle("flipped", madeFlips.has(k));
        tile.classList.toggle("forced", madeForces.has(k));
      });
      shown = state;
      back.disabled = at === 0;
      forward.disabled = at === steps.length - 1;
      reset.disabled = steps.length === 1;
      moveNumber.textContent = `Move ${at} / ${maxMoves}`;
      this.classList.toggle("full", full());
      // Solved! once a move has solved the board (not for a board that starts out solved),
      // after the slowest tile has turned over
      const solvedNow = at > 0 && isSolved(state);
      if (solvedNow && !this.classList.contains("is-solved")) {
        const slowest = Math.max(0, ...tiles.map((t) => parseFloat(t.style.getPropertyValue("--flip-delay")) || 0));
        this.style.setProperty("--solved-delay", `calc(${slowest}ms + var(--flash-time) + var(--flip-time))`);
      }
      this.classList.toggle("is-solved", solvedNow);
      this.classList.toggle("all-one", solvedNow && state !== 0); // solved all yellow
      solvedText.textContent = solvedNow ? "Solved!" : "";
      // Tell the page: the moves on the board now (after undoing, cancelling and going back),
      // and whether they solved it. The app's level screen counts its stars from this.
      const detail: FlipTilesChange = {
        moves: steps.slice(1, at + 1).map(({ tile, kind }) => ({ tile, kind })),
        solved: solvedNow,
      };
      this.dispatchEvent(new CustomEvent("flip-tiles-change", { detail }));
      if (next) next.disabled = !showing || !moves || moves.length === 0 || full(); // only with a solution shown
      // Only while a solution is shown, and not for a solved board
      if (!status) return;
      if (!showing || isSolved(state)) status.textContent = "";
      else if (!moves) {
        status.textContent = loadFailed.has(ranking())
          ? "The solution could not be loaded. Reload the page to try again."
          : "Loading the solution…";
      } else {
        const nForces = forces.size;
        status.textContent = `Solvable in ${count(moves.length, "move")}` +
          (nForces ? `, of which ${count(nForces, "force")}` : "") + ".";
      }
    };

    // The table for the current ranking, downloaded the first time it is needed
    const ensureTable = () => {
      const wanted = ranking();
      if (loaded.has(wanted)) return;
      loadFailed.delete(wanted); // trying (again): show "Loading" instead of the error
      draw();
      loadTable(wanted)
        .then((table) => loaded.set(wanted, table))
        .catch(() => loadFailed.add(wanted))
        .finally(() => draw());
    };

    // Press a tile: flip its cross, or force only that tile
    const allowForce = this.dataset.allowForce !== "false";
    // (Returns whether the move was made.)
    const maxForces = Number(this.dataset.maxForces ?? Infinity);
    const press = (k: number, force: boolean) => {
      if (force && !allowForce) return false; // flips only in this game
      const move: Move = { kind: force ? "force" : "flip", tile: k };
      // The most moves in a game: go back or start over first (or take one of them back)
      if (full() && !isRepeat(move)) return false;
      // All forces in use: take one back first (forcing that tile again is allowed). Tell the page.
      if (force && !isRepeat(move) && steps.slice(1, at + 1).filter((s) => s.kind === "force").length >= maxForces) {
        this.dispatchEvent(new CustomEvent("flip-tiles-no-forces-left"));
        return false;
      }
      state = apply(state, move);
      record(move);
      draw(k);
      // (for the app's sounds: a tile was pressed, see sound.ts)
      this.dispatchEvent(new CustomEvent("flip-tiles-press", { detail: move, bubbles: true }));
      return true;
    };

    // With a mouse: click flips, right click or shift click forces. On a touch screen: a tap
    // flips, a tap and hold forces. A hold that has forced swallows the click that follows
    // when the finger lifts; moving the finger (to scroll) cancels the hold.
    tiles.forEach((tile, k) => {
      let holdTimer: number | undefined;
      let start = { x: 0, y: 0 };
      let heldDown = false; // the current touch has already forced the tile
      const cancelHold = () => {
        clearTimeout(holdTimer);
        holdTimer = undefined;
        tile.classList.remove("holding");
      };
      tile.addEventListener("pointerdown", (e) => {
        heldDown = false;
        if (e.pointerType === "mouse" || !allowForce) return; // no hold to force
        start = { x: e.clientX, y: e.clientY };
        tile.classList.add("holding");
        holdTimer = window.setTimeout(() => {
          cancelHold();
          heldDown = true;
          if (press(k, true)) navigator.vibrate?.(30); // a small buzz, where phones support it
        }, HOLD_MS);
      });
      tile.addEventListener("pointermove", (e) => {
        if (holdTimer !== undefined && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelHold();
      });
      tile.addEventListener("pointerup", cancelHold);
      tile.addEventListener("pointercancel", cancelHold);
      tile.addEventListener("pointerleave", cancelHold);
      tile.addEventListener("click", (e) => {
        if (heldDown) {
          heldDown = false; // the hold already forced it
          return;
        }
        press(k, e.shiftKey);
      });
      // Right click forces. A long press on a touch screen also opens this menu on some phones
      // (Android): there, the hold does the forcing, so only stop the menu.
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (holdTimer === undefined && !heldDown) press(k, true);
      });
    });

    // A random board that can be solved with flips alone: random flips on a solved board. As
    // in the Python GUI, keep trying until the shown solution has no forces either.
    const scramble = () => {
      for (let tries = 0; tries < 1000; tries++) {
        state = 0;
        for (let k = 0; k < N; k++) if (Math.random() < 0.5) state ^= MASKS[k];
        const moves = plan();
        if (!isSolved(state) && (!moves || moves.every((m) => m.kind === "flip"))) break;
      }
    };
    // Scramble and Clear start a new game
    this.querySelector(".scramble")?.addEventListener("click", () => {
      scramble();
      newGame(state);
      draw();
    });
    this.querySelector(".clear")?.addEventListener("click", () => {
      newGame(0);
      draw();
    });

    // Back and forward through the moves; the ripple starts at the tile of the move that is
    // undone or redone
    back.addEventListener("click", () => {
      if (at === 0) return;
      const { tile } = steps[at];
      state = steps[--at].state;
      draw(tile);
    });
    forward.addEventListener("click", () => {
      if (at === steps.length - 1) return;
      state = steps[++at].state;
      draw(steps[at].tile);
    });
    // Back to the board the game started with, as a fresh start
    reset.addEventListener("click", () => {
      newGame(initial);
      draw();
    });
    // Next move plays the forces first, then the flips: the single tiles are fixed up front, so
    // the flips at the end turn the board one color all at once. Moves can be done in any
    // order, so this doesn't make the solution any longer.
    next?.addEventListener("click", () => {
      const moves = plan();
      if (!moves?.length || full()) return;
      const move = moves.find((m) => m.kind === "force") ?? moves[0];
      state = apply(state, move);
      record(move);
      draw(move.tile);
    });
    // The switch: hide the solution, or show one of the two
    for (const button of rankingButtons) {
      button.addEventListener("click", () => {
        const choice = button.dataset.ranking!;
        showing = choice !== "hide";
        if (showing) chosen = choice as Ranking;
        rankingButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        ensureTable();
        draw();
      });
    }

    // Start downloading the table once the widget is (nearly) in view; without the solver,
    // there is nothing to download
    if (rankingButtons.length) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          ensureTable();
        }
      }, { rootMargin: "300px" });
      observer.observe(this);
    }

    // For the page: marks, moves and Reset (see FlipTilesControls)
    this.setMarks = (moves) => {
      pageMarks = moves;
      draw();
    };
    this.playMove = (move) => press(move.tile, move.kind === "force");
    this.resetGame = () => reset.click();
    // A game played before: the start board, with its moves ready for the forward button
    this.setHistory = (moves) => {
      newGame(initial);
      for (const m of moves) steps.push({ state: apply(steps[steps.length - 1].state, m), ...m });
      shown = state; // no turning over: the board is as it was
      draw();
    };

    // The start board: the given one, or a random one. It appears as it is, without turning over.
    if (this.dataset.start !== undefined) state = Number(this.dataset.start);
    else scramble();
    newGame(state);
    shown = state;
    draw();
  }
}

if (!customElements.get("flip-tiles")) customElements.define("flip-tiles", FlipTiles);
