---
name: Session-save race on redirect-then-immediate-callback flows
description: Await req.session.save() before any redirect whose landing page immediately calls an endpoint that reads the just-written session state.
---

**Rule:** any handler that stamps session state and then redirects to a page that immediately calls back (e.g. a 2FA challenge page auto-POSTing its start endpoint) must explicitly `await new Promise((res, rej) => req.session.save(e => e ? rej(e) : res()))` before the redirect.

**Why:** express-session's implicit end-patch save races the follow-up request against the PG store write; the follow-up occasionally loads a pre-save session and fails auth (intermittent, order-dependent, Heisenbug-flaky under test).

**How to apply:** check every new challenge/handoff flow (OAuth callbacks, invite accepts, phase transitions) that redirects into a page performing an immediate authed call.
