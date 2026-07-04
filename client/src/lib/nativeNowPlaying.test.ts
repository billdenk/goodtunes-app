// Task #2505 — the lock-screen / background-audio plugin itself is native code
// that can't run under jsdom (it needs a real iOS device). What IS verifiable
// here is the one piece of TS wiring that decides whether the iOS lock screen
// gets *fetchable* artwork: `absolutizeArtwork`. Album art is stored as an
// app-relative path, but the native plugin fetches it with a native URLSession
// outside the WebView, where a relative URL has no host and silently fails.
// This pins the absolutization contract so that regression can't quietly break
// lock-screen artwork again.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/lib/nativeNowPlaying.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../pages/jsdomHarness";

// Stub static-asset imports + the Vite import.meta.env shim before the module
// graph (nativeNowPlaying.ts → platform.ts → @capacitor/core) is imported.
register("../pages/assetStubLoader.mjs", import.meta.url);

// jsdom default origin is http://localhost — relative artwork resolves against it.
installTestDom({ url: "https://my.goodtunes.music/collection" });

const { absolutizeArtwork } = await import("./nativeNowPlaying");

test("undefined / empty artwork stays undefined", () => {
  assert.equal(absolutizeArtwork(undefined), undefined);
  assert.equal(absolutizeArtwork(""), undefined);
});

test("app-relative artwork is absolutized against the WebView origin", () => {
  assert.equal(
    absolutizeArtwork("/objects/uploads/abc.jpg"),
    "https://my.goodtunes.music/objects/uploads/abc.jpg",
  );
  assert.equal(
    absolutizeArtwork("/figmaAssets/cover.png"),
    "https://my.goodtunes.music/figmaAssets/cover.png",
  );
});

test("already-absolute http(s) / data URLs pass through unchanged", () => {
  const https = "https://cdn.example.com/art.jpg";
  assert.equal(absolutizeArtwork(https), https);
  const http = "http://cdn.example.com/art.jpg";
  assert.equal(absolutizeArtwork(http), http);
  const data = "data:image/png;base64,AAAA";
  assert.equal(absolutizeArtwork(data), data);
});
