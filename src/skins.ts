// The look of the tiles, in two separate parts, both found in the shop's mystery boxes, which go
// together in any combination:
//   - a skin: the tiles' two colors
//   - a shape: the outline of every tile (a heart, a paw, a flower, a strawberry, ...; or the
//     plain square)
// Together they set CSS variables on the page: --skin-zero and --skin-one (the colors), which the
// board, the level grid's mini boards and the home screen's art take their colors from, and
// --skin-shape (the shape, as a mask image, or none), which the board's tiles and the shop's
// previews take their outline from (see styles.css). Stars and the logo keep their gold and green.
//
// The hint and move marks (blue and red diamonds) have a dark edge and the replay's move badges a white
// one, so they show on any color; still, avoid a red or light blue tile color. They sit in the
// middle of the tile, so every shape covers the middle.
//
// Classic and the square are every player's from the start; the other 25 skins and 12 shapes
// are what the coins of the game buy. (A skin taken out of the game is taken out of a player's
// wallet too, when it loads: see loadProgress.)

export interface Skin {
  id: string;
  name: string;
  zero: string; // the "green" tiles
  one: string; // the "gold" tiles
  group: SkinGroup; // its section in the shop
}

export interface Shape {
  id: string;
  name: string;
  // The tile's outline: SVG shapes in a 24 x 24 box (what they cover is the tile, the rest is cut
  // away; holes with fill-rule evenodd). None: the square tile.
  outline?: string;
  // A two-color shape: a detail drawn over the tile in its other color (a daisy's core, a
  // strawberry's leaves, ...), SVG shapes in the same box, in `currentColor`
  detail?: string;
}

export type SkinGroup = "rich" | "bright" | "dark";
export const SKIN_GROUPS: { group: SkinGroup; title: string }[] = [
  { group: "bright", title: "Colors: light & bright" },
  { group: "rich", title: "Colors: rich & sweet" },
  { group: "dark", title: "Colors: dark" },
];

export const DEFAULT_SKIN = "classic";
export const SQUARE = "square";

export const SKINS: Skin[] = [
  { id: "classic", name: "Classic", zero: "#2e9e4f", one: "#e3a21a", group: "bright" },


  // Light & bright: two colors
  { id: "lagoon", name: "Lagoon", zero: "#13838f", one: "#e9c46a", group: "bright" },
  { id: "berry", name: "Berry", zero: "#7d3c98", one: "#f4a259", group: "bright" },
  { id: "graphite", name: "Graphite", zero: "#3b3f46", one: "#e8e2d6", group: "bright" },
  { id: "cocoa", name: "Cocoa", zero: "#6b4226", one: "#f1d3a1", group: "bright" },
  { id: "blossom", name: "Blossom", zero: "#3d7a5c", one: "#f5b8c8", group: "bright" },


  // Rich & sweet
  { id: "kitty", name: "Lilac", zero: "#4a3b6b", one: "#ffc2d9", group: "rich" },
  { id: "puppy", name: "Denim", zero: "#3e6fb0", one: "#ffd9a8", group: "rich" },
  { id: "sakura", name: "Plum", zero: "#5e3550", one: "#ffb7c9", group: "rich" },
  { id: "sweetheart", name: "Raspberry", zero: "#c2185b", one: "#ffe1ec", group: "rich" },
  { id: "starry", name: "Starlight", zero: "#1b2352", one: "#ffd75e", group: "rich" },
  { id: "galaxy", name: "Nebula", zero: "#24124a", one: "#b9a4ff", group: "rich" },
  { id: "frost", name: "Ice", zero: "#1f4e79", one: "#e3f2ff", group: "rich" },
  { id: "forest", name: "Moss", zero: "#1e4d2b", one: "#a8d672", group: "rich" },
  { id: "spooky", name: "Pumpkin", zero: "#2a1a3a", one: "#ff7a1a", group: "rich" },
  // { id: "aquarium", name: "Reef", zero: "#0b5d8a", one: "#7fe3d6", group: "rich" },
  { id: "watermelon", name: "Melon", zero: "#2e8b3d", one: "#ff5d73", group: "rich" },


  // Dark: a near-black, tinted a little towards its partner, with one strong color
  { id: "carbon", name: "Bumblebee", zero: "#17191d", one: "#ffd21f", group: "dark" }, // (black and yellow)
  { id: "venom", name: "Venom", zero: "#111612", one: "#39d67a", group: "dark" },
  { id: "amethyst", name: "Amethyst", zero: "#16131c", one: "#9d6bff", group: "dark" },
  { id: "gold-rush", name: "Gold Rush", zero: "#141414", one: "#d4a537", group: "dark" },
  // { id: "abyss", name: "Abyss", zero: "#10171a", one: "#22b8b0", group: "dark" },
  { id: "blaze", name: "Blaze", zero: "#161412", one: "#ff8a1f", group: "dark" },
  { id: "cyber", name: "Cyber", zero: "#130f19", one: "#e040b0", group: "dark" },
  { id: "commando", name: "Commando", zero: "#171a14", one: "#8f9d3f", group: "dark" },
  { id: "steel", name: "Steel", zero: "#15181c", one: "#8796a8", group: "dark" },
];

// --- the shapes -----------------------------------------------------------------------------
// Each fills most of its 24 x 24 box, so the tile stays easy to tap, and covers the middle,
// where the marks go.

const circle = (cx: number, cy: number, r: number) =>
  `<circle cx="${+cx.toFixed(2)}" cy="${+cy.toFixed(2)}" r="${r}"/>`;

// n round petals at distance d around the middle, with a heart of radius `heart`
const petals = (n: number, d: number, r: number, heart: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return circle(12 + d * Math.cos(a), 12 + d * Math.sin(a), r);
  }).join("") + circle(12, 12, heart);

// A hole for an eye or a seed: an ellipse, drawn the other way round (for fill-rule evenodd)
const hole = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;

// n narrow pointed petals around the middle, from distance `from` out to the edge of the box
// (each petal: from inside the core up to its tip at the top, out along one curve and back along
// its mirror image, then turned into place)
const rays = (n: number, from: number) => {
  const base = 13 - from; // (a little inside the core, so petal and core join)
  const bulge = 10 - from; // (how high the petal is widest)
  return Array.from({ length: n }, (_, i) =>
    `<path d="M12 ${base}C10 ${bulge} 10.6 2 12 .4C13.4 2 14 ${bulge} 12 ${base}z"
      transform="rotate(${(360 / n) * i} 12 12)"/>`).join("");
};

// The heart, in the 24 x 24 box
const HEART = "M12 22.6S.6 15.8.6 8.3A5.8 5.8 0 0 1 12 5.5a5.8 5.8 0 0 1 11.4 2.8c0 7.5-11.4 14.3-11.4 14.3z";

// (the strawberry's leaves: part of its outline, and its detail, so they are in the other color)
const STRAWBERRY_LEAVES = "M12 7.2L8.6.8 12 3.6 15.4.8zM12 6.6L3.2 3.4l6.6.4zM12 6.6l8.8-3.2-6.6.4z";

export const SHAPES: Shape[] = [
  { id: SQUARE, name: "Square" },
  // (a shine at the top left)
  { id: "round", name: "Bubble", outline: circle(12, 12, 11.5),
    detail: `<ellipse cx="6.8" cy="6.8" rx="2.6" ry="1.6" transform="rotate(-45 6.8 6.8)" fill="currentColor"/>` },
  // (a smaller heart inside, as a line)
  { id: "heart", name: "Heart",
    outline: `<path d="${HEART}"/>`,
    detail: `<path d="${HEART}" transform="translate(12 13) scale(0.56) translate(-12 -13)" stroke="currentColor"
      stroke-width="2.3" stroke-linejoin="round" fill="none"/>` },
  { id: "paw", name: "Paw",
    outline: `<ellipse cx="12" cy="15.6" rx="7" ry="6.4"/>` +
      circle(3.9, 8.6, 2.9) + circle(8.9, 3.6, 3.1) + circle(15.1, 3.6, 3.1) + circle(20.1, 8.6, 2.9) },
  // Two flowers, told apart by their petals: five big round ones and a small core, or twelve
  // narrow pointed ones around a big core
  { id: "flower", name: "Flower", outline: petals(5, 6.4, 5.4, 6), detail: `<circle cx="12" cy="12" r="3" fill="currentColor"/>` },
  { id: "daisy", name: "Daisy", outline: rays(12, 5.4) + circle(12, 12, 5.4),
    detail: `<circle cx="12" cy="12" r="4.6" fill="currentColor"/>` },
  { id: "star", name: "Star",
    outline: `<path d="M12 .6l3.5 7.2 7.9 1.1-5.7 5.6 1.4 7.9L12 18.6l-7.1 3.8 1.4-7.9L.6 8.9l7.9-1.1z"/>` },
  // (its seeds are little holes; its leaves, a crown on top, in the other color)
  { id: "strawberry", name: "Strawberry",
    outline: `<path fill-rule="evenodd" d="M12 23.4C6.6 21 1.6 15.3 1.6 10.2c0-3 2.4-4.6 5-4.6 2.1 0 3.6.8 5.4.8s3.3-.8 5.4-.8c2.6 0 5 1.6 5 4.6 0 5.1-5 10.8-10.4 13.2z
      ${hole(7.9, 10.2, 0.8, 1.1)}${hole(16.1, 10.2, 0.8, 1.1)}${hole(8.5, 15.6, 0.8, 1.1)}${hole(15.5, 15.6, 0.8, 1.1)}
      ${hole(12, 19, 0.8, 1.1)}"/><path d="${STRAWBERRY_LEAVES}"/>`,
    detail: `<path d="${STRAWBERRY_LEAVES}" fill="currentColor"/>` },
  // (its eyes are holes; the inside of its ears and its nose in the other color)
  { id: "kitty", name: "Kitty",
    outline: `<path fill-rule="evenodd" d="M2.8 9.2L4.6 1.6l5 4.4h4.8l5-4.4 1.8 7.6c1.2 1.8 1.8 3.6 1.8 5.4 0 5.4-4.8 8.4-11 8.4S1 20 1 14.6c0-1.8.6-3.6 1.8-5.4z
      ${hole(7.6, 13.4, 1.5, 1.7)}${hole(16.4, 13.4, 1.5, 1.7)}"/>`,
    detail: `<path d="M4.6 7.4l.9-3.6 2.6 2.4zM19.4 7.4l-.9-3.6-2.6 2.4zM10.6 16.4h2.8L12 18z" fill="currentColor"/>` },
  { id: "ghost", name: "Ghost",
    outline: `<path fill-rule="evenodd" d="M3.2 23V11.2a8.8 8.8 0 0 1 17.6 0V23l-2.9-2.2-2.9 2.2-3-2.2-3 2.2-2.9-2.2z
      ${hole(8.8, 11.2, 1.7, 2)}${hole(15.2, 11.2, 1.7, 2)}"/>` },
  // (its vein in the other color)
  { id: "leaf", name: "Leaf", outline: `<path d="M1.5 22.5C1.5 9.5 9.5 1.5 22.5 1.5c0 13-8 21-21 21z"/>`,
    detail: `<path d="M3.5 20.5L18.5 5.5M8 16v-4.6M12 12V7.4M8 16h4.6M12 12h4.6" stroke="currentColor" stroke-width="1.2"
      stroke-linecap="round" fill="none"/>` },
  // (three jewels on its band)
  { id: "crown", name: "Crown", outline: `<path d="M.8 6.5l6 5.4L12 2l5.2 9.9 6-5.4-2.4 15.4H3.2z"/>`,
    detail: circle(7, 17.6, 1.5).replace("/>", ` fill="currentColor"/>`) +
      `<path d="M12 15.6l1.8 2-1.8 2-1.8-2z" fill="currentColor"/>` + circle(17, 17.6, 1.5).replace("/>", ` fill="currentColor"/>`) },
  // (a smaller hexagon inside, as a line)
  { id: "hexagon", name: "Honeycomb", outline: `<path d="M12 .5l10 5.75v11.5L12 23.5 2 17.75V6.25z"/>`,
    detail: `<path d="M12 4.6l6.4 3.7v7.4L12 19.4l-6.4-3.7V8.3z" stroke="currentColor" stroke-width="1.3" fill="none"
      stroke-linejoin="round"/>` },
];

export const findSkin = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const findShape = (id: string) => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

// SVG shapes in the 24 x 24 box as a CSS image, `currentColor` being `color`
const svgImage = (shapes: string, color: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="${color}" fill="${color}">${shapes}</svg>`
      .replace(/\s+/g, " "),
  ).replace(/'/g, "%27")}")`;

// A shape as a CSS mask image (black where the tile is)
const shapeImage = (outline: string) => svgImage(outline, "#000");

// A whole look: a skin and a shape (by id)
export interface Look { skin: string; shape: string }

// The CSS variables of a look: the skin's colors, the shape (none for the square), and a
// two-color shape's detail, per tile color, in the other color (none for a one-color shape)
export function skinVariables(look: Look): Record<string, string> {
  const skin = findSkin(look.skin);
  const shape = findShape(look.shape);
  return {
    "--skin-zero": skin.zero,
    "--skin-one": skin.one,
    "--skin-shape": shape.outline ? shapeImage(shape.outline) : "none",
    "--skin-detail-zero": shape.detail ? svgImage(shape.detail, skin.one) : "none",
    "--skin-detail-one": shape.detail ? svgImage(shape.detail, skin.zero) : "none",
  };
}

// The variables as a style attribute's text (for a preview in that look)
export const skinStyle = (look: Look) =>
  Object.entries(skinVariables(look)).map(([name, value]) => `${name}: ${value}`).join("; ")
    .replace(/"/g, "&quot;");

// Put the page in a look
export function applySkin(look: Look) {
  for (const [name, value] of Object.entries(skinVariables(look))) {
    document.documentElement.style.setProperty(name, value);
  }
}
