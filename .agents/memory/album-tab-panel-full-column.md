---
name: Album tab panels inherit the page column (no inner max-w)
description: Admin album detail tab panels must not add their own max-w wrapper; cards must be exactly as wide as the tab rule.
---

# Album tab panels: no inner max-w wrapper

Every tab panel on the admin album detail page (god-view AdminFrame AND the
partner-portal embedded view) must render its cards at the full page column
width — **exactly as wide as the tab bar's bottom rule**.

**Rule:** never add a `max-w-*` wrapper at a tab panel's root. The column is
already centered + width-capped by the frame (AdminFrame in god-view,
OperatorShell `max-w-5xl/6xl mx-auto` in partner portals), and the tab rule
spans that full column. An inner cap makes the white cards visibly narrower
than the rule and the header above.

**Why:** Bill explicitly signed off on "content column centered, width grows
with the viewport, cards as wide as the rule." It has regressed twice — the
Sell tab once (fixed with an in-code convention comment) and the Shopify
checklist rebuild reintroduced a `max-w-3xl` (Bill caught it by screenshot).
Small max-w on *inner* elements (a two-column field grid, dialogs) is fine —
the rule is about the panel ROOT wrapper.

**How to apply:** when building or rebuilding any album tab panel, the root
return is `<div className="py-6">` + an unconstrained inner div. Check
SellPanel/ShopifyPanel root comments for the canonical wording. Verify by
screenshotting the tab and comparing the card's right edge to the rule's.
