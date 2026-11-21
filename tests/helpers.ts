// What the tests share: starting the app on a given save, and reading what it saved.
import { vi } from "vitest";

export const saved = (globalThis as unknown as { savedPrefs: Map<string, string> }).savedPrefs;

// What is saved under a key, read back (null: nothing)
export const readSaved = (key: string) => JSON.parse(saved.get(key) ?? "null");

// Start the app as a phone does: with these saved values (key -> value, as the game saves them;
// a string is saved as it is, to test broken saves), fresh modules (nothing left in memory
// from before), and the progress loaded. Returns the modules, from the same start.
export async function startApp(seed: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(seed)) saved.set(key, typeof value === "string" ? value : JSON.stringify(value));
  vi.resetModules();
  const progress = await import("../src/progress");
  const levels = await import("../src/levels/levels");
  await progress.loadProgress();
  return { ...progress, ...levels };
}

// Start the app again on what is saved now (the app closed and opened)
export const restartApp = () => startApp();
