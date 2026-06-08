# Legacy gogoods.com QR → GoodTunes provenance bridge — 2026-06-08

Fans who bought physical signed GoodDeed certificates in the **gogoods.com** era
hold cards whose **printed QR codes point at gogoods.com paths that resolve to
nothing today**. This bridge makes those old codes land on the fan's current
GoodTunes provenance page (`/g/:shortId`) — or, when a code can't be matched, on
a friendly lookup page instead of a dead 404.

Out of scope (unchanged by this task): reprinting certs, the `/g/:shortId` page
design, and the DNS/hosting forward that points the old gogoods.com host at the
resolver (operator/infra — see "Forward rule" below).

## What the old QR encodes

The gogoods export (`attached_assets/gogoods_export_1779758914784.zip`) carries a
`collectible` table whose **bigserial `id`** is the only stable per-copy
identifier. We key the resolver on that bare integer id.

**Caveat — verify against a physical cert.** The dump also ships the pg_sqids
`sqids` schema, a strong hint the old *public* URLs **sqids-shortened** that
integer id (so a printed code may read e.g. `Xk3p` rather than `5`). No sqids
config/alphabet/data was exported, so we cannot reproduce the shortening here and
instead key on the bare integer. If a real cert in hand shows a non-numeric code,
the missing piece is only the sqids alphabet + min-length: decode to the integer
id, then this same mapping applies unchanged. The resolver already strips any
non-digit characters, so a numeric code with trailing punctuation/whitespace
still resolves.

## The mapping (backfill)

`scripts/backfill-gogoods-collectible-ids.ts` stamps
`user_albums.legacy_gogoods_collectible_id` (the collectible's bigserial id) onto
each owned copy, resolving legacy → live ids via the pointers stamped at import
time:

- `customer_users.legacy_gogoods_id` = gogoods `user.id`
- `albums.legacy_gogoods_id` = gogoods `release.id` (uuid)
- `user_albums.certificate_number` = collectible `index` (copy number)

Only ACTIVE, owned (`user_id != 0`) collectibles are considered. The importer's
`user_albums (user_id, album_id)` unique index meant only the **lowest-index**
copy per (fan, album) kept an owned row; **extra copies have no owned row and no
cert**, so their QR correctly lands on `/find-gooddeed` rather than a wrong page.

The script is idempotent and non-destructive: it only stamps rows where the
column is still NULL, short-circuits on a `post_merge_data_backfills` marker
(`task_1514_gogoods_collectible_ids`), and self-gates — a fresh dev clone with no
gogoods import writes nothing and **leaves the marker unset** so it re-checks
cheaply once data lands. It is wired into `scripts/post-merge.sh` for dev + prod,
after the `migrate_gogoods_collectible_id` DDL that adds the column + unique
index.

## The resolver

`GET /legacy/g/:code` (in `server/certificates.ts`, registered before the SPA
catch-all):

1. Strip the code to digits.
2. Join `user_albums` → `orders` (on customerId + albumId +
   goodDeedNumber == certificateNumber) → `signed_cert_certificates`, filtered by
   `legacy_gogoods_collectible_id = <code>`.
3. On a hit, **302 → `/g/<shortId>`** (a phone camera lands straight on the live
   provenance page).
4. On any miss — empty/non-numeric code, no matching owned copy, or a lookup
   error — **302 → `/find-gooddeed`**. Never a 404.

`/find-gooddeed` (`client/src/pages/FindGoodDeed.tsx`) is a brand-styled lookup
page that tells the fan their GoodDeed lives in their GoodTunes library and to
sign in with the email they bought it with, plus a support mailto.

## Forward rule (operator / infra — out of scope for the app)

The app resolver lives at `/legacy/g/:code` on the customer-facing GoodTunes host
(`my.goodtunes.music` / `get.goodtunes.music`; the bare `goodtunes.music` apex is
the Webflow marketing site and is not involved). To make the **printed** gogoods
codes work, the operator points the old gogoods.com QR path at this resolver:

```
https://gogoods.com/<old-path>/<code>  →  https://my.goodtunes.music/legacy/g/<code>
```

i.e. a host/path forward (301/302 or edge rewrite at the gogoods.com host) that
preserves the trailing code and rewrites it onto `/legacy/g/:code`. The resolver
tolerates extra path/punctuation around the numeric code. If the printed code is
sqids-shortened (see caveat above), decode to the integer id before forwarding,
or extend the resolver with the sqids alphabet once it's recovered from a
physical cert.

## Verification done (dev)

A synthetic fixture (one customer/album/owned-copy/order/cert mapped to a real
collectible row from the export) confirmed end to end: the backfill stamped the
collectible id onto the owned copy; `/legacy/g/<id>` 302'd to the correct
`/g/<shortId>`; trailing punctuation still resolved; and unknown/non-numeric
codes 302'd to `/find-gooddeed`. Fixture rows + marker were removed afterward.
