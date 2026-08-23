---
name: Boot-surface classifier fan-out
description: Admin/fan/whitelabel surface classification must stay in lock-step across boot splash, app loader, and gt-admin release
---

Rule: the admin/partner-vs-fan-vs-whitelabel host/path classification is shared
(lib/bootSurface.ts) and duplicated once, by necessity, in the pre-React inline
detector in client/index.html. The full-screen loader is theme-aware: neutral
charcoal/light-grey on admin surfaces, brand-free on white-label hosts, navy +
GoodTunes logo only on genuine fan surfaces.

**Why:** an always-navy loader flashed over admin boots and leaked GoodTunes
branding on white-label hosts; unconditional `gt-admin` removal on unmount let
the navy fan gradient peek through during admin→admin route transitions.

**How to apply:**
- New partner portal or embedded admin sub-route → add its exact path to the
  shared classifier AND the index.html inline twin (a parity test compares them).
- Never remove the `gt-admin` body class directly on unmount — go through the
  shared destination-aware release helper, which keeps the class while the
  current (already-updated) location is still an admin/partner surface.
