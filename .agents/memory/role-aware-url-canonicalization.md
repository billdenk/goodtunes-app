---
name: Role-aware URL canonicalization
description: Prevent valid permission-scoped deep links from being erased while account authority is still loading.
---

Do not canonicalize a permission-scoped query parameter while the caller's
role or capabilities are unresolved. Preserve the initial URL until authority
is known; then keep an allowed state or normalize a disallowed state to the
safe default. If the user made a selection while authority was loading, that
explicit interaction wins over the initial URL snapshot.

**Why:** A fail-closed unresolved role can look identical to a resolved caller
without permission. Eager URL cleanup can therefore erase a valid partner-only
deep link before the asynchronous role query proves the caller is allowed,
leaving them on the wrong default view after refresh.

**How to apply:** Any tab, filter, action, or nested route whose validity
depends on asynchronously loaded authority should carry an explicit
authority-resolved signal. Delay history replacement until it is true, and
test both delayed authorized resolution and delayed unauthorized resolution.