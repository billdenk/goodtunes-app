---
name: Native gifting gates creation, not redemption
description: Why giftEnabled hides gift-creation UI on native but the /gift/:token claim route stays enabled
---

`giftEnabled = !isNative` (in `lib/platform.ts`, mirrors `buyEnabled`) hides the gift **creation** affordances on native: the per-copy gift cards + whole-order gift controls on the Orders page, and the entire gift block on the post-purchase Welcome screen.

The `/gift/:token` claim/redemption route (`GiftClaim`) is **intentionally left enabled on native** — do not "fix" this by adding a gate.

**Why:** "Mirror buy gating" means gating the *spend/creation* side, because Apple's IAP policy is about purchasing digital goods in-app. Claiming a gift is **free redemption** of an already-paid album (it just moves the order + entitlement to the claimer's account — no payment). Gating it would strand a native recipient who taps a universal `goodtunes.music/gift/...` link with the app installed: they'd be unable to claim a gift they were sent.

**How to apply:** when gating a gifting/commerce surface on native, gate the action that *spends money or creates a paid artifact*, and leave free redemption/consumption paths open. Same logic as: buying is gated, playing an album you already own is not.
