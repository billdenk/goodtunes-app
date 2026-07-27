---
name: Artist Dashboard tier discipline
description: Rules behind the merged artist Dashboard (ex-Overview) — play-tier separation, card set, and who else consumes the summary payload.
---

# Artist Dashboard tier discipline

**Rule.** The artist portal has ONE analytics tab (Dashboard). Play metrics are
four tiers — fan (purchaser), grant (comp/preview grants), anonymous preview,
staff/internal — and are NEVER summed into a blended headline. The Fan-plays
headline is purchaser plays only, with the other tiers spelled out on a
secondary line ("X listeners · Y grant plays · Z previews · internal
excluded"). Unique listeners = distinct fan + grant. "New fans" = first-ever
fan-or-grant play lands in the window (user-keyed; anon + staff excluded).
Gross stays order-total inclusive (tax + shipping); Net (artist) stays on the
per-copy product-price cost stack (Product revenue − Manufacturing −
Publishing − Platform fee − Stripe fees). No Artist-share card (placeholder
that mirrored Gross — dropped, future payout-split work).

**Why:** the old Dashboard tab blended every tier into one play count and
disagreed with Overview's revenue math; Bill signed off on the merged
nine-card contract (Units, Gross, Net, Orders, Fan plays, Unique listeners,
Completion rate, Top track, New fans — pinned by
`client/src/pages/artistDashboardCards.test.ts` and the exclusion DB test).

**How to apply:**
- Any new play metric on artist surfaces must pick ONE tier (usually
  purchaser) and expose the others separately — never add them together.
- Dropping a KPI card does NOT mean dropping the server payload field:
  AdminDashboard's artist-early view still consumes `topAlbum` from the
  artist summary; the AdminPerson page embeds the SEPARATE
  `AdminPartnerDashboard` (`/api/partner/artist/dashboard`) which keeps its
  own card set.
- Stale `?tab=overview` deep links must keep resolving to `dashboard`
  (mapped in ArtistDashboard's tab-state init + URL effect).
- Label/manager portals still have their own Dashboard+Overview pair by
  design (separate briefs); their reports keep their own computeKpis.
