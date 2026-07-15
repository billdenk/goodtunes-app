---
name: Express 5 removed app._router — no re-dispatch trick
description: Why internal route re-dispatch via app._router.handle 500s and the sanctioned pattern instead
---

The rule: never re-dispatch a request into another route via `(app as any)._router.handle({...req}, res, ...)`. This project runs Express 5, which removed `app._router` (there is now an `app.router` getter), so `_router` is `undefined` and the call throws `Cannot read properties of undefined (reading 'handle')` → 500 on every wrapper route that uses it.

**Why:** All four partner-portal invite wrappers (artist teammate, artist→artist, artist→label, label portal) broke this way at once — Bill hit a 500 inviting a manager. Even on Express 4 the pattern was fragile: `{ ...req }` produces a plain object without the Express request prototype.

**How to apply:** Extract the target route's handler into a named function (e.g. `adminCreateInviteHandler`), register the route with it unchanged, and have wrappers mutate `req.body` then `return sharedHandler(req, res)` directly. Grep for `_router` if adding any internal forwarding.
