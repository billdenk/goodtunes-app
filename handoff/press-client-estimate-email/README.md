# Handoff — Client Estimate Email (platform push)

Bill's ask (Aug 21 2026): the platform emails a client their estimate; the
estimate page itself stays a private link behind the email's one button.

## Files
- `PressClientEstimateEmail.tsx` — the GoodTunes-branded email, rendered as
  the client's inbox shows it. The top "inbox chrome" card (From / To /
  Subject / preview line) is MOCK-ONLY framing — it is not part of the email
  body. The email body is the 600px dark column below it.
- `PressClientEstimateEmailMRP.tsx` — the SAME email wearing Memphis Record
  Pressing's white-label look: gold #D6A63F accent (the quote builder's
  PRESS_ACCENT) replaces GoodTunes blue; filled gold buttons carry dark ink
  like MRP's own "Get a quote" button. First of the per-press white-label
  twins — structure is identical by design, only the accent system changes.
- `assets/` — every image both files import.

## Copy verbatim (standing handoff law)
These are self-contained mock files with MOCK_ consts. Copy them verbatim,
then replace MOCK_ data with real estimate data. Do not re-interpret the
design.

## Email rules baked into the design (keep them)
1. 600px single column, static. No hover states, no expanders, no live
   quantity tiers — email clients cannot do any of that reliably. Everything
   interactive lives behind the ONE button.
2. ONE filled action: "Open your estimate". Canon weight rule applies to
   email too — everything else is quiet text.
3. Fully-expanded numbers at rest (per-record lines, setup lines, run,
   total) because an email cannot collapse. One quiet line points at the
   page for other run sizes.
4. The email shows the ONE quantity the press prepared; the page prices all
   tiers live.
5. "Questions? Just reply." — replies must be wired to the press contact who
   prepared the estimate (same rule as the page's "Ask a question": each
   press only ever sees its own people).
6. GoodTunes hook is one static quiet line — no animation in email.
7. Real ® throughout; commas in dollars; "estimate" never "quote".

## Sending model (decide/wire in Otis)
- Sender: the platform sends from a GoodTunes address ON BEHALF of the press
  — display name "<press contact> · via GoodTunes®" or similar. The mock's
  `brandon@memphisvinyl.com` in the chrome is illustrative only.
- Reply-To: the press contact who prepared the estimate (Brandon here), so
  "Just reply" lands in their inbox.
- Per-press custom sending domains (true white-label From:) need per-press
  DNS (SPF/DKIM) — flag as a later work item, do not block on it.
- The button links to the private estimate page (link-not-login; no account
  needed to view).
- When rebuilding as a real email template, translate the flex/grid layout
  to table-based HTML with inline styles; the visual design is the contract,
  the CSS mechanics are yours. Dark canvas is intentional — test light-mode
  clients don't invert it (use explicit background colors, not defaults).

## Acceptance
- Renders correctly in major clients (or your email framework's preview) at
  600px; degrades to full-width on small screens.
- Both flavors (GoodTunes blue, MRP gold) render from the same structure.
- Reply-to verified to reach the preparing press contact.
- Log the SHA in docs/STATUS.md.
