---
name: Quote builder honest pricing
description: Press component quote builder never fabricates prices; unpriced lines are pending and block send, gate is server-owned
---
**Rule:** in the press component quote builder, a component with no real price is "Pricing pending / custom quote": excluded from the total, and the estimate cannot be sent to an artist (drafts still save). Never substitute a demo/default number.

**Why:** Bill ruled quotes must never silently include fabricated numbers (gatefold jackets are Custom Quote on Viryl's 2026 sheet until they price them).

**How to apply:**
- Line prices resolve solely from the press's Components → Pricing rows via the shared quote pricer (vinyl matched by catalog color/tier NAME per size; flat keys for labels/jackets/sleeves/inserts/stickers/services). Heavyweight vinyl has no price slot → always pending.
- The send gate is SERVER-owned and fails CLOSED: the send route recomputes pending lines from the persisted builder state + current pricing rows; no builder state = no send; a client "pricingPending" flag is display-only. "Sent" is unreachable via direct create/update status writes, and a sent estimate's payload is immutable (duplicate to a new draft to change it).
- Every line the builder charges has a seeded blank pricing row, so a press can price itself fully sendable in the UI; a later real price (typed or marker-guarded backfill — per-cell guarded, decoy-press-safe) makes builds price normally with no code change.
- The legacy artist package designer keeps its own demo tables on purpose — don't copy its defaults back.
