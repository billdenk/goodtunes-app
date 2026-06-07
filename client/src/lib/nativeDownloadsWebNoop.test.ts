// Task #1664 — guards the single most important safety property of offline
// downloads: on WEB they are a TRUE no-op. Tapping download must never fetch
// or store audio bytes in the browser; it only flips a localStorage flag.
// (Native protection/encryption/revocation can't run under jsdom — it needs
// the Capacitor Filesystem + a real device — so this file pins the web
// contract, and the native paths are guarded by `if (isNative)` throughout
// client/src/lib/nativeDownloads.ts.)
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     client/src/lib/nativeDownloadsWebNoop.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { installTestDom } from "../pages/jsdomHarness";

// Stub static-asset imports + the Vite import.meta.env shim before the module
// graph (platform.ts → @capacitor/core) is imported.
register("../pages/assetStubLoader.mjs", import.meta.url);

installTestDom();

const {
  downloadSong,
  removeDownload,
  offlineSrcFor,
  listDownloadedSongs,
  purgeRevokedDownloads,
  migrateToHardwareKey,
} = await import("./nativeDownloads");
const { getHardwareKeyBytes, isDeviceCompromised } = await import("./nativeSecureKey");
const { isNative } = await import("./platform");

test("the test runs on the web platform (isNative === false)", () => {
  assert.equal(isNative, false);
});

test("downloadSong on web never fetches audio — it only flips the flag", async () => {
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls++;
    throw new Error("web downloads must not fetch audio bytes");
  };

  await downloadSong("album-1", "song-1", "https://cdn.example/song-1.mp3");

  assert.equal(fetchCalls, 0, "fetch must not be called on web");
  assert.ok(listDownloadedSongs("album-1").has("song-1"), "flag persisted");
});

test("offlineSrcFor returns null on web (no real files exist)", async () => {
  const src = await offlineSrcFor("song-1", "https://cdn.example/song-1.mp3");
  assert.equal(src, null);
});

test("removeDownload clears the web flag without touching the filesystem", async () => {
  await removeDownload("album-1", "song-1");
  assert.equal(listDownloadedSongs("album-1").has("song-1"), false);
});

test("purgeRevokedDownloads is a no-op on web (leaves flags untouched)", async () => {
  await downloadSong("album-2", "song-2", "https://cdn.example/song-2.mp3");
  // album-2 is NOT in the owned set — native would purge it, web must not.
  await purgeRevokedDownloads(new Set<string>());
  assert.ok(
    listDownloadedSongs("album-2").has("song-2"),
    "web purge must not remove flags (no real files to revoke)",
  );
});

test("getHardwareKeyBytes returns null on web (no hardware key store)", async () => {
  assert.equal(await getHardwareKeyBytes(), null);
});

test("isDeviceCompromised fails safe to false on web", async () => {
  assert.equal(await isDeviceCompromised(), false);
});

test("migrateToHardwareKey is a no-op on web (no files, never throws)", async () => {
  await migrateToHardwareKey();
});
