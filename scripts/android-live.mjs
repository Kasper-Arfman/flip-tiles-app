// npm run android:live: the app on an Android phone (USB), loading the game from the dev server
// (npm run dev, in another terminal) and reloading whenever a file is saved. See README:
// "Live reload on your phone".
//
// Gradle (Android's build tool) needs Java. Android Studio comes with its own; a terminal only
// finds it through JAVA_HOME. When that isn't set (or a terminal was opened before it was), this
// script uses Android Studio's Java by itself.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const env = { ...process.env };
if (!env.JAVA_HOME || !existsSync(join(env.JAVA_HOME, "bin"))) {
  const candidates = [
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    join(env.LOCALAPPDATA ?? "", "Programs", "Android Studio", "jbr"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home", // (a Mac)
  ];
  const found = candidates.find((dir) => existsSync(join(dir, "bin")));
  if (found) {
    env.JAVA_HOME = found;
    console.log(`(Java: Android Studio's, ${found})`);
  } else {
    console.error("No Java found: install Android Studio, or set JAVA_HOME to a Java (17 or newer).");
    process.exit(1);
  }
}

// The phone reaches the dev server through the USB cable: "adb reverse" makes the phone's
// localhost:5173 the computer's. It is gone when the phone is unplugged or adb restarts, so it is
// set for every connected phone after installing, and `npm run android:tunnel` sets it again
// without building anything.
function tunnel() {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? join(env.LOCALAPPDATA ?? "", "Android", "Sdk");
  const adb = existsSync(join(sdk, "platform-tools", "adb.exe")) ? join(sdk, "platform-tools", "adb.exe")
    : existsSync(join(sdk, "platform-tools", "adb")) ? join(sdk, "platform-tools", "adb") : "adb";
  const devices = execFileSync(adb, ["devices"], { encoding: "utf8" }).split("\n").slice(1)
    .map((line) => line.trim().split(/\s+/)).filter(([id, state]) => id && state === "device").map(([id]) => id);
  if (!devices.length) {
    console.error("No phone connected (USB debugging on, and the computer allowed on the phone?).");
    return false;
  }
  for (const id of devices) {
    execFileSync(adb, ["-s", id, "reverse", "tcp:5173", "tcp:5173"]);
    console.log(`Tunnel set: ${id} localhost:5173 -> this computer's dev server (keep npm run dev running)`);
  }
  return true;
}

if (process.argv.includes("--tunnel")) process.exit(tunnel() ? 0 : 1);

const args = ["cap", "run", "android", "--live-reload", "--host", "localhost", "--port", "5173", "--forwardPorts", "5173:5173", ...process.argv.slice(2)];
const child = spawn("npx", args, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => {
  if (code === 0) tunnel();
  process.exit(code ?? 0);
});
