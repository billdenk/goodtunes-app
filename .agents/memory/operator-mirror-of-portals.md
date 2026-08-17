---
name: Operator detail pages mirror partner portals
description: Ruled pattern — super-admin press/artist detail pages render the portal's own exported tab body ("one body, two chromes").
---
RULED (Aug 2026): the super-admin detail page for a partner kind must render the SAME portal modules the partner sees, via the portal page's own exported tab body component (PressPortal exports PressTabBody; ArtistDashboard exports ArtistTabBody + useArtistRangeQs + ARTIST_PORTAL_TABS). Never re-implement a portal tab on the operator side.

**Why:** keeps operator and partner views from drifting; one body, two chromes.

**How to apply:**
- Strip = `modulesForRole(kind)` mirror tabs, then a hairline divider (`tabs-operator-divider`), then operator-only extras.
- God view threads the target identity explicitly (`?personId=` / press id) into every read the body makes; server routes accept it for super_admins.
- Artist-session-only surfaces (e.g. the referral invite panel — `/api/artist/invites` 403s super_admins) must be hidden in the mirror via an `operatorView` flag, replaced by a quiet note — never left as a dead 403ing form.
- Legacy operator `?tab=` deep links map onto the new shape; tab/range state re-syncs from URL on later navigations (useSearch effect), not just initial mount.
- Contact-shaped people and press-mode pages stay on their own paths.
