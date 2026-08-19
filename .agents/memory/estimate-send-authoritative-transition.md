---
name: Estimate send = single authoritative transition
description: Client must never pre-write a "Sent"-style status before the server send call; delivery counts must be surfaced.
---
Rule: any client "send" flow saves configuration WITHOUT flipping status, then one server /send endpoint atomically mints the share token, flips Draft→Sent, and best-effort mails. The client must consume the returned `sentCount`/`attempted` and show an explicit "link created but 0 emails delivered" error instead of false success.
**Why:** the press estimate send loop originally persisted status "Sent" client-side first — a dropped connection left a Sent row with no link and no mail, and the discarded sentCount hid total delivery failure (architect-review FAIL, Aug 19 2026).
**How to apply:** any new send/share/invite loop (estimates, invites, notifications) — status transition lives server-side only; zero-delivery is an error state in the UI.

Related documented staging posture: the PUBLIC estimate page (/e/:token) Ask/Send/Start sheets are intentionally front-end-local pending Ruby's persistence decision (logged in docs/STATUS.md) — don't "fix" them without her call.
