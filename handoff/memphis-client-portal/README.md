# Memphis (MRP) white-label client portal — handoff
2026-08-21 · From the Playground design studio (Ruby)

## The law
Per handoff/README-template.md: these files are the source, not a reference. Replace presentational code **verbatim**; wire data only. Delete-first: existing Memphis landing/portal UI comes out before this goes in. Any visual difference other than data values at 1440px is a failure.

## Scope
Memphis Record Pressing only, for now. The client-facing white-label surface a press client (artist) sees: estimate email → estimate page → portal.

## Screen order (the flow)
1. **PressClientEstimateEmailMRP.tsx** — the estimate email Memphis sends. "Open your estimate" is the entry point to the flow.
2. **PressClientEstimateMRP.tsx** — the estimate page the emailed link opens (no login needed; the link IS the auth). Estimate 071526-02, $5.37/unit. Bottom sheets: ask-a-question, share, create-account/start-project.
3. **PressClientNextStepsMRP.tsx** — two variants in one file: logged-out login page (full MRP footer) and logged-in portal next-steps view.
4. **PressClientEstimateAcceptedMRP.tsx** — "project started" confirmation (email + page states).
5. **ArtistDashboardMRP.tsx** — the client's dashboard once the project is live. Uses estimate 071500-02, $8.37/unit — deliberately a DIFFERENT project than the estimate journey; keep that split when wiring.
6. **ArtistDashboardNextStepsMRP.tsx** — dashboard with the next-steps strip expanded.
7. **ArtistProjectHomeMRP.tsx** — project/catalog home.

The landing page in your current build ("Estimates and invitations from Memphis Record Pressing live here…") should adopt the MRP skin below — white canvas, not dark. Dark charcoal is GoodTunes admin canon, never a white-label client surface.

## Skin (stylesheet-first — taken from memphisrecordpressing.com CSS, do not restyle)
- White canvas, gold accent #D9C153, square corners (0 radius), Poppins.
- MRP logo asset included (assets/mrp-logo.svg). Never recolor it.
- ONE filled accent action per page/sheet. Statuses are word + icon, never color alone.
- Single theme: MRP's brand is light-only per their live stylesheet, so these ship without a THEMES map (unlike GoodTunes-canon handoffs). If Bill wants a dark MRP variant, that's a new design round — flag it, don't invent it.

## Dummy data
All dummy values are in MOCK_ consts at the top of each file (MOCK_JOB, MOCK_CLIENT_FIRST, MOCK_ESTIMATE_NO, MOCK_QTY, MOCK_ACTIVITY, MOCK_TOP_PROJECTS, …). Swap ONLY those. Persona: artist Niina Soleil / album Californialand; press contact Brandon Seavers. Images under ./assets/ are placeholders for real uploads.

## Dependencies
react, lucide-react, recharts (ArtistDashboardMRP trend chart). No shared imports between files — each screen is self-contained.

## Must work (everything not listed is decorative chrome)
- Email: "Open your estimate" button → opens the estimate page for that estimate.
- Estimate page: details/setup section toggles expand-collapse; "Ask a question" opens the ask sheet and Send delivers a real message to the press; Share sheet sends a real share email; "Start this project" confirm creates the project; create-account form creates a real account; "See next steps" navigates to the portal.
- Next steps (logged out): login form authenticates; (logged in): "Upload files" opens a real upload; "View estimate" navigates; "Ask Brandon" opens messaging; rail search searches.
- Accepted: "Sign in" navigates to login; "View estimate" navigates.
- Dashboard: range switcher re-queries the chart; next-steps strip toggle expands; "Upload files" real upload; notifications + user menu open; all "View all" links navigate; KPI strip, chart, activity, top projects, channels, giving are real data.
- Project home: "New album" starts the flow; archived toggle filters; rail search searches.

## States checklist (acceptance bar — screenshot each at 1440px)
- Estimate: collapsed vs expanded sections; each of the three sheets open; confirm state after "Start this project".
- Next steps: logged-out login AND logged-in portal.
- Dashboard: next-steps strip collapsed AND expanded; each range on the switcher.
- Empty/zero states: top-projects row with units 0 (in-production project) renders as shipped.
