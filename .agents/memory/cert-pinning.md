---
name: Native download certificate pinning
description: Why/how the native offline-download fetch is TLS-pinned to GoodTunes' own servers, and the traps that brick installs.
---

# Native offline-download certificate pinning

Full doc: `docs/cert-pinning.md`. Durable lessons that aren't obvious from code:

- **Pin the long-lived ISRG (Let's Encrypt) ROOTS, never the leaf/intermediate.**
  GT certs are Let's Encrypt; leaf+intermediate rotate ~60 days, so pinning them
  bricks installs within weeks. Pin ISRG Root X2 (primary, ECDSA), X1 (RSA
  backup), YE (backup). TLS validation evaluates the pin against the full
  verified chain INCLUDING the trust-anchor root even when the server doesn't
  send the root in its handshake.
  **Why:** a single root retirement / CA migration must never be a single point
  of failure, and routine renewals must need zero action.

- **A Capacitor WebView `fetch()` does NOT honor pin config on either platform.**
  So pinning needs TWO layers: (1) route the download fetch through the platform
  HTTP stack (native `SecureKeyStore.pinnedDownload` → URLSession /
  HttpsURLConnection), AND (2) declare pins in `Info.plist` NSPinnedDomains +
  Android `network_security_config.xml`. Config alone does nothing if the bytes
  still come through the WebView.

- **Scope pins to `goodtunes.music` ONLY.** Legacy Dropbox masters
  (`dl.dropboxusercontent.com`) use a CA we don't control — pinning a third
  party is a brick risk, so they stay on normal validation until migrated to
  object storage (which is on my.goodtunes.music → auto-pinned). Mux/Stripe etc.
  unpinned by design.

- **Never silently downgrade.** JS wrapper returns `null` ONLY on
  unavailability (web, or older native binary → Capacitor `code:'UNIMPLEMENTED'`)
  → falls back to WebView fetch. A real pin-mismatch/network error REJECTS and
  propagates, or a MITM could force the unpinned path.

- **Anti-brick nets:** Android `<pin-set expiration="YYYY-MM-DD">` stops
  enforcing after that date (push it forward each release); iOS NSPinnedDomains
  is iOS14+ so it no-ops on iOS13. Recompute pins with openssl from the live
  chain / root PEM — never trust copy/paste.
