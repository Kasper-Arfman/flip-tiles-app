// Skins: the two colors of the tiles, bought in the shop. A skin sets two CSS variables on the
// page, --skin-zero and --skin-one, which the board, the level grid's mini boards and the home
// screen's art take their colors from (see styles.css). Stars and the logo keep their gold and
// green.
//
// The hint marks (blue plus, red dot) have a dark outline and the replay's move badges a white
// one, so they show on any color; still, avoid a red or light blue tile color.

export interface Skin {
  id: string;
  name: string;
  zero: string; // the "green" tiles
  one: string; // the "gold" tiles
  group: SkinGroup; // its section in the shop
}

export type SkinGroup = "bright" | "dark";
export const SKIN_GROUPS: { group: SkinGroup; title: string }[] = [
  { group: "bright", title: "Skins: light & bright" },
  { group: "dark", title: "Skins: dark" },
];

export const DEFAULT_SKIN = "classic";

export const SKINS: Skin[] = [
  { id: "classic", name: "Classic", zero: "#2e9e4f", one: "#e3a21a", group: "bright" },
  { id: "lagoon", name: "Lagoon", zero: "#13838f", one: "#e9c46a", group: "bright" },
  { id: "berry", name: "Berry", zero: "#7d3c98", one: "#f4a259", group: "bright" },
  { id: "midnight", name: "Midnight", zero: "#2c3e8c", one: "#f2d64b", group: "bright" },
  { id: "graphite", name: "Graphite", zero: "#3b3f46", one: "#e8e2d6", group: "bright" },
  { id: "cocoa", name: "Cocoa", zero: "#6b4226", one: "#f1d3a1", group: "bright" },
  { id: "blossom", name: "Blossom", zero: "#3d7a5c", one: "#f5b8c8", group: "bright" },
  // A near-black, tinted a little towards its partner, with one strong color
  { id: "carbon", name: "Carbon", zero: "#17191d", one: "#b6e33a", group: "dark" },
  { id: "venom", name: "Venom", zero: "#111612", one: "#39d67a", group: "dark" },
  { id: "amethyst", name: "Amethyst", zero: "#16131c", one: "#9d6bff", group: "dark" },
  { id: "gold-rush", name: "Gold Rush", zero: "#141414", one: "#d4a537", group: "dark" },
  { id: "abyss", name: "Abyss", zero: "#10171a", one: "#22b8b0", group: "dark" },
  { id: "blaze", name: "Blaze", zero: "#161412", one: "#ff8a1f", group: "dark" },
  { id: "cyber", name: "Cyber", zero: "#130f19", one: "#e040b0", group: "dark" },
  { id: "commando", name: "Commando", zero: "#171a14", one: "#8f9d3f", group: "dark" },
  { id: "steel", name: "Steel", zero: "#15181c", one: "#8796a8", group: "dark" },
];

export const findSkin = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];

// Color the page in a skin
export function applySkin(id: string) {
  const skin = findSkin(id);
  document.documentElement.style.setProperty("--skin-zero", skin.zero);
  document.documentElement.style.setProperty("--skin-one", skin.one);
}
