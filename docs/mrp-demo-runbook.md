# MRP Demo Runbook

Goal: run every key flow end-to-end at least twice before the live demo, using ourselves as both the MRP-side sender and the receiving artist/client.

Check off each step as you dry-run it. Anything that fails gets a note here plus a task — don't fix live.

## 0. Pre-demo setup

- [ ] **Hosts & TLS**: confirm `memphis.makesvinyl.com` loads over HTTPS; the bare apex (`makesvinyl.com`) shows the neutral page. (Replit issues no wildcard certs — only already-linked subdomains work; see Known gaps.)
- [ ] **Email is live**: send a real test email first and confirm it arrives. A missing Resend key means every transactional email fails to deliver; the server does surface this (mail-health status + a throttled `[mail-health]` sustained-failure log alarm), but that alarm is log-only by design — nothing emails you about it, so an end-to-end test send is still the gate.
- [ ] **Review-redirect env var**: check whether the `PRESS_ESTIMATE_REVIEW_RECIPIENT` environment variable is still set (read in `server/mail.ts`). While set, *all* estimate emails redirect to that review inbox instead of the real recipient. This is an env var, not code — clearing the secret (and restarting/republishing) turns it off. Decide when to remove it.
- [ ] **Add ourselves as people**: create a test artist/person under MRP's scope with one of our own email addresses (use a second address for the receiver role).
- [ ] **Estimates unveiled**: confirm the Estimates and White Label tabs are visible for MRP — they're behind the per-press unveil flag (`manufacturers.estimates_white_label_enabled`). Existing presses were backfilled ON in Aug 2026, but verify for the demo account.
- [ ] **Pricing seeded**: confirm every component you plan to quote has a real price in MRP's Components → Pricing. Unpriced lines show "Pricing pending · custom quote", are excluded from the total ("Estimate total · incomplete"), and block Send — enforced server-side (the `/send` route recomputes pending lines from the stored builder state + current pricing rows and 409s; it never trusts the client).

## 1. MRP Admin — Estimate Builder (1-2-3-4 flow)

Run as an MRP portal user (not god view).

- [ ] **Build**: pick components (vinyl size/color/tier, jackets, labels, sleeves, inserts, services); vinyl colors show real swatches matching MRP's catalog names (builders read the press's real color catalog, not a demo set).
- [ ] **Pricing**: every line shows a real price or an honest "Pricing pending / custom quote" — never a fabricated default; the total excludes pending lines.
- [ ] **Review/Save**: save as a draft; the draft appears in the Estimates list and survives navigation.
- [ ] **Send**: send to the test artist. Deliberately test once with an unpriced line to confirm Send is blocked (client-side and server 409). Status flips to Sent only after the server confirms. A sent estimate is immutable (payload rejected via PUT; status can never downgrade; re-calling send is a pure resend) — revisions go through Duplicate → new draft.

## 2. Artist/Client — Receiving the estimate

- [ ] **Email arrives with MRP branding**: designed dark-charcoal estimate email with MRP's gold accent (driven by `manufacturers.email_branding`), no GoodTunes-blue identity beyond the one quiet hook line. From is a GoodTunes address displayed as "<press contact> · via GoodTunes®"; Reply-To reaches the preparer. (Remember the review-redirect env var — while set, this email lands in the review inbox instead.)
- [ ] **Estimate link** lands on the MRP-branded public `/e/:token` page on `memphis.makesvinyl.com`; the browser tab shows MRP's name + favicon (`WhitelabelDocumentHead`).
- [ ] **Review & Accept**: the accepted page (`/e/:token/accepted`) is also MRP-skinned. Note: it now carries a "Pay $X" button running in Stripe TEST MODE — decide whether to demo or skip it.
- [ ] **File uploads**: upload a test master/artwork as the client; it appears on MRP's side and is NOT publicly reachable (authed routes only — bare `/objects` links 404).

## 3. Client portal (post-accept)

- [ ] **Sign in as the client** on the white-label host; portal pages load their real data (keyed by the accepting customer / sent-to email; honest zeros for fresh clients).
- [ ] **Walk the pages**: `/next-steps` (project checklist + uploads), `/dashboard` (+ `/dashboard/next-steps`), `/projects`. These routes exist only on the white-label host family and only for presses whose branding sets the `mrp-light` skin (Memphis today). No GoodTunes/fan chrome leaks in (fan welcome sheet suppressed on white-label hosts).
- [ ] **Scoping**: portal data is scoped to MRP only.

## 4. Invites / adding people

- [ ] **Invite a new person** (our email); the invite email arrives, MRP-branded, and the accept link stays on the same white-label host it was sent from (accept base is derived from the press's host — the session cookie is host-scoped, so this matters).
- [ ] **Accept**, land in the right portal, confirm role/permissions.
- [ ] **Re-run with an already-claimed email/person**: a claimed person shows an "accepted" chip and the Invite affordance is gone — no fresh accept URL is minted.

## 5. Repeat-run hygiene

- Run the full loop at least twice: once with the review redirect on, once with real delivery.
- Duplicate rather than edit sent estimates; use clearly named test people.
- One person drives MRP-side, one plays the artist on a separate device/browser profile.

## Known gaps / talk-track cautions

- **Estimate emails**: `PRESS_ESTIMATE_REVIEW_RECIPIENT` may still redirect all estimate mail to the review inbox — verify and clear the env var before the live demo.
- **Pricing**: unpriced components block send by design — pre-price everything you'll demo.
- **Dark mode**: client portal/estimate pages are light-only for now (the dark-mode addendum was deliberately not applied).
- **New subdomains**: any new press slug needs manual domain linking in the Replit Domains panel before HTTPS works (~1 min, wildcard DNS already in place) — demo only on already-linked hosts.
- **Sent estimates**: immutable; revisions = duplicate — frame as an audit/trust feature.
- **Pay button**: the accepted-page payment moment is Stripe TEST MODE — don't run a real card on stage unless that's been switched.
