---
name: White-label client-portal skins (per-press entrances)
description: Per-press client-entrance skins (MRP/PMP/Cinq/Hellbender), token-as-auth portal reads, emailed-link landing, and OAuth suppression on white-label hosts.
---

# Rules

- Skin is DATA-driven: `manufacturers.client_portal_skin` (`mrp-light`/`pmp`/`cinq`/`hellbender`), never a press-name check; legacy fallback `email_branding → mrp-light` kept. A skinned press's own gate/portal renders at bare `/` AND `/next-steps`; unskinned known presses get a neutral card with NO sign-in button (admin login is the back door, never the client front door).
- **Why:** "GoodTunes" must never appear on a white-label domain outside designed Powered-by marks, and one press's identity/assets must never render on another press's screens (MRP's ruby disc photo → neutral drawn disc elsewhere).
- Emailed estimate links on a SKINNED press land on the portal entrance `/next-steps?e=<shareToken>` (send, resend, and client /share paths); unskinned presses keep `/e/<token>`. The portal links each estimate back to `/e/<token>` — no loop. Token is the auth: the sessionless portal read is host-press-scoped and must 401 anon-no-token BEFORE the host-resolution 404.
- PMP is theme-aware (light + Dark twin picked by `prefers-color-scheme`); MRP dark mode deliberately deferred.
- Google/Apple sign-in is NOT RENDERED (never merely disabled) on white-label hosts across every sign-in surface; reversible when activation is decided. Any-skin customer /login visits redirect to `/next-steps`.

# How to apply

- Handoff law for portal screens: replace presentational code verbatim, wire data only; handoff-verbatim chrome that flags design-lint gets baselined, not rewritten.
- Post-sign-in/CTA navigation must carry the `?e=` token (or an authed session) so a visitor never lands back on the gate.
