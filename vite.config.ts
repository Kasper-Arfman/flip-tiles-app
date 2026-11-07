import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths in the build: the game then works from any folder of a website (e.g.
  // example.com/flip-tiles/), and inside the native apps
  base: "./",
});
