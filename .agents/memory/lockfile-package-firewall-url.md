---
name: Lockfile package-firewall resolved URLs
description: npm installs inside the repl can rewrite package-lock.json resolved URLs to a Replit-internal host that breaks external CI.
---

# Lockfile package-firewall resolved URLs

Rule: before committing, grep `package-lock.json` for `package-firewall.replit.local` and restore any hit to `https://registry.npmjs.org/...` (integrity hash stays valid — same tarball).

**Why:** npm running inside the workspace sometimes records the Replit package-firewall proxy as a dependency's `resolved` URL. That host only resolves inside Replit, so a clean `npm ci` in GitHub/Codemagic/any external CI fails. This got a task's completion review rejected as a deployment blocker.

**How to apply:** any time an install/update touches package-lock.json, sweep for the internal host before commit; the redirect-follower in any external-fetch helper must also wrap `new URL(location, base)` parse failures into the domain error type, or a malformed 3xx Location escapes as a 500 instead of the promised 4xx.
