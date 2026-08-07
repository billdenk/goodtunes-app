---
name: Admin dark theme (Apple-canon charcoal)
description: How the admin/partner dark mode works and rules for keeping every screen themed
---

Dark mode for admin + partner surfaces is a THEME LAYER, never per-page styling.

**Rule:** admin dark = the charcoal ladder (#161617 canvas, #1c1c1e rail, #1e1e20 card, #26262a raised, #3a3a3e chips, hairline rgba(255,255,255,.10)) — NEVER navy (navy is fan-facing only). Source of truth: `docs/design-reference/code/AdminDashboardAppleDark.tsx`.

**Mechanism:**
- Preference (light/dark/system) lives in localStorage `gt:admin-appearance`; `client/src/lib/adminAppearance.ts` toggles body class `gt-admin-dark` and tracks `prefers-color-scheme` for "system". Applied synchronously in main.tsx boot (no light flash) and settable via the Appearance control in AdminUserMenu, or a one-shot `?gtappearance=` deep-link (scrubbed from the URL after persisting).
- `index.css` flips all `--apple-*` vars + shadcn semantic tokens under the dark class, plus BLANKET utility remaps (`bg-white`→card, `text-slate-*`→ink ladder, `border-slate-*`→hairline, recharts grid/axis, GoodTunes logo `invert(1) brightness(2)` scoped to `img[alt="GoodTunes"]`) so every current and future screen inherits dark with zero per-page work.

**How to apply / gotchas:**
- New admin/partner UI: style with `var(--apple-*)` or standard slate/white utilities — never hardcode the light hexes (#1d1d1f, #e6e6ea, #f0f0f2…) inline; inline hex is invisible to the theme. Canon dashboard consts are `var(--apple-*)` strings now.
- All dark selectors MUST be `body.gt-admin.gt-admin-dark …` (both classes) — the dark class can outlive `gt-admin` on SPA nav to fan routes, so single-class selectors leak charcoal onto navy fan pages.
- Recharts colors set as SVG presentation attributes are out-ranked by CSS — theme charts via the blanket CSS overrides, not per-chart hex.
- Dark `--apple-faint` is #8e8e93 (not the reference's #6e6e73) — the darker tone fails WCAG AA (~3.3:1) for caption text on charcoal.
- Partner/press logos stay on white circles, never inverted.
