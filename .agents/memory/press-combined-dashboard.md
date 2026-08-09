---
name: Combined press dashboard
description: Aggregate "Every press. One pulse." dashboard — data shape, scale rules, stable chart colors, auth gotcha
---
- Surface: `AdminPressesDashboard.tsx` replaces AdminSectionDashboard ONLY for section=presses (other sections still use the generic one). Server payload extras (`presses[]`, `pressSeries`, press-attributed activity) come from `buildPressesRollup` in server/sectionDashboard.ts.
- Scale rules (Bill): chart = top 5 presses by gross colored + ONE grey "Everything else" band (stacked total must equal all presses); activity chips = All + 5 + "More" dropdown; leaderboard = top 10 + "Show all N" expander.
- Stable colors: `manufacturers.chart_color`, stamped at onboarding via `nextPressChartColor` (shared/pressChartPalette.ts; first 4 pinned MRP/Hellbender/PMP/Viryl). Never derive per page load. Legacy colorless rows fall back to palette-by-rank client-side.
- **Why session-OR-bearer:** the section-dashboard route was session-only; operator logins are frequently bearer-only (#token-hash), and the default queryFn returns null on 401 → the page rendered as calm EMPTY STATES, not an error. Any admin route read via default queryFn must accept bearer (getAuthFromRequest; note auth.kind is "admin"/"customer", never "user").
- Order aggregates must use `COALESCE(origin,'direct') <> 'qa:test'` — a bare `origin <> 'qa:test'` NULL-excludes all legacy orders (origin nullable).
- Completed + Avg turn-time KPIs are honest comingSoon: no run-completion event exists yet on pressing_order_requests.
