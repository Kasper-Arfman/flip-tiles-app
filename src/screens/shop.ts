// The shop: spend coins. For now it sells skins (the two colors of the tiles). Each skin is a card
// with a small board in its colors; a skin is bought once, and then can be put on at any time.
import { SKIN_COST, activeSkin, buySkin, coins, ownsSkin, useSkin } from "../progress";
import { SKINS, SKIN_GROUPS, applySkin, type Skin } from "../skins";
import { coin, miniBoard, screen, topbar } from "./ui";

// The board in every preview: a checkerboard, drawn like the level grid's mini boards
const PREVIEW = "10101 01010 10101 01010 10101";

export function shopScreen(rerender: () => void) {
  const card = (skin: Skin) => {
    const owned = ownsSkin(skin.id);
    const inUse = activeSkin() === skin.id;
    const button = inUse
      ? `<button type="button" class="skin-action in-use" disabled>✓ In use</button>`
      : owned
        ? `<button type="button" class="skin-action" data-use="${skin.id}">Use</button>`
        : `<button type="button" class="skin-action primary" data-buy="${skin.id}" ${coins() < SKIN_COST ? "disabled" : ""}>
             Buy · ${coin()} ${SKIN_COST}</button>`;
    // (the card sets the skin's colors on itself, so its preview board shows them)
    return `<li class="skin-card${inUse ? " in-use" : ""}" style="--skin-zero: ${skin.zero}; --skin-one: ${skin.one}">
      ${miniBoard(PREVIEW)}
      <span class="skin-name">${skin.name}</span>
      ${button}
    </li>`;
  };

  // The skins, in their sections
  const sections = SKIN_GROUPS.map(({ group, title }) => `
    <h2 class="shop-section">${title}</h2>
    <ul class="skin-grid">${SKINS.filter((s) => s.group === group).map(card).join("")}</ul>`).join("");

  const element = screen("shop-screen", `
    ${topbar("Shop", "#/", `${coin()} ${coins()}`)}
    ${sections}`);

  element.addEventListener("click", (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>("button[data-buy], button[data-use]");
    if (!button) return;
    const id = button.dataset.buy ?? button.dataset.use!;
    if (button.dataset.buy && !buySkin(id)) return; // not enough coins
    useSkin(id); // a skin just bought goes on right away
    applySkin(id);
    rerender();
  });
  return element;
}
