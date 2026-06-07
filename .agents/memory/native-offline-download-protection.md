---
name: Native offline download protection & revocation
description: How native offline downloads are stored/encrypted/revoked, why web is a no-op, and the surprising dead-code playback gap.
---

# Native offline download protection & revocation

Lives in `client/src/lib/nativeDownloads.ts` + `client/src/components/DownloadEntitlementGuard.tsx`.

## Durable facts (not obvious from a quick read)

- **Web is a TRUE no-op.** On web, "download" only flips a `localStorage` flag — it never fetches or stores audio bytes. Every native code path is behind `if (isNative)`. Regression-pinned by `client/src/lib/nativeDownloadsWebNoop.test.ts`.
- **The download UI affordance is Android-only.** `nativeDownloadsEnabled = isNative && nativePlatform === "android"` (`client/src/lib/platform.ts`) — iOS does not expose the download button (a deliberate product/App-Store rollout call). BUT the protect+decrypt+playback code is **platform-agnostic on `isNative`**: if an iOS build ever flips that gate on, encryption, decryption, playback, and revocation all work unchanged.
- **Offline playback is WIRED (offline-FIRST on native).** `PlayerContext`'s source-resolution effect, when `isNative`, first calls `offlineSrcFor(songId, audioUrl)`; a hit decrypts to an in-memory `blob:` URL and attaches it, otherwise it falls through to the Mux signed-URL path. The blob URL is tracked in `offlineBlobRef` and revoked on song-change/unmount. On web `offlineSrcFor` returns null, so the browser is unchanged (still pure Mux) — the web no-op is preserved.

## Encryption / storage design (and why)

- Files: `Directory.Cache/goodtunes/offline/<songId>.enc`, payload `iv(12)||ciphertext` base64, **AES-256-GCM** via WebCrypto.
- **Why Cache dir:** Apple-blessed for re-downloadable content and auto backup-excluded — chosen over manually setting a native `isExcludedFromBackup` flag (no native plugin needed).
- Key: `getDeviceKey()` PREFERS the **hardware-backed** key and falls back to the legacy non-extractable IndexedDB `CryptoKey` (`gt-secure`/`keys`/`offline-master`). Either way it's imported non-extractable so raw bytes never read back out. A copied `.enc` file is useless without the per-device key.
- **Hardware key store (shipped).** In-tree `SecureKeyStore` Capacitor plugin: `ios/App/App/SecureKeyStorePlugin.swift` (Keychain, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — device-bound, no iCloud sync) + `android/.../SecureKeyStorePlugin.java` (random data key sealed by a TEE/StrongBox AndroidKeyStore AES key, ciphertext in private SharedPreferences). JS wrapper `client/src/lib/nativeSecureKey.ts` returns base64 raw 32 bytes (`getHardwareKeyBytes`) or null. **Both plugins are registered by hand** — iOS via 4 pbxproj spots (mirrors SystemVolumePlugin), Android via `registerPlugin(SecureKeyStorePlugin.class)` in `MainActivity.onCreate` BEFORE `super.onCreate`. Cannot compile native here (no Xcode/Gradle); correctness only verified on Mac/CI.
- **One-time migration.** `migrateToHardwareKey()` (run from `DownloadEntitlementGuard` after `migrateLegacyDownloads`) re-encrypts existing `.enc` files legacy→hardware, deletes the IDB key, sets `gt:offline-hw-key-migrated:v1`. Idempotent + best-effort: if no HW key yet it leaves the flag UNSET so a later build can still migrate; un-migrated files self-heal (offlineSrcFor purges + re-downloads on decrypt failure).
- **Compromised-device gate.** `deviceIsCompromised()` (cached) wraps `isDeviceCompromised()` (jailbreak/root probe). On a compromised device `downloadSong` THROWS and `offlineSrcFor` returns null (→ streams). **Fails SAFE**: web / missing plugin / probe error all resolve `false`, never blocking legit users.
- **Still pending:** cert-pinning for download fetches (deliberately deferred — too risky to add untested, could brick the app).

## Revocation

- `DownloadEntitlementGuard` (renders null): native+fan only. Runs `migrateLegacyDownloads` once, then `purgeRevokedDownloads(ownedAlbumIds)` against a **success-gated** `/api/my-albums` snapshot.
- **Fail-OPEN by design:** purge only runs on a *trusted* (successful) ownership snapshot. A failed/empty query must NEVER trigger a purge, or a transient API error would wipe a paying fan's downloads. Re-validates on Capacitor `App` `appStateChange` foreground via `queryClient` invalidate.
