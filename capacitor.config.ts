import type { CapacitorConfig } from "@capacitor/cli";

// appId must be unique in the app stores, and can't be changed after the first release
const config: CapacitorConfig = {
  appId: "com.kasperarfman.fliptiles",
  appName: "Flip Tiles",
  webDir: "dist",
};

export default config;
