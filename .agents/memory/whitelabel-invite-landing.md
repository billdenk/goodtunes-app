---
name: Whitelabel invite landing + portal auth
description: Policy for routing press-homed artists into the white-label client portal, and the Node-fetch Host-header trap in route tests.
---
- RULED: on a white-label host, an ARTIST homed to the press that host's slug resolves to (and whose portal skin is active — email_branding set, the same data-driven rule as the branding endpoint, never a name check) lands in the client portal (/dashboard). Everyone else — operators, press staff, other partners, artists homed to a DIFFERENT press — keeps their normal landing.
- One shared server resolver makes that decision everywhere: invite accept (new AND existing accounts), post-2FA login landings, and the client guardrail's eligibility endpoint. The client never re-derives eligibility.
- Press-invited artists are ADMIN-kind, so any white-label portal read they need must accept admin identities alongside customers (estimates match by email; host-press scoping unchanged). Write/upload surfaces stayed customer-only — open them deliberately, not by default.
- An artist's press home lives on their Person row (default/invited-by press), not the users row.
**Why:** press-referred artists must never strand in GoodTunes chrome on a branded host, and the gate must stay press-generic for future presses; steering foreign artists into someone else's portal was review-rejected once.
**How to apply:** new GoodTunes entry paths reachable on whitelabel hosts get added to the steer list; new portal surfaces reuse the shared resolver / admin-kind client resolution.
- TEST TRAP: Node fetch (undici) silently replaces a hand-set `host` header with the connection host — route tests asserting host-based behavior must send `x-forwarded-host` (with trust proxy on).
