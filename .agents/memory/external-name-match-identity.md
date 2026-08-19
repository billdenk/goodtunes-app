---
name: Name-only external enrichment is not identity
description: Rules for matching a picked artist to another streaming service's catalog (Apple/iTunes, Spotify) by name.
---

Punctuation-stripped "normalized" name equality is NOT identity: "How???" and "$how" both collapse to "how". And a no-match must never fall back to the provider's first result — that silently imports the wrong artist's name/photo over the picked identity.

**Why:** a name-only iTunes lookup once linked the wrong artist for a punctuation-heavy name, overwrote the picked name/photo, and left the operator in a re-add dead-end.

**How to apply:** any name-keyed cross-provider auto-link needs (1) a raw punctuation-preserving, case/diacritic-insensitive compare to count as confident; (2) a loose (punctuation-stripped) match accepted only with corroborating evidence, e.g. a shared release title; (3) otherwise stay unlinked and keep the picked identity — offer the candidate for explicit operator confirmation instead. Also: in scoped portals a duplicate-guard hit against a GLOBAL catalog may be out of the caller's scope — scope-check before navigating to a detail page, and offer to bring the person into scope rather than dead-ending on a 404.
