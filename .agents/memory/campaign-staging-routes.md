---
name: Campaign Preview & Purchase routes
description: Where the "Get Hope / Give Hope" style campaign pages live and the host gotcha that makes shared links 404
---

# Campaign Preview & Purchase routes

`client/src/pages/Hope.tsx` is a **config-driven** campaign flow promoted from a
canvas mockup. One `RELEASES` registry keyed by `${artist}/${release}` (lowercased
at lookup) holds ALL per-artist copy/pricing/imagery, so a new campaign = a new
registry entry, not a new page. Two exported route components:
- `Hope` → `/hope` — public coming-soon teaser (primary CTA disabled, shows launch label).
- `CampaignPreview` → `/staging/:artist/:release` — full clickable family-review
  preview; pay-step order buttons are disabled until launch.

Images served from `client/public/campaigns/<artist>/` (static dir; Vite root=client/).

**Why:** family/investor preview links must be shareable before checkout is wired.

**How to apply / the gotcha that bit us:** the bare apex `goodtunes.music` is the
**Webflow marketing site on a different host** — it serves NONE of these app routes.
Shareable links must use the **`my.`** subdomain (`my.goodtunes.music/hope`,
`my.goodtunes.music/staging/nightbirde/hope`). Also: new routes only resolve in
prod AFTER a publish. And `:artist/:release` are wouter params, not literal URL text.
