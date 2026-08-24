---
name: Estimate send = single authoritative transition
description: Client must never pre-write a "Sent"-style status before the server send call; delivery counts must be surfaced.
---
Rule: any client "send" flow saves configuration WITHOUT flipping status, then one server /send endpoint atomically mints the share token, flips Draft→Sent, and best-effort mails. The client must consume the returned `sentCount`/`attempted` and show an explicit "link created but 0 emails delivered" error instead of false success.
**Why:** the press estimate send loop originally persisted status "Sent" client-side first — a dropped connection left a Sent row with no link and no mail, and the discarded sentCount hid total delivery failure (architect-review FAIL, Aug 19 2026).
**How to apply:** any new send/share/invite loop (estimates, invites, notifications) — status transition lives server-side only; zero-delivery is an error state in the UI.

Related documented staging posture: the PUBLIC estimate page (/e/:token) Ask/Send/Start sheets are intentionally front-end-local pending Ruby's persistence decision (logged in docs/STATUS.md) — don't "fix" them without her call.

## Client estimate email (Task era Aug 2026)
- The designed estimate email (handoff/press-client-estimate-email, e86b169) is built by the pure exported `buildPressClientEstimateEmail` in server/mail.ts; flavor = accent bundle resolved from `manufacturers.email_branding` jsonb via `resolvePressEstimateAccent` (null = GoodTunes blue; MRP seeded gold #D6A63F w/ dark button ink, seeded BY DOMAIN not name). Never string-match press names in the template.
- Expanded numbers come from `computeQuoteEmailBreakdown` (shared/quotePricing.ts) — stored builderState + press's CURRENT pricing rows; returns null (email omits the totals card) rather than partial numbers.
- `sendViaResend` now takes an optional 7th `fromDisplayName` arg — display name over the SAME MAIL_FROM address ("<contact> · via GoodTunes®"); Reply-To = preparing contact. True per-press sending domains (SPF/DKIM) are flagged later work.

**Estimate preview imagery (logged run-sheet directive, Aug 23 2026, for Otis):** estimate email AND estimate web page get a preview pair between "Prepared for" and the price table — the data-driven disc render of the exact build (color-accurate, same render as the builder), album cover beside it only when the artist uploaded art; no art = disc alone, NEVER a generic placeholder jacket (estimate-brief placeholder-art rules apply); caption = the existing build line; quiet dressing, no new chrome/section.
