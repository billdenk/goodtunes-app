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

## "My plays don't show" triage (recurs)
Bill's own fan account (billdenk@mac.com / @billy) is platform-internal THREE ways: events stamped `_internal:true`, email on FULL_ACCESS_EMAILS (shared/fullAccess.ts), and device denylist — `staffInternalListen()` drops all of it from every partner-facing report (Top tracks, funnel, dashboards) BY DESIGN. His CALIFORNIALAND copy is also comp/grant #1, so even un-flagged his plays would bucket under Grant, never Fan. When an operator reports "play numbers look off", check `analytics_events` for their user_id + `_internal` BEFORE suspecting the tracking pipeline — the data is all there.

## Operator-only "Staff plays" column (Top tracks)
Operators see the staff/internal listening partners never do, as a separate muted column on the three partner dashboards' Top tracks (plus a footnote), with staff-only tracks appended after the fan-sorted rows.
**Rule:** the operator bit is `scope.viewerIsOperator`, stamped ONLY inside the three scope resolvers from `info.role === "super_admin"` — never inside the compute*/dataset helpers (tests construct those scopes directly) and never at other construction sites. Absent/falsy flag = partner-safe payload with NO staff keys (fail-closed). Staff rows never re-rank the partner ordering, and every operator row carries staffPlays/staffCompletes (0 default) so CSV headers stay uniform per sendCsv's first-row-keys contract.
**Why:** leak-safety rides on the single stamp site — view-as demotes `info.role` to the partner, so view-as tabs stay partner-shaped automatically; clients gate the column on field PRESENCE, not role checks, so there is no client-side role logic to drift.
**How to apply:** any future per-viewer report field follows the same shape — stamp at the resolver, gate at the merge site, fail closed on absence, keep row keys uniform. Exclusion coverage lives in the label/manager + artist exclusion db test suites (partner-absence + conservation assertions).
