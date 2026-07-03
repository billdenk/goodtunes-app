---
name: Person Shopify connect lives on Overview tab
description: The artist/person Shopify store-connect card is under the Overview tab, not the Streaming tab — a naming trap.
---

The `PersonShopifyPanel` ("Artist Shopify store" connect card) and the inline
"Streaming services" (Apple Music / Spotify link) card BOTH render inside the
person **Overview** tab, NOT the "Streaming" tab.

The separate "Streaming" TAB shows the cached Apple Music discography
(DiscographyPanel) — a different thing entirely.

**Why:** the "Streaming services" wording sits right next to the Shopify
connect card, so grepping for "streaming" near the panel misleads you into
naming the wrong tab in operator-facing copy or answers.

**How to apply:** when telling an operator where to connect an artist's Shopify
store (or where the streaming-service links live), say the **Overview** tab.
The OAuth install callback confirms this — the person flow redirects to
`?tab=overview&installed=…` after connecting.
