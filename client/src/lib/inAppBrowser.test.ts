// Task #2128 — unit coverage for the embedded/in-app-browser detector that
// gates the "Sign in with Google" interception on the login screen.
//
// Google returns a raw `403 disallowed_useragent` inside embedded WebViews,
// so we must flag the common host-app browsers (email apps, the Google app,
// Facebook/Instagram, …) WITHOUT ever flagging real mobile Safari/Chrome/
// Firefox/Edge or our own Capacitor app.
//
// Pure function — no DOM needed. Run via Node's built-in test runner:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/lib/inAppBrowser.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { detectInAppBrowser } from "./platform";

// ── Real browsers must NEVER be flagged ──────────────────────────────────────

test("real iOS Safari is not flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), false);
});

test("Chrome on iOS (CriOS) is not flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), false);
});

test("Firefox on iOS (FxiOS) is not flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), false);
});

test("Chrome on Android is not flagged", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  assert.equal(detectInAppBrowser(ua, { isIOS: false, isNative: false }), false);
});

test("desktop Chrome is not flagged", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  assert.equal(detectInAppBrowser(ua, { isIOS: false, isNative: false }), false);
});

test("our own native Capacitor shell is never flagged", () => {
  // A bare iOS WKWebView UA (no Safari/Version) that WOULD look embedded,
  // but isNative short-circuits it.
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: true }), false);
});

// ── Embedded/in-app browsers MUST be flagged ─────────────────────────────────

test("Facebook in-app browser (iOS) is flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0;FBBV/1;FBDV/iPhone14,2]";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), true);
});

test("Instagram in-app browser is flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), true);
});

test("Android System WebView (; wv) is flagged", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36";
  assert.equal(detectInAppBrowser(ua, { isIOS: false, isNative: false }), true);
});

test("the Google app's WebView (GSA) is flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/300.0.0 Safari/604.1";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), true);
});

test("generic iOS WKWebView (email app — no Safari/Version) is flagged", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  assert.equal(detectInAppBrowser(ua, { isIOS: true, isNative: false }), true);
});

test("empty UA is not flagged", () => {
  assert.equal(detectInAppBrowser("", { isIOS: false, isNative: false }), false);
});
