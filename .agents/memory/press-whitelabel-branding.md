---
name: Press white-label branding
description: Where per-press brand (accent/corner/contact) lives and which surfaces consume it; run_sql_both trap in post-merge.
---
- Per-press white-label brand = 3 nullable cols on manufacturers (brand_accent_color #RRGGBB, brand_corner_style rounded|square, brand_contact_line); all-null = GoodTunes defaults. Logos are NOT duplicated — surfaces read the existing Details logo kit (logoUrl dark-bg, lightLogoUrl light-bg).
- Consumers: public /e/:token viewer (sanitized `brand` on estimate-link), press-referred invite email (optional trailing `brand` param on sendAdminInviteEmail so ~9 legacy call sites stay untouched; routes.ts sites use resolvePressInviteBrand keyed on admin_invites.default_press_id) and AcceptInvite.tsx (`pressBrand` on GET /api/invites/:token, display-only, never the press id).
- "Always GoodTunes" surfaces stay GoodTunes blue on purpose: the /e/:token fan-funded shimmer + explainer button, "Powered by GoodTunes®" footer.
- Brand scrape (POST /api/press/:id/brand-suggest, server/brandPalette.ts) is SUGGEST-ONLY — nothing persists without operator Save (PUT branding).

- TWO accent stores exist: the designed client estimate EMAIL (Task-3271 template) reads manufacturers.email_branding jsonb; everything else (viewer, invites, White Label tab) reads brand_accent_color. Unify when touching either.

**Why:** white-label promise is press-facing only; fans stay GoodTunes-branded, and the public estimate read is a strict allowlist (route-tested in server/pressBranding.routes.db.test.ts).

**LATENT TRAP:** scripts/post-merge.sh calls `run_sql_both` (~line 12730) but that function is NEVER defined — those earlier migrations silently no-op via `|| true`. New migrations must use the defined psql-heredoc dev+prod pattern instead. Not yet fixed.
