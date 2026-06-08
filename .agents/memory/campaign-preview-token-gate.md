---
name: Campaign preview token gate
description: Anonymous pre-launch music previews must verify the share TOKEN at the master-signing endpoint, never treat the song id as the capability.
---

# Anonymous campaign preview must verify the token, not the song id

The pre-launch campaign model (e.g. Nightbirde "Hope") gates unreleased music behind a
single unguessable share link whose `?k=` token resolves to a tier (none / preview /
family). The discovery endpoint (`/api/campaign/:artist/:release/access`) only returns
track ids when the token is valid.

**Rule:** the relaxed playback-url middleware that lets an ANONYMOUS visitor mint a
signed Mux URL MUST re-validate the campaign token (tier != "none") for the song's
album. It must NOT authorize on `(campaign album) && mux-ready && !previewHidden` alone.

**Why:** an early draft authorized anonymous playback purely on song-id membership in a
campaign album ("knowing the song id is the capability"). That is broken access control:
a leaked/guessed song id, or a wrong/empty token, could still mint a signed preview —
defeating the whole "bare/wrong URL shows no music" promise. Song ids are not secrets
(they ride in API payloads, share state, logs).

**How to apply:** keep the `!previewHidden` embargo filter duplicated on BOTH the access
endpoint and the playback middleware (the embargoed title track must never preview for
any tier). Forward the token from the client on the playback request (in the JSON body,
not the query string, to keep it out of access logs) by reading `?k=` off the page URL;
a signed-in fan ignores the token entirely (ownership decides server-side). Verify with a
matrix: {no token, wrong token, preview token, family token} × {embargoed, non-embargoed}
plus a non-campaign song with a valid-looking token (must stay 401).

**Locked content is title-only metadata, never a handle:** the access endpoint also
returns the embargoed material so the campaign page can render a realistic LOCKED album
view — but `lockedTracks` carry `{title, trackNumber}` only and `videos` carry `{title}`
only. NEVER include a song/video id or `muxPlaybackId` for locked content; those fields
are the playback capability, and the client renders locked rows as non-interactive
(grayed + Lock icon), so an id would be both a leak and dead weight. Only previewable,
non-embargoed, Mux-ready tracks get ids + handles.

**Operator turned the bare link PUBLIC (Bill's call):** the hope config now carries
`publicPreview:true`, so the bare, token-less URL (`get.goodtunes.music/nightbirde/hope`)
resolves to tier **preview**, not "none" — fans get 30s previews + the dismissable offer
card with no token at all. This deliberately relaxes the "token IS the capability" rule
for THIS campaign's discovery/preview tier. It is safe because the two hard protections
are unchanged: the embargoed title track stays `previewHidden` (locked for every tier)
and previews are still server-capped 30s signed Mux (masters never leave). Do NOT read
this as "song-id alone authorizes" — `publicPreview` is an explicit per-campaign opt-in,
and the **family/buy** tier is still gated (only `staging` context or the family token).

**`staging` is a tier source alongside the token:** `campaignTier(c, token, staging)`
returns family if `staging || familyKey`. Two client routes set `staging`:
`/staging/:artist/:release` and the suffix form `/:artist/:release/staging` (the link Bill
shares with family). The access endpoint reads `req.query.staging === "1"`. Order the
suffix route BEFORE the generic two-segment `/:a/:b` share route in App.tsx or it shadows.

**Price comes from the server, not the client bundle:** the campaign config holds
`prices:{bundle,signed}` (whole dollars) and the access payload echoes it on every tier;
the client overrides its local `RELEASES[key].prices` with `data.prices` so the Buy label
+ Buy/Give totals all draw from the server figure. Re-price by editing the server config.

**Hardening backlog:** campaign keys currently live as hardcoded literals in
`server/routes.ts`; move to secret/config storage with rotation for real operational
secrecy.
