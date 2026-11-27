// A tier's screen: a grid of its levels, each with a picture of its board and its stars. The
// levels are graded within the tier by minMoves (the length of the fewest-moves solution), in
// groups, each under a head with its number of moves. A group opens when enough stars are earned
// in the group before it (see progress.ts); until then its levels are locked, and a line under
// its head says how many stars are still needed. The locked group next in line can also be
// bought with coins.
import { bonusOf, type Level, type Tier } from "../levels/levels";
import {
  ALL_STARS, BONUS_REWARD, BONUS_UNLOCK_COST, GRADE_UNLOCK_COST, buyBonus, buyGrade, canBuyBonus, canBuyGrade, coins,
  countStars, isTierOpen, maxStars, starsOf, starsToUnlockGrade, tierStars,
} from "../progress";
import { go } from "../nav";
import { popup } from "./codex";
import { confirmFlips, warnsAboutFlips } from "./flipsWarning";
import { canTopUp, openTopUp } from "./topUp";
import { LOCK, coin, miniBoard, plural, screen, stageTitle, star, starRow, topbar } from "./ui";

// A complete stage's bonus levels, not bought yet: a popup offering them (what they are, what
// they cost, what completing them pays back). Short of coins: how many, and Top up. (From the
// strip under the stage's card on the home screen, and from the stage's swap button.)
export function offerBonus(bonus: Tier, rerender: () => void) {
  const short = coins() < BONUS_UNLOCK_COST;
  const dialog = popup("bonus-offer-dialog blue-stars", `<h2>Bonus levels</h2>`, `<div class="bonus-offer">
      <ul class="bonus-offer-list">
        <li>${bonus.levels.length} new ${bonus.main!.name} puzzles</li>
        <li>${star(true)} ${maxStars(bonus)} stars to earn</li>
        <li>Complete them all and get ${coin()} ${BONUS_REWARD} back</li>
      </ul>
      <button type="button" class="button buy-bonus"${short ? " disabled" : ""}>Unlock for ${coin()} ${BONUS_UNLOCK_COST}</button>
      ${short ? `<p class="bonus-offer-short">You have ${coin()} ${coins()}.
        ${canTopUp() ? `<button type="button" class="link-button top-up-link">Top up</button>` : ""}</p>` : ""}
    </div>`);
  dialog.querySelector(".buy-bonus")!.addEventListener("click", () => {
    if (!buyBonus(bonus)) return;
    dialog.close();
    go(`#/tier/${bonus.id}`, true);
  });
  dialog.querySelector(".top-up-link")?.addEventListener("click", () => {
    dialog.close();
    openTopUp(rerender);
  });
}

// A group to show when the tier screen opens next (ranked's popup of what to complete: "Epsilon,
// 5 moves" scrolls to that group)
let scrollTo: number | null = null;
export const showGrade = (minMoves: number) => {
  scrollTo = minMoves;
};

// The button between a stage's levels and its bonus levels, the same on both: like a phone's
// switch between its front and back camera, two arrows chasing each other round, with a small
// grid of tiles (levels) in the middle
const SWAP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <g class="swap-arrows"><path d="M3.5 11a8.5 8.5 0 0 1 15-4.6" /><path d="M19.5 2.8v4h-4" /><path d="M20.5 13a8.5 8.5 0 0 1-15 4.6" /><path d="M4.5 21.2v-4h4" /></g>
  <g class="swap-inner" transform="translate(12 12) scale(0.42) translate(-12 -12)"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></g></svg>`;
const ARROW_LEFT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>`;
const ARROW_RIGHT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>`;

// The group of bonus levels shown last in each stage (by tier id -> minMoves): shown again when
// the player comes back, also after Next level went on into the next group (the level screen
// tells, see showBonusTabOf)
const bonusTab = new Map<number, number>();
export const showBonusTabOf = (level: Level) => bonusTab.set(level.tier, level.minMoves);

// A tier's screen: a stage, or a stage's bonus levels (`tier.main`: the stage). Once the stage is
// complete, a button in the top bar goes between its levels and its bonus levels (the card on
// the home screen opens on the bonus levels). Both look alike, with a head over each group (its
// number of moves, its stars, arrows and dots), and the levels in the same place: the bonus
// levels have a page per group, all open, to swipe (or drag, with a mouse) left and right; a
// stage has its groups one under the other, scrolled up and down.
export function tierScreen(tier: Tier, rerender: () => void) {
  const stage = tier.main ?? tier;
  const bonus = bonusOf(stage);
  const bonusOpen = bonus !== undefined && isTierOpen(bonus);
  // (complete, its bonus levels not bought yet: the button offers them, with a small lock)
  const bonusForSale = bonus !== undefined && canBuyBonus(bonus);
  const inBonus = tier === bonus;
  const tab = inBonus ? (tier.grades.find((g) => g[0].minMoves === bonusTab.get(tier.id)) ?? tier.grades[0]) : undefined;

  // The tiles of a group's levels
  const tiles = (shown: Level[]) => shown.map((level) => {
    const bits = starsOf(level);
    const item = `<li data-moves="${level.minMoves}">`;
    if (starsToUnlockGrade(tier, level.grade)) {
      return `${item}<div class="level-tile locked" aria-label="Level ${level.number}, locked">
        ${miniBoard(level.board)}
        <span class="level-number">${level.number}</span>
        ${starRow(0, "small")}
      </div></li>`;
    }
    // All three stars: a gold border (no border before that: the stars show how far it is)
    const finish = bits === ALL_STARS ? " perfect" : "";
    const warn = warnsAboutFlips(level) ? ` data-warn="${level.number}"` : "";
    return `${item}<a class="level-tile${finish}"${warn} href="#/level/${tier.id}/${level.number}"
        aria-label="Level ${level.number}">
      ${miniBoard(level.board)}
      <span class="level-number">${level.number}</span>
      ${starRow(bits, "small")}
    </a></li>`;
  }).join("");

  const starsIn = (levels: Level[]) => levels.reduce((n, l) => n + countStars(starsOf(l)), 0);
  const count = tier.grades.length;
  // The head, the same on both sides, kept at the top under the top bar: the shown group's number
  // of moves in the middle, its stars on the right, an arrow on each side to the group before and
  // after, and under it a dot per group (the shown one lit, a complete group's gold), like a
  // phone's home screen; a dot can be tapped too. (Filled in by show(), below.)
  const head = `<div class="grade-head">
      <button type="button" class="grade-arrow" data-step="-1" aria-label="Fewer moves">${ARROW_LEFT}</button>
      <p class="grade-name" aria-live="polite"></p>
      <span class="grade-stars"></span>
      <div class="grade-dots" role="tablist" aria-label="Number of moves">
        ${tier.grades.map((g, j) => `<button type="button" role="tab" class="grade-dot${starsIn(g) === 3 * g.length ? " done" : ""}"
          data-index="${j}" aria-label="${plural(g[0].minMoves, "move")}"></button>`).join("")}
      </div>
      <button type="button" class="grade-arrow" data-step="1" aria-label="More moves">${ARROW_RIGHT}</button>
    </div>`;
  // The line above each group of a stage but the first: its number of moves, and for a locked
  // group, on the same line, what opens it; under it, for the group next in line, the button to
  // buy it with coins
  const divider = (grade: number) => {
    const moves = plural(tier.grades[grade][0].minMoves, "move");
    const missing = starsToUnlockGrade(tier, grade);
    if (!missing) return `<p class="grade-divider"><span>${moves}</span></p>`;
    const buy = canBuyGrade(tier, grade)
      ? `<div class="grade-buy"><button type="button" class="unlock-button" data-grade="${grade}"
           ${coins() < GRADE_UNLOCK_COST ? "disabled" : ""}>Unlock for ${coin()} ${GRADE_UNLOCK_COST}</button></div>`
      : "";
    return `<p class="grade-divider locked"><span>${moves} · ${LOCK} Earn ${plural(missing, "more star")} above</span></p>${buy}`;
  };
  // Under the head, the bonus levels: a row of pages to swipe through. A stage: its groups one
  // under the other, scrolled up and down (passing behind the head), each after the first under
  // a line with its number of moves
  const body = tab
    ? `<div class="grade-pages">${tier.grades.map((g) => `<section class="grade-page" data-moves="${g[0].minMoves}"
        aria-label="${plural(g[0].minMoves, "move")}"><ol class="level-grid">${tiles(g)}</ol></section>`).join("")}</div>`
    : tier.grades.map((g, i) => `<section class="grade-section" data-moves="${g[0].minMoves}">
        ${i > 0 ? divider(i) : ""}
        <ol class="level-grid">${tiles(g)}</ol></section>`).join("");

  // Once the stage is complete: a small round button in the top bar to the other side
  const other = inBonus ? stage : bonus;
  const swap = bonusOpen
    ? `<button type="button" class="tier-swap ${inBonus ? "to-main" : "to-bonus"}" data-to="#/tier/${other!.id}"
        aria-label="${inBonus ? "Main levels" : "Bonus levels"}">${SWAP_ICON}</button>`
    : bonusForSale
      ? `<button type="button" class="tier-swap to-bonus for-sale" aria-label="Bonus levels: unlock">${SWAP_ICON}
          <span class="swap-lock" aria-hidden="true">${LOCK}</span></button>`
      : "";

  // (the bonus levels' stars, all of them on this screen: blue)
  const element = screen(`tier-screen${inBonus ? " blue-stars" : ""}`, `
    ${topbar(stageTitle(stage), "#/", `<span class="tier-total">${star(true)}<span class="tier-count">${tierStars(tier)}/${maxStars(tier)}</span></span>${swap}`)}
    ${head}
    ${body}`);
  // (the head stays just under the top bar: its height, once the screen is on the page)
  requestAnimationFrame(() => {
    const bar = element.querySelector<HTMLElement>(".topbar");
    if (bar?.offsetHeight) element.style.setProperty("--topbar-height", `${bar.offsetHeight}px`);
  });

  // The head shows group i: its name and stars, its dot lit, and no arrow past the ends
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  let shown = tab ? tier.grades.indexOf(tab) : 0;
  const show = (i: number) => {
    shown = i;
    const group = tier.grades[i];
    if (inBonus) bonusTab.set(tier.id, group[0].minMoves);
    element.querySelectorAll<HTMLElement>(".grade-dot").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
    element.querySelector(".grade-name")!.textContent = plural(group[0].minMoves, "move");
    // (the bonus levels' star always blue, also at 0)
    element.querySelector(".grade-stars")!.innerHTML = `${star(inBonus || starsIn(group) > 0)} ${starsIn(group)}/${3 * group.length}`;
    const [back, next] = element.querySelectorAll<HTMLButtonElement>(".grade-arrow");
    back.disabled = i === 0;
    next.disabled = i === count - 1;
  };
  show(shown);

  // A stage: the head shows the group at the top of the screen, just under it (or the last
  // group, once scrolled to the bottom); its arrows and dots scroll to a group: its first levels
  // (or the button to buy it) right under the head, as on a bonus page, its line hidden behind it
  const sections = [...element.querySelectorAll<HTMLElement>(".grade-section")];
  let scrollToGroup = (_i: number) => {};
  if (sections.length) {
    // (where the head's bottom is once it sticks under the top bar: at the very top of the page,
    // before it sticks, it is a little lower)
    const headBottom = () =>
      element.querySelector(".topbar")!.getBoundingClientRect().bottom + element.querySelector<HTMLElement>(".grade-head")!.offsetHeight;
    const startOf = (i: number) => sections[i].querySelector(".grade-buy, .level-grid")!.getBoundingClientRect().top;
    // (a group scrolled to: the head shows it at once, not the groups passed on the way, until
    // the scrolling stops)
    let pinned = false;
    let pinTimer = 0;
    const unpinSoon = () => {
      window.clearTimeout(pinTimer);
      pinTimer = window.setTimeout(() => (pinned = false), 150);
    };
    scrollToGroup = (i: number) => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      show(clamp(i));
      pinned = true;
      unpinSoon();
      const top = i <= 0 ? 0 : window.scrollY + startOf(clamp(i)) - headBottom();
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    };
    element.querySelectorAll<HTMLElement>(".grade-arrow").forEach((arrow) =>
      arrow.addEventListener("click", () => scrollToGroup(shown + Number(arrow.dataset.step))));
    element.querySelectorAll<HTMLElement>(".grade-dot").forEach((dot) =>
      dot.addEventListener("click", () => scrollToGroup(Number(dot.dataset.index))));
    const onScroll = () => {
      if (!element.isConnected) return window.removeEventListener("scroll", onScroll);
      if (pinned) return unpinSoon();
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      // (on to the next group once more than half of this one's levels have gone behind the head)
      const line = headBottom();
      const grids = sections.map((s) => s.querySelector(".level-grid")!.getBoundingClientRect());
      let i = 0;
      while (i < count - 1 && grids[i].bottom - line < (grids[i].height - 1) / 2) i++;
      if (atBottom) i = count - 1;
      if (i !== shown) show(i);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // (its arrows turn half a turn first, like the camera switch's)
  element.querySelector<HTMLElement>(".tier-swap")?.addEventListener("click", (e) => {
    const button = e.currentTarget as HTMLElement;
    if (button.classList.contains("for-sale")) return offerBonus(bonus!, rerender);
    if (button.classList.contains("turning")) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    button.classList.add("turning");
    window.setTimeout(() => go(button.dataset.to!, true), still ? 0 : 260);
  });
  // The pages: the dot of the page in view lights up, the head shows its group, and it is
  // remembered; a dot or an arrow scrolls to its page
  const pages = element.querySelector<HTMLElement>(".grade-pages");
  if (pages) {
    // (from one page to the next: a page and the gap between them)
    const stride = () => {
      const [first, second] = pages.children as HTMLCollectionOf<HTMLElement>;
      return second ? second.offsetLeft - first.offsetLeft : pages.clientWidth;
    };
    let dragging = false; // (a mouse drag, see below)
    // (a page turned to by an arrow, a dot or a let-go drag: the head shows it at once, not the
    // pages passed on the way)
    let turning: number | null = null;
    const turnTo = (i: number) => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      show(clamp(i));
      turning = Math.abs(pages.scrollLeft - clamp(i) * stride()) < 2 ? null : clamp(i);
      pages.scrollTo({ left: clamp(i) * stride(), behavior: smooth ? "smooth" : "auto" });
    };
    element.querySelectorAll<HTMLElement>(".grade-dot").forEach((b, i) => b.addEventListener("click", () => turnTo(i)));
    for (const arrow of element.querySelectorAll<HTMLElement>(".grade-arrow")) {
      arrow.addEventListener("click", () => turnTo(shown + Number(arrow.dataset.step)));
    }
    // (the page whose middle is in view, after each swipe or scroll)
    pages.addEventListener("scroll", () => {
      if (turning !== null) {
        if (Math.abs(pages.scrollLeft - turning * stride()) < 2) turning = null; // (arrived)
        return;
      }
      const i = clamp(Math.round(pages.scrollLeft / stride()));
      if (i !== shown && !dragging) show(i);
    }, { passive: true });
    // (a finger or the mouse on the pages takes over from a page being turned to)
    pages.addEventListener("touchstart", () => (turning = null), { passive: true });

    // With a mouse (a computer), the pages are dragged sideways like a swipe: on letting go, the
    // page goes on to the next one if it moved far enough (a sixth of the page), else back. A
    // drag doesn't open the level it started on.
    let drag: { x: number; left: number } | null = null;
    pages.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button === 0) {
        turning = null;
        drag = { x: e.clientX, left: pages.scrollLeft };
      }
    });
    pages.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!dragging && Math.abs(dx) > 6) {
        dragging = true;
        pages.classList.add("dragging");
        pages.setPointerCapture(e.pointerId);
      }
      if (dragging) pages.scrollLeft = drag.left - dx;
    });
    const letGo = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const from = Math.round(drag.left / stride());
      drag = null;
      if (!dragging) return;
      pages.classList.remove("dragging");
      const step = Math.abs(dx) > pages.clientWidth / 6 ? -Math.sign(dx) : 0;
      turnTo(from + step);
      // (the click that ends a drag, right after: not on the level under the mouse)
      const noClick = (c: Event) => c.preventDefault();
      pages.addEventListener("click", noClick, { capture: true });
      window.setTimeout(() => {
        pages.removeEventListener("click", noClick, { capture: true });
        dragging = false;
      });
    };
    pages.addEventListener("pointerup", letGo);
    pages.addEventListener("pointercancel", letGo);
    pages.addEventListener("dragstart", (e) => e.preventDefault()); // (not the browser's drag of a link)

    // Open on the page shown last (once the screen is on the page, so it has a width)
    requestAnimationFrame(() => {
      pages.scrollLeft = shown * stride();
    });
  }
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

  // The group asked for (showGrade): scrolled to, just under the head, and its levels flash
  if (scrollTo !== null) {
    const moves = scrollTo;
    scrollTo = null;
    const target = sections.findIndex((s) => Number(s.dataset.moves) === moves);
    // (once the screen is on the page: main.ts scrolls a new screen to the top first)
    if (target >= 0) {
      requestAnimationFrame(() => {
        scrollToGroup(target);
        for (const tile of element.querySelectorAll(`li[data-moves="${moves}"] .level-tile`)) {
          tile.classList.add("flash");
          tile.addEventListener("animationend", () => tile.classList.remove("flash"), { once: true });
        }
      });
    }
  }
  return element;
}
