// Before a version goes to the stores (run by `npm run release`, or alone: `npm run release-check`):
// stops with a list of what is wrong, so a test version can't reach players by accident.
//   - TEST_BUILD and DEV_MODE (src/dev.ts) are off: no free coins, no hidden skins on show
//   - the privacy policy (public/privacy.html) has its contact filled in
//   - the ads use your own AdMob ids (not Google's test samples or the placeholders)
//   - everything is committed: the build then says exactly which commit the players have
//     (the version line on the debug screen), and it can be found again in git
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const problems = [];
const dev = readFileSync("src/dev.ts", "utf8");
if (!/export const TEST_BUILD = false;/.test(dev)) problems.push("src/dev.ts: TEST_BUILD must be false (the coin pack is free in a test build)");
if (!/export const DEV_MODE = false;/.test(dev)) problems.push("src/dev.ts: DEV_MODE must be false");
if (readFileSync("public/privacy.html", "utf8").includes("CONTACT_EMAIL_HERE")) {
  problems.push("public/privacy.html: fill in the contact address (CONTACT_EMAIL_HERE)");
}
if (readFileSync("src/ranked/online.ts", "utf8").includes("YOUR-SITE")) {
  problems.push("src/ranked/online.ts: set SERVER_URL to the Netlify site (the apps send leaderboard games there)");
}
// Ads: the real AdMob ids, not Google's samples or the placeholders (docs/developer/monetization.md)
const SAMPLE_APP_ID = "ca-app-pub-3940256099942544";
if (/X{6}/.test(readFileSync("src/monetization.ts", "utf8").match(/export const ADMOB = \{[\s\S]*?\};/)?.[0] ?? "X".repeat(6))) {
  problems.push("src/monetization.ts: fill in your AdMob rewarded ad units (ADMOB)");
}
if (readFileSync("android/app/src/main/AndroidManifest.xml", "utf8").includes(SAMPLE_APP_ID)) {
  problems.push("android/app/src/main/AndroidManifest.xml: put your AdMob Android app id in com.google.android.gms.ads.APPLICATION_ID");
}
if (readFileSync("ios/App/App/Info.plist", "utf8").includes(SAMPLE_APP_ID)) {
  problems.push("ios/App/App/Info.plist: put your AdMob iOS app id in GADApplicationIdentifier");
}
if (readFileSync("public/app-ads.txt", "utf8").includes("pub-XXXX")) {
  problems.push("public/app-ads.txt: put your AdMob publisher id in it (pub-...)");
}
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`package.json: version "${version}" must be like 1.2.3`);
try {
  const changes = execSync("git status --porcelain", { encoding: "utf8" }).trim();
  const files = changes.split("\n");
  if (changes) {
    problems.push(`uncommitted changes in ${files.length} files: commit them first\n` +
      files.slice(0, 10).map((l) => `      ${l}`).join("\n") + (files.length > 10 ? "\n      ..." : ""));
  }
} catch {
  problems.push("git didn't answer: is this the project folder?");
}

if (problems.length) {
  console.error(`\nNot ready for release:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
  process.exit(1);
}
console.log(`Release check passed: version ${version}.`);
