---
name: Cross-press import walls
description: Ruling principles for the customer-initiated cross-press project import (built, held OFF)
---

# Cross-press project import — walls (built, held OFF)

Built and wired but **held OFF** — launch is a separate deliberate decision by Bill. Two layers of flags exist (a per-press customer entry point and a compile-time GoodTunes My-projects gate); do not flip either without his ruling. The GoodTunes cross-press view must never render on white-label hosts even when ON.

## Ruling principles (Bill — non-negotiable, enforced by isolation tests)
- **Customer-initiated only.** No press ever sees a customer has projects elsewhere: zero events, notifications, report rows; an import writes nothing at the source press.
- **Specs travel, never commerce.** Spec serializers are allowlist-built and every import response passes the price-key firewall, failing loudly on a hit. Prior price is never shown anywhere, even to the customer.
- **Never name the other press** in press-portal copy or persisted payloads ("saved project specs on your account"). The GoodTunes-branded view is the ONE surface that may name presses (customer's own account data).
- **Honest translation:** exact / ranked closest-match requiring explicit customer confirmation / plain "no equivalent" — never a silent swap; destination pricing only from the destination's own ladders after confirmation. Every option offered must be gated on what the destination actually sells (colors by tier, jackets by the destination's own jacket catalog); confirming a tier must regenerate color candidates from THAT tier so a displayed choice is always a startable choice.
- **Drafts must speak the destination quote builder's own hydration vocabulary** (its ids, slugs, symbolic style names, done-step set), never source-press names or catalog row UUIDs the builder can't read — a wrong-vocabulary draft looks fine in the payload but the builder silently keeps its defaults.
- **Held OFF means zero surfaces, on every leg.** Every customer-facing endpoint of the flow — including passive status reads — 404s while the flag is off, and the client route renders the portal's 404 page (not a blank shell, not a post-mount redirect) so it is indistinguishable from an unregistered route.
- Masters-release request lands at the SOURCE press as a normal inbound request from its own customer; the storage carries **no destination information by design**. Whether presses may charge for release is an open question — do not build the payment leg without a ruling.
- Canonical spec attrs sit alongside per-press names (names stay per-press); stored operator-confirmed attrs win over name-derived heuristics; an unknown attribute is an honest null, never fabricated.

**How to apply:** any future work touching import, translation, masters release, or the spec dictionary must keep every wall; the isolation tests encode them.
