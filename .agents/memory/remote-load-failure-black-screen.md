---
name: Remote-load failure = permanent black screen on Capacitor
description: A Capacitor app whose server.url points at a live remote host must set server.errorPath, or a failed cold-launch network load leaves the WKWebView permanently black.
---

## The problem

When `capacitor.config.ts` sets `server.url` to a live remote host (rather than
bundling the web payload locally), the very first thing the native app does on
cold launch is a real network request. Capacitor's own navigation-failure
handler (`WebViewDelegationHandler` in `@capacitor/ios`) does nothing visible
on `didFail`/`didFailProvisionalNavigation` unless `server.errorPath` is
configured — no error page, no retry, nothing.

A freshly-created `WKWebView` paints plain **black** before any frame commits,
regardless of any navy `backgroundColor`/`isOpaque` set elsewhere on the
window/webview chrome — that only takes effect once a frame actually renders.

So: no connectivity yet at cold launch, a DNS hiccup, a brief outage, or a slow
cellular handshake all produce the exact same symptom — a permanent black
screen with no way to recover short of force-quitting and relaunching (and
even then, only once the network recovers).

**Why:** this is easy to miss because everything about scene manifests,
`server.url` pointing at the right host, and native Swift wiring can be 100%
correct and you'll still get a black screen — the bug is the *absence* of a
failure-recovery path, not a misconfiguration of the happy path.

**How to apply:** any Capacitor app using a remote `server.url` (as opposed to
a fully bundled local webDir) must set `server.errorPath` to a small bundled
fallback HTML page (ships in the app bundle, not fetched over the network)
that at minimum auto-retries the real load and offers a manual retry button.
This is a device-only failure mode — it depends on real network timing at
launch — so it can't be reproduced in a sandbox; verify via an Airplane Mode
toggle test on a real TestFlight/Play install.
