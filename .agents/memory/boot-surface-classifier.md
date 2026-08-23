---
name: Boot-surface classifier fan-out
description: Which surfaces must agree on admin/fan/whitelabel classification during boot and route transitions
---

Rule: the admin/partner-vs-fan-vs-whitelabel host/path classification lives in
client/src/lib/bootSurface.ts (isAdminSurfacePath / classifyBootSurface) and is
consumed by: main.tsx pre-mount body-class setup, the app-level FanAppLoader
(theme-aware — charcoal/light-grey on admin surfaces, brand-free on white-label,
navy+logo only on fan), and releaseAdminBodyClass().

**Why:** the full-screen auth loader used to always paint fan navy + white
GoodTunes logo, flashing over admin boots and leaking GoodTunes branding on
white-label hosts; and ~26 admin pages/OperatorShell dropped `gt-admin` blindly
on unmount, so admin→admin transitions flashed the navy fan gradient for a frame.

**How to apply:**
- Adding a new partner portal / embedded admin sub-route? Add its exact path to
  bootSurface.ts AND the duplicated inline detector in client/index.html (pre-React,
  must stay inline) — plus the existing App.tsx/main.tsx guard allowlists.
- Never call `document.body.classList.remove("gt-admin")` directly on unmount —
  use releaseAdminBodyClass(), which keeps the class when the DESTINATION path is
  still an admin/partner surface (wouter updates location before unmount effects run).
