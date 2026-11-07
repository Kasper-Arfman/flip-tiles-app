# Flip Tiles app

A mobile app (Android + iOS) of the 5x5 tile-flip puzzle: a Vite + TypeScript web app, wrapped
with Capacitor. See README.md for the commands and the file layout.

## The puzzle

A 5x5 board of green (0) and yellow (1) tiles; solved when all tiles have one color. Two moves:
a **flip** changes a tile and its 4 neighbours (cut off by the edges), a **force** changes only
that tile. Order doesn't matter and every move is its own inverse, so making the same move twice
cancels it (the widget's history does exactly that).

## Origin

The game was built for the website (`../astro-website`): `src/components/FlipTiles.astro` (an
Astro component) and `src/lib/flipTiles.ts`, used in the post `src/content/learning/flip_tiles.mdx`.
This app is a port: the Astro markup became `src/game/createFlipTiles.ts`, the component's
`<style>` became `src/game/flip-tiles.css` (plus the site's global button style), and its
`<script>` became `src/game/FlipTilesElement.ts`. Changes made here can be carried back to the
website, and the other way round.

## Solution tables

`public/flip-tiles/fewest_moves.bin.gz` and `fewest_forces.bin.gz` hold, for every board, the
first move of an optimal solution (one byte: bits 0-4 the tile index 5r + c, bit 5 = force,
25 = solved). Only the first half (2^24 boards) is stored: a board and its color inverse share
their move. They were made by the original Python solver in `../flip-tiles/main.py`.

Bit order: in this code and in the tables, tile k (row by row from the top left) is **bit k**
(the top-left tile is the lowest bit). A `start` option such as `0b01000_11100_...` is read
with its first digit as the top-left tile, and converted.

## Notes

- Test in the browser with `npm run dev`; the tile presses, tap-and-hold to force, and the
  animations behave the same in the native web view.
- iOS builds need a Mac with Xcode; Android builds work on Windows with Android Studio.
