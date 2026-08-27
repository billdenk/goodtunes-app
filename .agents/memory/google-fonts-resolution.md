---
name: Google Fonts resolution on the fonts check
description: How unembedded PDF fonts are classified (embedded / Google Fonts / needs upload) and the contracts that must hold.
---

The completed-art fonts check carries per-font resolution entries (`fonts?: CompletedFontEntry[]` on the `tmpl.fonts` CheckResult only):
`embedded` / `google` (family exists in the Google Fonts catalog → legally redistributable, mockups can be rendered with it, always shown with a metrics-may-differ caveat) / `missing` (upload font file or outline — Adobe/licensed type can never be fetched programmatically).

**Rules that must hold:**
- The per-font list is ADDITIVE ONLY: the shared `fontsCheckVerdict` status/message never changes with or without a catalog, and the `fonts` field is omitted (not empty-present) when no fonts are detected — this keeps the no-rules deepEqual contract and the shared live-banner verdict intact.
- Catalog fetch (`server/googleFonts.ts`, fonts.google.com/metadata/fonts, strips the `)]}'` prefix) NEVER throws and never blocks a scan: null = unreachable → every unembedded font honestly reports `missing`. Success cached 24h in-memory, failure negative-cached 5min, implausibly small catalogs (<100 families) treated as failure.
- Matching is exact-key only (lowercase alnum), longest-candidate-first (family + style hints re-appended) so `RobotoCondensed-Bold` → "Roboto Condensed" not "Roboto". NO fuzzy/closest fallback — a wrong match is worse than an honest "please upload".
- Name parsing walks style/foundry words from the END; "Roman" preceded by "New" stays in the family (Times New Roman) but is a style word elsewhere (Times-Roman → Times). Don't strip "Pro"/"Std"/"SC" — they're part of real Google family names or keep Adobe families honestly unmatched.

**Why:** licensing is the boundary — Google Fonts is the only catalog we may fetch server-side; every other path is customer action.
**How to apply:** any future mockup-rendering work fetches only `status === "google"` families; any new surface showing font status reads the check's `fonts` entries, never re-derives.
