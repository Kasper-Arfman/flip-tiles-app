// The shop: spend coins. At the top, the player's look as it is now (a small board in their skin
// and shape, with the names); below it, tabs, one thing at a time:
//   - Skins: the tiles' two colors
//   - Shapes: the outline of every tile (a heart, a paw, a flower, ...)
//   - Extras: Unlock all (every stage, group of levels, skin and shape at once)
// Skins and shapes go together in any combination. Each tab of them starts with its mystery box
// (a random one the player doesn't have yet; gone once there is none left), then the collection,
// a card each with a small board: a skin's card shows it in the shape in use, a shape's card in
// the skin in use, so the player sees the combination they would get. One owned can be put on at
// any time; one not owned yet is a gray card with a question mark (its name and look are the
// surprise; while building the game, DEV_MODE shows them). The Extras tab is gone once there is
// nothing left in it.
import { DEV_MODE, TEST_BUILD } from "../dev";
import {
  BOX_BUNDLE, BUNDLE_COST, SKIN_COST, UNLOCK_ALL_COST, activeLook, activeShape, activeSkin, buyMysteryShapes,
  buyMysterySkins, buyUnlockAll, coins, ownsAll, ownsShape, ownsSkin, shapesLeft, skinsLeft, useShape, useSkin,
} from "../progress";
import { COIN_PACK, buyCoinPack, coinPackPrice } from "../purchases";
import { SHAPES, SKINS, SKIN_GROUPS, applySkin, findShape, findSkin, skinStyle, type Shape, type Skin } from "../skins";
import { coin, screen, topbar } from "./ui";

// The board in every preview: a 3 x 3 checkerboard of tiles, in the skin's colors and the
// shape's outline (from the CSS variables of the card it is in)
const PREVIEW = `<div class="skin-preview" aria-hidden="true">${
  [...Array(9)].map((_, k) => `<span class="${k % 2 ? "zero" : "one"}"></span>`).join("")}</div>`;

// The mystery box: a gift box with a question mark
const BOX = `<svg class="mystery-box" viewBox="0 0 64 64" aria-hidden="true">
  <rect class="box-body" x="10" y="28" width="44" height="30" rx="4" />
  <rect class="box-ribbon" x="28" y="28" width="8" height="30" />
  <g class="box-lid">
    <rect class="box-body" x="6" y="18" width="52" height="12" rx="3" />
    <rect class="box-ribbon" x="28" y="18" width="8" height="12" />
    <path class="box-bow" d="M32 18c-6-10-16-8-14-2s14 2 14 2zM32 18c6-10 16-8 14-2s-14 2-14 2z" />
  </g>
  <text class="box-mark" x="32" y="51" text-anchor="middle">?</text>
</svg>`;

// An open padlock: Unlock all
const PADLOCK = `<svg class="unlock-all-icon" viewBox="0 0 64 64" aria-hidden="true">
  <path class="lock-shackle" d="M20 30V20a12 12 0 0 1 23.5-3.4" fill="none" />
  <rect class="lock-body" x="12" y="30" width="40" height="28" rx="6" />
  <circle class="lock-hole" cx="32" cy="42" r="4" /><rect class="lock-hole" x="30.5" y="43" width="3" height="8" rx="1.5" />
</svg>`;

// What the shop sells in boxes, the same way for both kinds
type Kind = "skin" | "shape";
type Tab = Kind | "extras";
interface Found { id: string; name: string }

const KINDS = {
  skin: {
    noun: "skin",
    title: "Mystery skin",
    what: "skin",
    all: SKINS as Found[],
    owns: ownsSkin,
    inUse: () => activeSkin(),
    left: () => skinsLeft().length,
    buy: (count: number): Found[] => buyMysterySkins(count),
    use: useSkin,
    // (a skin seen in the shape in use)
    style: (id: string) => skinStyle({ skin: id, shape: activeShape() }),
  },
  shape: {
    noun: "shape",
    title: "Mystery shape",
    what: "tile shape",
    all: SHAPES as Found[],
    owns: ownsShape,
    inUse: () => activeShape(),
    left: () => shapesLeft().length,
    buy: (count: number): Found[] => buyMysteryShapes(count),
    use: useShape,
    // (a shape seen in the skin in use)
    style: (id: string) => skinStyle({ skin: activeSkin(), shape: id }),
  },
};

// Coins for real money (see purchases.ts): only in the native apps, and only once the store has
// given the price. The store itself shows its own confirmation with the price before charging.
// (A test build: everywhere, free; see TEST_BUILD in dev.ts.)
const coinPack = () => {
  const price = coinPackPrice();
  if (!price) return "";
  return `<section class="mystery-card coin-pack-card">
      <span class="coin-pack-icon">${coin()}</span>
      <div class="mystery-text">
        <h2>${COIN_PACK} coins</h2>
        <p>${TEST_BUILD ? "Test version: no payment, the coins are added at once." : `Add ${COIN_PACK} coins to your pouch.`}</p>
        <button type="button" class="primary buy-coins">Buy · ${price}</button>
      </div>
    </section>`;
};

// The tab on show: kept while the shop is drawn again (after buying or putting on), and when
// the player comes back to the shop
let tab: Tab = "skin";

export function shopScreen(rerender: () => void) {
  const hasExtras = !ownsAll();
  if (tab === "extras" && !hasExtras) tab = "skin";

  const card = (kind: Kind, item: Skin | Shape) => {
    const k = KINDS[kind];
    if (!k.owns(item.id)) {
      // (while building the game: its look and name, marked as not found yet)
      return DEV_MODE
        ? `<li class="skin-card not-owned" style="${k.style(item.id)}">
            ${PREVIEW}
            <span class="skin-name">${item.name}</span>
            <span class="skin-tag">Not found yet</span>
          </li>`
        : `<li class="skin-card unknown" aria-label="A ${k.noun} not found yet">
            ${PREVIEW}
            <span class="skin-name">?</span>
          </li>`;
    }
    const inUse = k.inUse() === item.id;
    const button = inUse
      ? `<button type="button" class="skin-action in-use" disabled>✓ In use</button>`
      : `<button type="button" class="skin-action" data-kind="${kind}" data-use="${item.id}">Use</button>`;
    // (the card sets the look's variables on itself, so its preview board shows them)
    return `<li class="skin-card${inUse ? " in-use" : ""}" style="${k.style(item.id)}">
      ${PREVIEW}
      <span class="skin-name">${item.name}</span>
      ${button}
    </li>`;
  };

  // A mystery box: none once there is nothing left to find
  const box = (kind: Kind) => {
    const k = KINDS[kind];
    const left = k.left();
    if (!left) return "";
    return `<section class="mystery-card">
        ${BOX}
        <div class="mystery-text">
          <h2>${k.title}</h2>
          <p>A random ${k.what} you don't have yet. ${left} left to find.</p>
          <div class="box-buttons">
            <button type="button" class="primary open-box" data-kind="${kind}" data-count="1"
              ${coins() < SKIN_COST ? "disabled" : ""}>Open · ${coin()} ${SKIN_COST}</button>
            ${left >= BOX_BUNDLE ? `<button type="button" class="primary open-box" data-kind="${kind}"
              data-count="${BOX_BUNDLE}" ${coins() < BUNDLE_COST ? "disabled" : ""}>Open ${BOX_BUNDLE} ·
              ${coin()} ${BUNDLE_COST}</button>` : ""}
          </div>
        </div>
      </section>`;
  };

  const owned = (kind: Kind) => KINDS[kind].all.filter((i) => KINDS[kind].owns(i.id)).length;

  // The content of each tab
  const panels: Record<Tab, () => string> = {
    skin: () => box("skin") + SKIN_GROUPS.map(({ group, title }) => `
      <h2 class="shop-section">${title.replace(/^Skins: (.)/, (_, c: string) => c.toUpperCase())}</h2>
      <ul class="skin-grid">${SKINS.filter((s) => s.group === group).map((s) => card("skin", s)).join("")}</ul>`).join(""),
    shape: () => box("shape") + `
      <h2 class="shop-section">All shapes</h2>
      <ul class="skin-grid">${SHAPES.map((s) => card("shape", s)).join("")}</ul>`,
    extras: () => `<section class="mystery-card unlock-all-card">
        ${PADLOCK}
        <div class="mystery-text">
          <h2>Unlock all</h2>
          <p>Every stage and level, every skin and every shape, right away.</p>
          <button type="button" class="primary buy-all" ${coins() < UNLOCK_ALL_COST ? "disabled" : ""}>
            Unlock · ${coin()} ${UNLOCK_ALL_COST}</button>
        </div>
      </section>`,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "skin", label: `Skins <small>${owned("skin")}/${SKINS.length}</small>` },
    { id: "shape", label: `Shapes <small>${owned("shape")}/${SHAPES.length}</small>` },
    // ...(hasExtras ? [{ id: "extras" as Tab, label: "Extras" }] : []),
  ];

  const look = activeLook();
  const element = screen("shop-screen", `
    ${topbar("Shop", "#/", `${coin()} ${coins()}`)}
    <section class="my-look" style="${skinStyle(look)}">
      ${PREVIEW}
      <div class="my-look-text">
        <small>Your look</small>
        <strong>${findSkin(look.skin).name}</strong>
        <span>${findShape(look.shape).name} tiles</span>
      </div>
    </section>
    ${coinPack()}
    <div class="shop-tabs" role="tablist">
      ${tabs.map((t) => `<button type="button" role="tab" class="shop-tab" data-tab="${t.id}"
        aria-selected="${t.id === tab}">${t.label}</button>`).join("")}
    </div>
    <div class="shop-panel" role="tabpanel">${panels[tab]()}</div>`);

  element.addEventListener("click", (e) => {
    const target = e.target as Element;
    const tabButton = target.closest<HTMLElement>(".shop-tab");
    if (tabButton) {
      tab = tabButton.dataset.tab as Tab;
      rerender();
      return;
    }
    const pack = target.closest<HTMLButtonElement>(".buy-coins");
    if (pack) {
      pack.disabled = true; // (one order at a time)
      void buyCoinPack().then((result) => {
        if (result === "error") alert("The purchase didn't go through. Nothing was charged; please try again later.");
        rerender(); // (the coins arrive by themselves when the store approves)
      });
      return;
    }
    if (target.closest(".buy-all")) {
      if (!confirm(`Unlock every stage, level, skin and shape for ${UNLOCK_ALL_COST} coins?`)) return;
      if (buyUnlockAll()) rerender();
      return;
    }
    const open = target.closest<HTMLElement>(".open-box");
    if (open) {
      const kind = open.dataset.kind as Kind;
      const found = KINDS[kind].buy(Number(open.dataset.count));
      if (found.length) openBox(kind, found, rerender);
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-use]");
    if (!button) return;
    KINDS[button.dataset.kind as Kind].use(button.dataset.use!);
    applySkin(activeLook());
    rerender();
  });
  return element;
}

// The box being opened, in a popup: it shakes, its lid pops off, and what was in it comes out:
// a skin in the shape in use, a shape in the skin in use. They are already the player's.
//   - One: its preview board flips in, with its name; Use it puts it on.
//   - Ten (Open 10): the box goes, and the ten come out one after the other, in a grid, each
//     with its name; tapping one picks it, Use it puts the picked one on.
// Without motion (the player asked for less), they are shown right away.
function openBox(kind: Kind, found: Found[], rerender: () => void) {
  const k = KINDS[kind];
  const many = found.length > 1;
  const dialog = document.createElement("dialog");
  dialog.className = `app-dialog box-dialog${many ? " many" : ""}`;
  const haul = found.map((f, i) => `<button type="button" class="haul-item" data-id="${f.id}"
      style="${k.style(f.id)}; --i: ${i}" aria-pressed="false">${PREVIEW}<span>${f.name}</span></button>`).join("");
  dialog.innerHTML = `<div class="dialog-box">
    <div class="box-stage">
      ${BOX}
      ${many ? "" : `<div class="box-prize" style="${k.style(found[0].id)}">${PREVIEW}</div>`}
    </div>
    ${many ? `<div class="box-haul">${haul}</div>` : ""}
    <p class="box-result" aria-live="polite"></p>
    <div class="box-actions">
      <button type="button" class="later">${many ? "Done" : "Later"}</button>
      <button type="button" class="primary use-now"${many ? " disabled" : ""}>Use it</button>
    </div>
  </div>`;
  document.body.append(dialog);

  const stage = dialog.querySelector<HTMLElement>(".box-stage")!;
  const result = dialog.querySelector<HTMLElement>(".box-result")!;
  const useNow = dialog.querySelector<HTMLButtonElement>(".use-now")!;
  const reveal = () => {
    stage.classList.add("opened");
    result.innerHTML = many
      ? `${found.length} new ${k.noun}s! <small>Tap one to put it on.</small>`
      : `New ${k.noun}: <strong>${found[0].name}</strong>`;
    dialog.classList.add("revealed");
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveal();
  } else {
    stage.classList.add("shaking");
    stage.addEventListener("animationend", reveal, { once: true });
  }

  // (one of the ten picked to put on)
  let picked: string | null = many ? null : found[0].id;
  for (const item of dialog.querySelectorAll<HTMLButtonElement>(".haul-item")) {
    item.addEventListener("click", () => {
      picked = item.dataset.id!;
      dialog.querySelectorAll(".haul-item").forEach((i) => i.setAttribute("aria-pressed", String(i === item)));
      useNow.disabled = false;
    });
  }

  let use = false;
  useNow.addEventListener("click", () => {
    use = true;
    dialog.close();
  });
  dialog.querySelector(".later")!.addEventListener("click", () => dialog.close());
  const close = () => dialog.close();
  window.addEventListener("hashchange", close, { once: true });
  dialog.addEventListener("close", () => {
    window.removeEventListener("hashchange", close);
    dialog.remove();
    if (use && picked) {
      k.use(picked);
      applySkin(activeLook());
    }
    if (location.hash.startsWith("#/shop")) rerender(); // (the coins and the collection changed)
  });
  dialog.showModal();
}
