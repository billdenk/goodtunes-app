---
name: App-review demo account seed
description: How the sealed Apple/Google review demo account + Sampler album is provisioned, and the Mux-drift-safe master-copy trick.
---

The store-review demo fan account + its published "GoodTunes Sampler" album are seeded in `scripts/post-merge.sh` (runs against both dev + prod), with fixed IDs and all `ON CONFLICT (id) DO NOTHING` so the seed is convergent and never clobbers operator edits. Ownership is granted with a real `user_albums` row (not a purchase) — that is exactly what the playback gate checks, so the album plays full-length and lands in Library with no Buy (price left NULL) and no Chat.

**Mux-drift-safe master trick (the durable lesson):** never hardcode Mux playback/asset ids in a seed — they differ per environment clone. Instead create the demo song rows with `INSERT INTO songs (...) SELECT ... FROM songs WHERE id='<a static-seed source song>'`, copying that env's own valid mux ids + lyrics. Mux is a shared account across dev/prod, so any ready playback id resolves in both regardless.

**Why:** review accounts must work identically in prod, but we can't run SQL against prod by hand and Mux ids aren't stable across clones; copying from a stable static-seed song sidesteps both at once. Password: only a scrypt hash is committed, plaintext goes to the operator out-of-band and is rotated per submission via admin reset (DO NOTHING means a re-merge never reverts a rotation).
