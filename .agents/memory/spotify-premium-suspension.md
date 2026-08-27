---
name: Spotify premium-required suspension
description: Spotify can suspend an app's whole Web API (403 "premium subscription required") while its token endpoint keeps answering 200; how the app classifies and pages on it.
---

Spotify requires the developer-app **owner's account to hold active Spotify Premium**. When it lapses (happened live 2026-08-27), the failure mode is deceptive:

- The **token endpoint still answers 200** — token minting, pre-warm, and caching all look healthy.
- **Every Web API call answers 403** with body `{"error":{"status":403,"message":"Active premium subscription required for the owner of the app"}}`.

**How to apply:**
- The Spotify client (server/lib/spotify.ts) classifies this as its own failure reason `premium_required` (match the "premium subscription" phrase, not bare 403 — endpoint-level 403s like /top-tracks on this token tier are normal). It threads through the detailed-candidates result → admin artist-search route → dialogs; legacy simple callers keep the null/empty contract.
- The fix is **account action, never a retry**: renew Premium on the Spotify account that owns the app on developer.spotify.com. UI copy and alert runbooks must say so.
- A proactive probe (`probeSpotifyHealth`) rides the credential-expiry watcher: fresh token + one cheap search twice a day. Premium-403 or fresh-mint 401 = rejected (pages once, throttled); token-mint failure / 429 / 5xx / network = transient (log only); unconfigured = silent. The `ExpiryProbe` union gained a `healthy` kind (log-only) for LIVE-probe sources with no expiry date.
- Ops 5xx alert emails now include a size-capped JSON body snippet (never on auth paths) so structured fields like `reason` reach the pager.

**Why:** a bare "502 Spotify lookup failed" page cost real triage time; the generic reason hid an out-of-code operational fix.
