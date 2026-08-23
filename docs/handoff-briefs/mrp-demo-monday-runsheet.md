# MONDAY DEMO RUN-SHEET — live MRP demo (Bill presents Monday Aug 24)

**This is the point of everything shipped this week.** Bill demos LIVE to
Memphis Record Pressing on Monday, on memphis.makesvinyl.com + the press
portal. Three flows, in order. Per STATUS.md most of this is already live —
this sheet is the gap list, in priority order. Bill's direction: this goes OPERATIONAL ASAP — start now, work the gap
list top-down, and flag anything at risk the moment you know, not later.

## Flow 1 — MRP creates a Package
Press portal: Components -> (vinyl builder, live) -> Packages -> package
builder -> price list.
- GAP CHECK: confirm package creation is demo-clean under the MRP skin
  (no dead rails, no "quote" wording, no placeholder prices — honest gaps
  only). Reference mocks: PressPackageBuilder / PressPackagesIndex.

## Flow 2 — Estimate -> artist -> production loop (the money demo)
Live already per STATUS: estimate builder from Components->Pricing rows,
estimate email, /e/:token page, Start-this-project + account creation,
next-steps file upload.
- **TEST MODE (Aug 22)** — Stripe payment moment: "You owe / Pay $X" is live on the accepted estimate page (/e/:token/accepted) for Converted estimates; card checkout in Stripe test mode, amount server-derived, Paid state + press-side Paid chip. GAP text follows for reference: **Stripe payment moment.** Artist pays their press bill from the
  portal (Billing model: "You owe." / "Pay $X" — Card or bank transfer,
  securely handled by Stripe). If real charges can't be live by Monday, a
  Stripe TEST-mode checkout is fine for the demo — but the tap must work.
- **READY TO TEST (Aug 22)** — MRP-side download: press-only Downloads sub-tab in the project view (finished print files per component + all-print-files, per-track master originals + all-masters ZIP, honest empty/health states). GAP text follows: **MRP-side download.** The press sees the converted project and
  downloads the finished template + music files from their end.
- **LIVE ON DEV (Aug 22)** — PQ sheet: online tokenized sheet at /pq/{token} (tap-to-play for Mux-ready tracks, honest side-length verdicts, artist confirmations never pre-ticked) + two-page PDF twin; "PQ sheet" entry under Physical → Audio in the press portal. GAP text follows: **PQ sheet** (handoff/pq-sheet/, pushed Aug 22): online cutting-
  master sheet with tap-to-play + Download PDF twin. This is the flow-2
  closer for their mastering folks. If playback can't land by Monday,
  ship the sheet + PDF without play and say so.
- Wave mastering label: **LIVE (removed)** — callout deleted from the artist
  release page (Aug 22). Needs the prod publish to show on the live domain.

## Flow 3 — MRP invites an artist to self-service
MRP adds an artist by Spotify link + email (and/or manager/team members);
artist receives the branded invite and starts on their own.
- GAP CHECK: is the invite send live end-to-end on the white-label host?
  Reference mock: PressArtistInviteMRP.

## Demo hygiene (all flows)
- Demo data: one clean press account (Memphis) + one clean artist
  (CALIFORNIALAND / Niina Soleil, NS-001 — matches the live Side Breaks
  page). No test junk in lists.
- Emails while testing: route ALL demo/test sends (invites, estimate
    emails, receipts) to Bill's and Andrew's own addresses — they will test
    the full loop themselves this weekend. Swap recipients to Brandon and
    the real MRP contacts only at go-live, not before. (The existing
    PRESS_ESTIMATE_REVIEW_RECIPIENT redirect is the right mechanism — keep
    it pointed at Bill/Andrew for now.) Bill must be able to show the
    emails in the room Monday.
- Client-only work needs a prod publish to show on the live domain —
  publish before Monday, not Monday morning.

**Update this file (or STATUS.md) as each line lands: LIVE / TEST MODE /
NOT READY. Bill and Andrew are testing the full loop with their own
emails as pieces come online — the sooner a line flips, the sooner it
gets tested.**
