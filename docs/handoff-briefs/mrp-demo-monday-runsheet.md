# MONDAY DEMO RUN-SHEET — live MRP demo (Bill presents Monday Aug 24)

**This is the point of everything shipped this week.** Bill demos LIVE to
Memphis Record Pressing on Monday, on memphis.makesvinyl.com + the press
portal. Three flows, in order. Per STATUS.md most of this is already live —
this sheet is the gap list, in priority order. If a gap can't land by
Monday, say so by Sunday so Bill can stage that step from the Playground
mocks instead of hitting a dead end mid-pitch.

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
- GAP: **Stripe payment moment.** Artist pays their press bill from the
  portal (Billing model: "You owe." / "Pay $X" — Card or bank transfer,
  securely handled by Stripe). If real charges can't be live by Monday, a
  Stripe TEST-mode checkout is fine for the demo — but the tap must work.
- GAP: **MRP-side download.** The press sees the converted project and
  downloads the finished template + music files from their end.
- GAP: **PQ sheet** (handoff/pq-sheet/, pushed Aug 22): online cutting-
  master sheet with tap-to-play + Download PDF twin. This is the flow-2
  closer for their mastering folks. If playback can't land by Monday,
  ship the sheet + PDF without play and say so.
- Also in that handoff's sweep: REMOVE the live "Wave mastering" label
  before Monday — MRP will notice a service that doesn't exist.

## Flow 3 — MRP invites an artist to self-service
MRP adds an artist by Spotify link + email (and/or manager/team members);
artist receives the branded invite and starts on their own.
- GAP CHECK: is the invite send live end-to-end on the white-label host?
  Reference mock: PressArtistInviteMRP.

## Demo hygiene (all flows)
- Demo data: one clean press account (Memphis) + one clean artist
  (CALIFORNIALAND / Niina Soleil, NS-001 — matches the live Side Breaks
  page). No test junk in lists.
- Estimate-email review redirect (PRESS_ESTIMATE_REVIEW_RECIPIENT) — make
  sure Bill can actually receive/show the invite + estimate emails in the
  room.
- Client-only work needs a prod publish to show on the live domain —
  publish before Monday, not Monday morning.

**Report back into this file (or STATUS.md) by Sunday evening: LIVE / TEST
MODE / NOT READY per line above, so Bill knows exactly what he's walking
in with.**
