// The app's version, in one place: "version" in package.json (e.g. "1.2.3"). This writes it into
// the native projects, where the stores read it (run by `npm run sync`, so by `npm run android`,
// `npm run ios` and `npm run release`):
//   Android  android/app/build.gradle   versionName "1.2.3", versionCode 10203
//   iOS      the Xcode project          MARKETING_VERSION 1.2.3, CURRENT_PROJECT_VERSION 10203
// The code (the build number) is 10000 x major + 100 x minor + patch: it grows with every new
// version, as both stores demand. So: for every upload to a store, raise the version first
// (`npm version patch`, or minor / major), never upload the same version twice.
import { readFileSync, writeFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error(`package.json: version "${version}" must be three numbers, like 1.2.3`);
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 99 || patch > 99) throw new Error(`version ${version}: minor and patch go up to 99`);
const code = major * 10000 + minor * 100 + patch;

const edit = (file, changes) => {
  let text = readFileSync(file, "utf8");
  for (const [pattern, replacement] of changes) {
    if (!pattern.test(text)) throw new Error(`${file}: ${pattern} not found`);
    text = text.replace(pattern, replacement);
  }
  writeFileSync(file, text);
};

edit("android/app/build.gradle", [
  [/versionCode \d+/, `versionCode ${code}`],
  [/versionName "[^"]*"/, `versionName "${version}"`],
]);
edit("ios/App/App.xcodeproj/project.pbxproj", [
  [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
  [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`],
]);
console.log(`Version ${version} (build ${code}) written to Android and iOS`);
