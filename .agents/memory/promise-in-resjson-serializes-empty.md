---
name: Promise placed inside res.json() serializes to {}
description: A bare/un-awaited Promise used as a VALUE in a res.json({...}) object literal ships as {} to the client — must await before placing it.
---

# A Promise inside a res.json() object literal serializes to `{}`

`res.json()` (i.e. `JSON.stringify`) does NOT await nested promises. If you put a
Promise (a bare IIFE returning `.then(...)`, a `.then(...)` chain, or an un-awaited
async call) directly as a value inside the object literal you pass to `res.json({ ... })`,
that field serializes to an empty object `{}` on the wire — silently, no error, and
dev "works" for every other field.

**Why this is a recurring landmine here:** route handlers in this repo build big
`res.json({ ... })` literals with many fields. It is tempting to inline a small
transform (e.g. "filter hidden formats") as `field: getX().then(c => ...)`. That
compiles and type-checks, but the transformed field arrives as `{}`. The
invited-press catalog regression was exactly this: a hide-format feature replaced
`catalog: await getPressCatalog(id)` with an un-awaited IIFE, so the admin SellPanel
received `catalog: {}`, every per-row catalogFormat went null, `usingCatalog` went
false, and pricing collapsed to the MRP cost fallback — a cross-press data leak
(one press showing another's pricing/imagery), not just missing pricing.

**How to apply:** any value in a `res.json({ ... })` literal that needs async work
must be fully `await`ed first — compute it into a `const` above the literal, or use
`await (async () => { ... })()`. When auditing, grep route files for `then(` /
`(async () =>` / `(() =>` appearing as a field value inside `res.json(`. The healthy
sibling endpoint `GET /api/admin/manufacturers/:id/catalog` does
`res.json(await getPressCatalog(pressId))` — copy that shape.
