---
name: Silent publish-build failure leaves stale deployment
description: Why "I published repeatedly but nothing changed" is usually a failing build step, not caching
---

# "I published but nothing changed" → check the build, not the cache

`npm run build` (what Replit Publish runs) has TWO stages: the Vite client
bundle, then an esbuild **server** bundle (`building server...` → `dist/index.cjs`).
A broken import or unresolved module in any server file (e.g. a stray
`await import("./auth/session")` when the function is already module-scope in the
same file) fails the esbuild stage with a non-zero exit. Replit deploy then keeps
serving the **last good bundle**, so the operator publishes over and over and the
live site never changes.

**Diagnose deployment staleness directly — do not chase webview/HTTP cache:**
- `curl -s https://my.goodtunes.music/ | grep -oE 'assets/[A-Za-z0-9_.-]+\.(js|css)'`
  to read the *deployed* bundle hash, then `curl` that bundle and grep for a
  string-literal marker of your change (CSS values, `safe-area-inset` calc
  numbers, etc. survive minification). If your change isn't in the live bundle,
  the deploy is stale.
- Run `npm run build` locally — it fails the SAME way Publish does. The client
  bundle can succeed and print asset sizes while the **server** step below it
  errors; read past the Vite output to the `building server...` line.

**Why:** the index.html cache headers are already correct (`no-store`,
content-hashed immutable assets in `server/static.ts`), so a fresh load always
gets the latest *successful* deploy. The failure mode is upstream of caching.

## Native "iPhone-blown-up on iPad" can be the OLD deployed bundle
The native app loads the LIVE site via `capacitor.config.ts` `server.url`. So a
native-only layout bug may not be a native/Capacitor config problem at all — it
can be the **stale deployed web bundle**. Concretely: the old `useDesktopShell`
was gated `width≥1024 && !isNative`, which force-disabled the desktop shell on the
native app regardless of width → every iPad screen looked like a scaled iPhone.
The width-only fix cures it, but only after a *successful* publish.
`TARGETED_DEVICE_FAMILY` was already `"1,2"` (universal), so it was never an
iPhone-compat-mode issue. **Verify what's actually deployed before editing native
config.**
