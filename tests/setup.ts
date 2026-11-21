// Run before every test file (see vite.config.ts): the device's storage (Capacitor Preferences)
// becomes a Map in memory, emptied before each test. `saved` is that Map.
import { beforeEach, vi } from "vitest";

const store = new Map<string, string>();
(globalThis as { savedPrefs?: Map<string, string> }).savedPrefs = store;

vi.mock("@capacitor/preferences", () => {
  const map = (globalThis as unknown as { savedPrefs: Map<string, string> }).savedPrefs;
  return {
    Preferences: {
      get: async ({ key }: { key: string }) => ({ value: map.get(key) ?? null }),
      set: async ({ key, value }: { key: string; value: string }) => void map.set(key, value),
      remove: async ({ key }: { key: string }) => void map.delete(key),
    },
  };
});

beforeEach(() => store.clear());
