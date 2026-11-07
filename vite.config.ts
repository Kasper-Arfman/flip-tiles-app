import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Offline play on the web (the game installed to a phone's home screen from the website): after
// a build, write the list of the built files into the service worker (src/sw.js, written to
// dist/sw.js), which saves them on the device on the first visit and serves them from there, also
// without a connection. The list's version is a hash of the files, so every build that changes
// anything gives a new service worker, which replaces the old files on the next visit online.
// Left out: the solution tables in flip-tiles/ (megabytes, and the app doesn't use them).
function offline(): Plugin {
  let outDir = "dist";
  return {
    name: "flip-tiles-offline",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else files.push(relative(outDir, path).split(sep).join("/"));
        }
      };
      walk(outDir);
      const kept = files.filter((f) => !f.startsWith("flip-tiles/") && f !== "sw.js").sort();
      const hash = createHash("sha256");
      for (const f of kept) hash.update(f).update(readFileSync(join(outDir, f)));
      const worker = readFileSync("src/sw.js", "utf8")
        .replace("__VERSION__", hash.digest("hex").slice(0, 12))
        .replace("__FILES__", JSON.stringify(["./", ...kept.map((f) => `./${f}`)]));
      writeFileSync(join(outDir, "sw.js"), worker);
    },
  };
}

export default defineConfig({
  // Relative paths in the build: the game then works from any folder of a website (e.g.
  // example.com/flip-tiles/), and inside the native apps
  base: "./",
  plugins: [offline()],
});
