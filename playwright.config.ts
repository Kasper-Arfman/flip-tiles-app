// The smoke tests (npm run test:e2e): the built game in a real browser, played as a player
// would. Uses the Microsoft Edge that is installed on Windows (no browser download), on a phone-
// sized screen. The tests are in e2e/.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4174/",
    channel: "msedge",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure", // (npx playwright show-trace on the file it names, to see what went wrong)
  },
  // The game as it is shipped: built, then served
  webServer: {
    command: "npx vite build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174/",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
