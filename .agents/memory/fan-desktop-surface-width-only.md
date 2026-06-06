---
name: Fan desktop "is desktop?" must be width-only, not buyEnabled-gated
description: Why the album surface choice desynced from the storefront rail on native iPad, and the fix pattern.
---

The fan shell decides "show desktop chrome (left rail + wide layout)?" in more than one
place. Those decisions MUST agree, and they must be **width-only** (`useDesktopShell` /
`useMediaQuery`), never additionally gated on `buyEnabled` (`= !isNative`).

**The bug:** the album page chose its surface with `isDesktop && buyEnabled`. The
storefront/Collection/Search rails are width-only (`useDesktopShell`, ≥1024, no native
gate, because an iPad in the native app is meant to get the SAME desktop chrome). So on
the **native iPad app** `buyEnabled` is false → the album ALWAYS rendered the phone
surface (no rail) while every other tab kept the rail. Operator symptom: "the rail stays
on Collection, then disappears when I open an album — it's like I'm on the iPhone."

**Why it was gated that way:** the desktop album surface (`DesktopAlbumView`) rendered a
visible Buy pill, which violates App Review 3.1.1 in the iOS app — so the whole surface
was swapped to mobile on native instead.

**Fix pattern (the right layering):** make the desktop surface itself purchase-clean when
`buyEnabled` is false — gate the Buy pill on `onBuyBundle` being defined (the host already
passes `onBuyBundle={buyEnabled ? handler : undefined}`), the signed-cert chip on
`signedCertPriceCents` (null on native), and BuySheet on `buyEnabled`. THEN the surface
choice can be purely width-driven (`isDesktop`), so native iPad gets desktop chrome and
native iPhone stays mobile on width alone.

**Why:** keeping App-Review compliance at the *component* level (hide CTAs) rather than the
*surface-selection* level lets every "is desktop?" decision stay width-only and in sync.
A regression test (`desktopAlbumBuyGate.test.ts`) locks the Buy-pill gate so the iOS app
can never re-ship a purchase CTA.

**How to apply:** if you add a new fan desktop/mobile branch, gate it on width only; never
`&& buyEnabled`. Hide native-forbidden CTAs inside the rendered component.
