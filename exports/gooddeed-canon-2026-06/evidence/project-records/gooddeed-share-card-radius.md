---
name: GoodDeed share-card corner radius
description: Approved corner radius for the orange-frame GoodDeed Story share-card, and why Instagram has no spec to match.
---

# GoodDeed share-card corner radius

**Decision:** the approved orange-frame GoodDeed Story share-card uses a **subtle rounded corner (≈ an Instagram feed-photo curve), not square**. Rounding is concentric — outer orange frame and inner art/navy round together.

**Why:** There is **no Meta/Instagram HIG for Story corner radius** — Stories are full-bleed 1080×1920 and the rounding you see is the device screen + IG's UI chrome painted over the asset, not baked in. The only Meta specs that constrain the card are the 1080×1920 / 9:16 size and the top/bottom safe zones. So radius is purely an aesthetic call. The card floats (drop shadow), so a subtle radius reads native; a heavy radius looked like a generic app card and square looked too hard.

**How to apply:**
- Round only when the card is consumed as a **floating / shared image**. If it's ever uploaded **full-bleed** as the whole story background, keep it square — the device clips the corners uniformly anyway.
- Carry the approved radius into the prod renderer (`server/certOgImage.ts` / `/share/cert`) whenever the share-card design is ported from the mockup. Don't re-litigate the no-HIG question — it's settled.
