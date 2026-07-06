---
name: Operator backfill-without-invite pattern
description: How to retroactively record an already-happened relationship (e.g. a referral) without triggering the normal invite/email flow, while reusing existing provisioning helpers.
---

For a "this already happened in real life, just record it" operator tool (e.g. backfilling a
referral that predates the invite system), reuse the SAME provisioning/stamping helpers the
real invite-accept flow uses (`applyAdminInviteGrant`, `applyArtistAcceptReferral`, etc.) rather
than writing bespoke insert logic — this guarantees the backfilled record is indistinguishable
from an organically-accepted one everywhere else in the app (dashboards, earning windows,
permissions).

**Why:** Bespoke insert logic drifts from the real flow over time and silently misses side
effects (e.g. opening the artist-referral one-year earning-window row, membership grants).

**How to apply:** Gate the route to `super_admin` only (`requireAdmin` + `requireRole`), skip
the email-send call the normal flow makes, let the operator override the effective/anchor date
(defaults to today) since that date drives any time-boxed logic downstream, and treat
re-attribution to a DIFFERENT parent as a 409 conflict rather than a silent overwrite — silently
re-pointing an already-attributed record is a data-integrity hazard, not a convenience.
