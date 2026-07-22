---
name: npm overrides must reference direct deps with $name
description: EOVERRIDE breaks post-merge npm install when an overrides pin drifts from a direct dependency's version
---

Rule: if a package appears in BOTH `dependencies` and `overrides` in package.json, the override must be the reference form `"pkg": "$pkg"`, never a literal semver range.

**Why:** npm hard-fails install with `EOVERRIDE: Override for pkg@X conflicts with direct dependency` the moment the two ranges differ. This bit us when a task bumped the direct `tar` dependency (security fix) while `overrides.tar` still held the old range — every subsequent post-merge setup failed at `npm install` until the override was changed to `"$tar"`.

**How to apply:** when adding or bumping a direct dependency, grep the `overrides` block for the same name; use `$name` there so transitive copies stay pinned to whatever the direct version is, with no lockstep maintenance. The overrides block exists to force patched versions onto transitive dependents — `$name` preserves that.
