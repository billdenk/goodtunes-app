---
name: Press bring-your-own custom domain
description: Operational rules for press white-label custom domains — status ladder, fail-closed boundaries, operator-only activation.
---

A press can serve its white-label portal from a subdomain of THEIR domain
instead of the makesvinyl slug. Status ladder: pending DNS → (real DNS check)
→ pending activation → (operator links the host in Replit Deployments →
Domains, then marks it active from god-view) → active.

**Rules:**
- Fail-closed everywhere: only an `active` domain serves the skin or wins link
  minting. Unknown/pending custom hosts render the neutral page.
- Activation is an explicit operator verb and requires DNS verification to have
  passed first — never allow a shortcut from pending-DNS to active.
- **Why:** TLS is per-host and manually linked in Replit Domains, so a press
  can never self-activate, and an unverified hostname must never appear in
  minted links (they'd be broken or hijackable).
- **How to apply:** any new server surface that resolves a white-label host by
  slug must ALSO check the active-custom-domain DB lookup (the static parser
  can't know DB state); link builders must go through the shared branded-origin
  helper (fallback custom → slug → request host, prod-only); a new platform
  host family must be added to the shared suffix list AND its index.html
  inline twin. Operator steps: docs/whitelabel-custom-domain-runbook.md.
