---
name: ERP inbound pricing push (Matilda)
description: Safety model for inbound pricing pushes from a press ERP — staged, operator preview→commit only, never direct writes.
---

# ERP inbound pricing push — safety model

The inverse of the Coda pull sync: the press's ERP (Matilda for MRP)
pushes pricing to us via a validate (pure dry-run) + submit pair.

**Rules that must hold:**
- A push NEVER writes live pricing directly. Submits are staged as a
  pending sync; only an operator preview→commit (the same merge boundary
  as Coda, which respects operator-locked rungs) applies them.
- Submit is STRICT: any row error rejects the whole payload, nothing
  staged. Duplicate rows are errors, never median-collapsed like Coda.
- One active per-press key; secret encrypted at rest, constant-time
  verify so unknown key ids don't leak by timing; minting a replacement
  revokes the prior key, revoked rows kept for audit. Key management is
  operator-only (remember requireAdmin admits all partners).
- "Pricing last received" freshness derives from submits, not dry-runs.

**Why:** capabilities promise external pushes can't silently rewrite live
pricing; the Coda operator-review model is the ruled safety boundary for
ALL external pricing sources.

**How to apply:** any future inbound ERP surface (orders, inventory)
should reuse the same key + rate-limit verification and stage writes
behind an operator verb rather than applying directly.
