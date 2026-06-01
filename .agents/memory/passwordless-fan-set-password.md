---
name: Passwordless fan set-password
description: Why an account-initiated "set a password" needs its own authed endpoint, not forgot-password.
---

# Letting a passwordless fan add a password

`POST /api/auth/forgot-password` (customer) intentionally **skips fans with no
password** (`if (c && c.password)`) — it's unauthenticated + non-enumerating and
"reset" makes no sense for a magic-link-only account. So it cannot bootstrap a
first password for legacy/passwordless fans.

**Rule:** an account-initiated "set a password" affordance must use a separate
`requireCustomer`-gated endpoint that mints a customer reset token and emails the
`/reset-password/:token` link **regardless of whether `customer_users.password`
is null**. It reuses the rest of the reset infra (token table, /reset-password
page, `POST /api/auth/reset-password`, `sendCustomerPasswordResetEmail`).

**Why:** keeps magic-link the default while letting a fan opt in; mirrors the
app's initiate-in-account / complete-via-email pattern (account merge).

**How to apply:** for any "add/change password" on the fan side, do NOT reuse
forgot-password — it'll silently no-op for the exact passwordless fans you're
targeting. `sendCustomerPasswordResetEmail(..., firstTime)` swaps Set vs Reset copy.
