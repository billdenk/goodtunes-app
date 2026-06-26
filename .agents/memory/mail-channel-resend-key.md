---
name: Transactional mail = Resend, RESEND_API_KEY is the single gate
description: Why a missing RESEND_API_KEY is a silent, invisible total mail outage (admin OTP lockout), and that MAIL_FROM being set does not mean sending works.
---

All transactional email (admin 2FA OTP, customer sign-in codes, welcome-back,
early-access, ops alerts) goes through one Resend transport in `server/mail.ts`.
`RESEND_API_KEY` is the single secret that gates the whole channel.

**The trap:** when `RESEND_API_KEY` is absent, `sendViaResend` returns
`{ ok:false, reason:"RESEND_API_KEY not set" }` and deliberately does NOT push a
`[mail-failure]` log (it's treated as an "expected dev state"). So a missing key
in production is a *silent, invisible* total mail outage — no failure log, no
ops alert (an ops-alert email would need the same dead channel). The only signal
is whatever the caller logs itself.

**Why it matters:** the admin 2FA email-code step locks an admin out entirely if
the code never arrives. The fallback is the always-present `[admin-otp] code for
<email>: <code>` workflow-log line; the issuance path also logs a loud
`[admin-otp] EMAIL NOT DELIVERED ...` on any non-`ok` send so on-call knows to
read the fallback line.

**How to apply:**
- `MAIL_FROM` / `MAIL_REPLY_TO` / `OPS_ALERT_EMAIL` being configured does NOT mean
  sending works — they're independent of the API key. Always confirm
  `RESEND_API_KEY` exists (it's a global secret, not env-scoped).
- To verify delivery end-to-end without the UI: import `sendAdminOtpEmail` from
  `server/mail.ts` in a root-level tsx script (relative `./server/mail` + workspace
  cwd so `@shared/*` paths resolve) and check it returns `{ok:true}`. Use a real
  recipient — `example.com`/`.test`/`.invalid` etc. are dropped by the
  synthetic-recipient guard before Resend is ever called.
- For the API key itself, a Resend **"Sending access"** key is sufficient
  (least privilege); full-access is not required just to send.
