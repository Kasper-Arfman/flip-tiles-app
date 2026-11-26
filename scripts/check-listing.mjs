// Counts the App Store listing's texts (assets/store/listing/app-store.md) against Apple's limits:
//   node scripts/check-listing.mjs
// Each text is the code block after a "**Name** (30):" line; the number is the limit. The coin
// packs' table is checked too (display name 30, description 45).
import { readFileSync } from "node:fs";

const text = readFileSync("assets/store/listing/app-store.md", "utf8");
let problems = 0;
// Symbols and emoji (★, ✓, arrows, ...): App Store Connect refuses them ("invalid characters").
// Plain punctuation, accents and the • bullet are fine.
const SYMBOLS = /[←-⯿]|\p{Extended_Pictographic}/gu;
const report = (what, value, limit) => {
  const ok = [...value].length <= limit;
  if (!ok) problems++;
  console.log(`${ok ? "ok  " : "TOO LONG"}  ${what}: ${[...value].length} / ${limit}`);
  const symbols = [...new Set(value.match(SYMBOLS) ?? [])];
  if (symbols.length) {
    problems++;
    console.log(`INVALID   ${what}: Apple refuses ${symbols.join(" ")}`);
  }
};
for (const [, what, limit, value] of text.matchAll(/\*\*([^*]+)\*\* \((\d+)[^)]*\):?\s*\n+```\n([\s\S]*?)\n```/g)) {
  report(what, value, Number(limit));
  if (what === "Keywords" && / /.test(value)) console.log("      (keywords: no spaces needed after the commas)");
}
for (const [, id, , display, description] of text.matchAll(/^\| `(coins_pack_\d)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)) {
  report(`${id} display name`, display.trim(), 30);
  report(`${id} description`, description.trim(), 45);
}
process.exit(problems ? 1 : 0);
