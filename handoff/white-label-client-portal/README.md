# White-label client portal — PMP, Cinq, Hellbender

The client-facing entrance for each press's white-label domain (e.g. pmp.makesvinyl.com). Each file contains BOTH screens:

1. **Sign-in gate** — what a visitor with no session sees on the bare domain. Press-branded end to end: their logo, their site header, their accent. The word "GoodTunes" never appears on a white-label domain. No "GoodTunes Admin" login, ever.
2. **Portal (next steps)** — revealed after sign-in. Emailed estimate/invitation links land HERE (or on the estimate page) directly — never on the gate. The gate is only for bare-domain visits without a session; after signing in, the visitor goes straight to the portal, never back to the gate.

Files:
- PressClientNextStepsPMP.tsx (+ PressClientNextStepsPMPDark.tsx) — PMP, green #6CA460, square corners, Poppins site chrome
- PressClientNextStepsCinq.tsx — Cinq, navy #001C30
- PressClientNextStepsHellbender.tsx — Hellbender, red #DF0C15
- MRP's set already lives in handoff/memphis-client-portal/ — same rules apply.

Handoff law: replace presentational code verbatim; wire data only. Both themes where a Dark twin exists; check 1440/1024/768.

Must-work wiring:
- Bare domain + no session → sign-in gate (press-branded).
- Emailed link → portal/estimate directly, session or not (link token is the auth).
- Sign-in button earns its accent only once credentials are entered.
- After sign-in → portal, never the gate again.
- Google/Apple sign-in: HIDDEN until activation is decided (Bill, Aug 26 2026). Do not render the buttons at all — people will click them. They come back only when we say so.

Color note (PMP): the mock spec now reads "Clear Red" — PMP's own Standard Color name from their color library. The earlier "Ruby translucent" wording (and the MRP disc photo that rode with it) is gone; the disc graphic in the PMP estimate screens is a drawn stand-in that swaps 1:1 for PMP's real disc photo when supplied.
