import type { CapacitorConfig } from "@capacitor/cli";

// appId must be unique in the app stores, and can't be changed after the first release
const config: CapacitorConfig = {
  appId: "com.kasperarfman.fliptiles",
  appName: "Flip Tiles",
  webDir: "dist",
  // On an iPad too, the web view of a phone (by default an iPad's acts like a desktop browser),
  // so the page's viewport settings count: index.html zooms the game in through them
  ios: { preferredContentMode: "mobile" },
};

export default config;
