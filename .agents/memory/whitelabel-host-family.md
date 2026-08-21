---
name: White-label host family (makesvinyl.com / pressesvinyl.com)
description: Press-branded hosts — flexible kind, slug rules, prod-only link minting, neutral page, OAuth/invite behavior.
---

Press white-label hosts serve `<slug>.makesvinyl.com` (pressesvinyl.com aliases; minted links always use the primary apex makesvinyl.com).

**Durable rules:**
- These hosts are **flexible** (path-based kind, hostKnown=false, like dev previews) — NOT customer-kind. **Why:** press invites mint ADMIN-kind partner accounts; the invitee must accept and use the portal on the same branded host, and a forced customer kind makes the boundary check reject the freshly-minted admin identity right after acceptance.
- An OAuth start carrying an `?invite=` token must resolve to admin kind on non-admin hosts, or the callback's invite-grant branch silently skips the grant (bit dev previews too). Admin-kind OAuth round-trips to the canonical admin host, so invite OAuth needs no per-subdomain IdP registration; only fan-side OAuth on a branded host needs Google/Apple redirect-URI registration per slug (manual, Bill).
- Host parsing/validation lives in ONE shared module imported by both client and server — never duplicate the host list or slug rules.
- Branded link minting is PRODUCTION-ONLY (dev-minted links must open in the dev env); everything falls back to the request host when no slug is assigned.
- Bare apexes / unknown / reserved subdomains render a NEUTRAL page — no GoodTunes branding, no press enumeration, never an error, never a 301 (unknown-host redirects killed deploy health probes before).
- Slug is per-press, case-insensitively unique, validated with a friendly 400/409 at the API boundary before the DB index.
- DNS: apexes link to the deployment plus a wildcard CNAME per apex, so new press slugs need zero DNS work.

**How to apply:** any new white-label surface reads the shared parser + the public no-auth branding endpoint; any new press-outbound link builder goes through the branded-origin-or-request-host helper. Invite-flow regressions are locked in by a DB test accepting an invite under a whitelabel Host header.
