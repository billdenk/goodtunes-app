---
name: get/my domain split + native = player (no buy)
description: How buying vs. playback is split across hosts and why both native apps hide Buy.
---

# get.goodtunes.music vs my.goodtunes.music, and native = player

**The rule.** Buying is a **web-only** function and lives entirely on
`get.goodtunes.music` — a preview + purchase funnel that **never "unlocks" in
place**. After a successful sale the fan is sent to `my.goodtunes.music`, the
owned-content player/library where they actually view & play everything. The
Capacitor **native apps ARE that "my" player experience** — they are for owned
content, never a storefront.

**Consequence in code.** `client/src/lib/platform.ts` `buyEnabled` gates every
Buy affordance (BuySheet, price pill, buy-options prefetch, preview-first 30s
logic, Orders empty-state CTA). As of the Monday-launch spec it is
`!isNative` — i.e. **both iOS and Android native hide all Buy CTAs**; only the
web sells.

**Why:**
- Apple guideline 3.1.1 forbids selling digital goods in an iOS app outside
  StoreKit/IAP — iOS was always no-buy.
- Bill's launch architecture makes native a pure player, so Android was matched
  to the same rule ("browse + play only **for now**").

**How to apply:**
- Android-off is reversible: it was previously `!(isNative && nativePlatform === "ios")`
  (Android kept Buy because Play permits external payment for physical-media
  bundles). Re-gate on `nativePlatform` if that revenue path is ever wanted back.
- A change to `platform.ts` only reaches the native apps when it lands on GitHub
  `main` (Codemagic builds the Capacitor app from there). Web/iOS-TestFlight
  build 52 already had iOS no-buy, so this change matters only for the next
  Android build.
