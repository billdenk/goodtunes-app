# Certificate pinning — native offline downloads

> Tier-3 download hardening. Pairs with the encrypted-at-rest cache and the
> hardware-backed device key (see [`docs/roadmap.md`](./roadmap.md) → DRM ladder
> Tier 3 and [`docs/native-builds.md`](./native-builds.md)).

## What this protects and why

The native apps fetch the master audio bytes for an **offline download** and
encrypt them on-device. Without pinning, a hostile network (rogue Wi-Fi,
corporate TLS proxy, or a mis-issued/compromised CA certificate) could
man-in-the-middle that fetch on a GoodTunes host and substitute the bytes.
Certificate pinning ties the download connection to **GoodTunes' own TLS chain**
so only the real server is trusted.

This is download-fetch hardening, **not** a fan-visible feature — it stays in
the roadmap, not `capabilities.md`.

## The two layers

Pinning only works if the connection runs through a stack that ENFORCES the pin
config. A Capacitor WebView `fetch()` does **not** honor pin config on either
platform, so we do two things:

1. **Route the download fetch through the platform HTTP stack.** The download
   no longer uses a WebView `fetch()`; it calls
   `SecureKeyStore.pinnedDownload({ url })`, which fetches over **URLSession**
   (iOS) / **HttpsURLConnection** (Android). Those stacks enforce the pin
   config below. Wrapper: `client/src/lib/nativeSecureKey.ts`
   (`pinnedDownloadBytes`); call site: `client/src/lib/nativeDownloads.ts`
   (`fetchProtectedBytes`). Native implementations:
   `ios/App/App/SecureKeyStorePlugin.swift`,
   `android/app/src/main/java/fm/goodtunes/player/SecureKeyStorePlugin.java`.

2. **Declare the pins in platform config.**
   - **iOS** — `NSPinnedDomains` under `NSAppTransportSecurity` in
     `ios/App/App/Info.plist` (iOS 14+; ignored on iOS 13 = defense-in-depth).
   - **Android** — `android/app/src/main/res/xml/network_security_config.xml`,
     referenced from `AndroidManifest.xml` via
     `android:networkSecurityConfig`.

   Both are scoped to `goodtunes.music` + subdomains only.

## What we pin: the long-lived ISRG (Let's Encrypt) roots

GoodTunes' certs are issued by **Let's Encrypt**. Its **leaf and intermediate**
certs rotate roughly every **60 days**, so pinning either would brick installs
within weeks. We pin the **ISRG roots**, which are valid into 2035/2040 and
survive every leaf/intermediate renewal. Three pins (one primary + two backups)
so a single root retirement or CA migration is never a single point of failure:

| Pin (SPKI SHA-256, base64)                      | Cert            | Role |
|-------------------------------------------------|-----------------|------|
| `diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=`  | ISRG Root X2    | Primary — ECDSA root both subdomains currently chain to |
| `C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=`  | ISRG Root X1    | Backup — RSA root (R-series / RSA chain) |
| `sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=`  | ISRG Root YE    | Backup — new ECDSA root `get.goodtunes.music` already chains through |

As of this writing `my.goodtunes.music` chains `leaf → E7 → ISRG Root X2` and
`get.goodtunes.music` chains `leaf → YE1 → ISRG Root YE → ISRG Root X2`. Both
terminate at a pinned root, and TLS validation (OkHttp/URLSession on Android/iOS)
evaluates the pin against the full verified chain **including the trust-anchor
root**, even when the server doesn't send the root in its handshake.

### Recompute a pin (don't trust copy/paste)

```sh
# From a live host (whatever is in the served chain):
openssl s_client -connect my.goodtunes.music:443 -servername my.goodtunes.music -showcerts </dev/null 2>/dev/null \
  | awk '/BEGIN CERT/{c++} c' > /tmp/chain.pem
# ...or from a downloaded root PEM (https://letsencrypt.org/certs/):
openssl x509 -in isrgrootx1.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

The string `openssl enc -base64` prints is exactly the value used in both
`NSPinnedDomains` (`SPKI-SHA256-BASE64`) and the Android `<pin digest="SHA-256">`.

## Scope & known limitation — Dropbox masters

The pin config and the native fetch are scoped to `goodtunes.music`. Other hosts
are intentionally left on normal validation so they can **never be bricked** by
this config:

- **Object-storage masters** served at `my.goodtunes.music/objects/...` are
  pinned. ✅
- **Legacy Dropbox-hosted masters** (`dl.dropboxusercontent.com`) are fetched
  over the native HTTP path (off the WebView) but with **normal validation, not
  pinned** — Dropbox uses a different CA we don't control, and pinning a third
  party is a brick risk. They become pinned automatically once migrated to
  object storage. **Action:** migrate remaining Dropbox masters to object
  storage to bring them under the pin.
- Mux, Stripe, etc. — unpinned by design.

## Anti-brick: Android pin-set expiration

`network_security_config.xml` carries `<pin-set expiration="2028-06-01">`. After
that date Android **stops enforcing** the pins and falls back to normal
validation, guaranteeing a stale, un-updated install can never be permanently
locked out by a future CA change. **Push this date forward in every native
release.** iOS `NSPinnedDomains` has no expiration field — its safety valve is
shipping an app update (and the iOS-13 no-op).

## Safe cert / CA rotation runbook

Pinning the root means routine 60-day Let's Encrypt renewals need **no action**.
You only act when **changing CA or root** (e.g. leaving Let's Encrypt, or a root
retirement). Rotate pins BEFORE the server changes, never after:

1. **Add** the new CA/root's SPKI pin as an additional `<pin>` /
   `NSPinnedCAIdentities` entry **alongside** the existing ones (do not remove
   any yet). Bump the Android `expiration`.
2. **Ship an app update** (TestFlight → App Store, Play internal → production)
   and **wait for adoption** — old installs must already trust the new pin
   before the cert they rely on disappears.
3. **Switch the server cert / CA.** Both old and new chains now validate.
4. Once telemetry shows the old cert is fully drained and adoption of the
   updated app is high, **remove the retired pin** in a later release.

Never (a) pin a leaf/intermediate, (b) ship a cert change before the app update
that adds its pin, or (c) leave only one pin with no backup.

## Verification (device / CI only — cannot be done in the Replit container)

The container has no Xcode/Gradle, so pinning is verified on a real build:

1. **Happy path** — install a build, download a song on a normal network, play
   it offline. Must succeed (object-storage/GoodTunes master uses the pinned
   path; Dropbox master uses the native non-pinned path).
2. **MITM is rejected** — put the device behind an intercepting proxy
   (Charles/mitmproxy) with its CA installed in the OS trust store. A normal
   browser request to `my.goodtunes.music` succeeds (proxy CA is trusted), but a
   **download must FAIL** — the pin rejects the proxy's cert. If the download
   succeeds through the proxy, pinning is not taking effect.
3. **No brick on renewal** — confirm a download still works after the live
   leaf/intermediate has rotated (roots unchanged).
4. **Version-skew fallback** — a build predating `pinnedDownload` must still
   download via the WebView fetch (`UNIMPLEMENTED` → fallback).
