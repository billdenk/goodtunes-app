---
name: Press "Add your vinyl" color setup page
description: Apple-canon press-portal color setup sub-view — routing, label branding columns, and model mapping decisions
---

- Entry: PressPortal `?tab=catalog&view=colors` renders `PressVinylColors` instead of PressCatalogPanel; tab changes clear `view` (and `person`). Deep-linkable per the portal tab-in-URL rule.
- Wiring reuses the existing press catalog CRUD (colors POST/PATCH/DELETE, tier POST) — do NOT build a parallel color store. `canEdit` off the catalog GET gates all write affordances; server gates enforce.
- Center-label branding = `manufacturers.label_logo_url` + `label_bg_color` (surfaced on GET /api/press/:id/me). No logo = plain generic label. Memphis = black label + white MRP logo (`/logo-mrp-white.svg` in client/public, recolored copy of the docs design-reference black SVG).
- **Why:** Bill's rule — MRP label branding is Memphis-only; every press supplies its own label logo/bg as inputs; never bake a brand into the disc renderer.
- Post-merge.sh has the idempotent ADD COLUMN + Memphis stamp (stamp only when BOTH fields NULL, so operator edits win). Riverside's branding + 12" catalog in dev is throwaway demo seed.
- The reference's per-swatch size chips have no backing field (color groups are format-scoped); the page shows format chips instead — don't invent per-color sizes.
