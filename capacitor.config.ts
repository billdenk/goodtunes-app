import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell config for the GoodTunes native apps (iOS + Android).
 *
 * The native binary is a thin wrapper around the same React + Vite app that
 * ships at goodtunes.app. `npm run build` writes the SPA to `dist/public`,
 * which is what Capacitor packages into the binary as the offline-capable
 * webview payload.
 *
 * See `docs/native-builds.md` for the full cut-a-build runbook.
 */
const config: CapacitorConfig = {
  appId: "fm.goodtunes.player",
  appName: "GoodTunes",
  webDir: "dist/public",
  ios: {
    contentInset: "always",
    // Background-audio + universal-links capabilities are declared in
    // Info.plist (UIBackgroundModes=audio) and the Xcode project's
    // Associated Domains (applinks:goodtunes.music). See
    // docs/app-store-submission.md.
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#00062B",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#00062B",
    },
  },
};

export default config;
