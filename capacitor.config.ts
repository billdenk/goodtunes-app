import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell config for the GoodTunes native apps (iOS + Android).
 *
 * The native binary loads the LIVE player site (`server.url` below) rather
 * than the bundled `dist/public` payload. This is deliberate:
 *
 *   The whole app talks to the backend through RELATIVE URLs — `fetch("/api/me")`
 *   in useAuth, every TanStack query key ("/api/..."), all image/asset paths
 *   ("/goodtunes-logo-white-sm.png", "/objects/uploads/...", "/figmaAssets/..").
 *   Those resolve against the page ORIGIN. On the web that origin is the server,
 *   so everything works. Inside a bundled native build the origin is
 *   `capacitor://localhost` — there is no backend there, so EVERY /api call
 *   hangs (the auth gate spins forever) and every image 404s to iOS's gray
 *   broken-image placeholder. That's the static navy "share-icon + spinner"
 *   screen.
 *
 *   Pointing `server.url` at the real player host makes the native webview load
 *   the exact same site the browser does, so relative /api + assets resolve
 *   against my.goodtunes.music and the app behaves identically to the website.
 *   Native gating still works: Capacitor.isNativePlatform() / getPlatform()
 *   don't care about the URL, so buyEnabled=false, chat hidden, and on-device
 *   downloads (Capacitor Filesystem) all stay correct (see client/src/lib/platform.ts).
 *
 * `npm run build` still writes the SPA to `dist/public` and `cap sync` still
 * copies it in (it's the fallback if server.url is ever cleared), but the
 * shipped app renders from the remote URL.
 *
 * See `docs/native-builds.md` for the full cut-a-build runbook.
 */
const config: CapacitorConfig = {
  appId: "Io.GoGoods.music",
  appName: "GoodTunes",
  webDir: "dist/public",
  server: {
    // The native app IS the "my" player — the owned-content experience that
    // lives at my.goodtunes.music. Loading it directly gives the webview a
    // real origin with the real backend behind it.
    url: "https://my.goodtunes.music",
    cleartext: false,
    // Keep OAuth + cross-host fan navigation INSIDE the webview instead of
    // bouncing to Safari (which would break the session round-trip). The fan
    // family hosts plus the Google/Apple sign-in domains. NOTE: Google may
    // still refuse OAuth inside an embedded webview ("disallowed_useragent");
    // the reviewer demo account uses email + password, so review is unaffected.
    allowNavigation: [
      "my.goodtunes.music",
      "get.goodtunes.music",
      "goodtunes.music",
      "accounts.google.com",
      "appleid.apple.com",
    ],
  },
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
