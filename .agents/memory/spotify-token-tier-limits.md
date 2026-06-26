---
name: Spotify token tier strips artist fields
description: What this app's Spotify client-credentials token can and cannot return, and the album-limit quirk
---

This app's Spotify client-credentials token (SPOTIFY_CLIENT_ID/SECRET, getAccessToken in server/lib/spotify.ts) returns a RESTRICTED tier:

- `/v1/search?type=artist` and `GET /v1/artists/{id}` return artist objects **stripped of followers/popularity/genres** — those fields are `undefined`, not 0. So any disambiguator built on follower count / popularity / genres is silently empty for every candidate (this is the root of the "popularity=0 for all" symptom in the add-artist picker).
- `GET /v1/artists/{id}/top-tracks?market=US` → **403 Forbidden** for ALL markets.
- `GET /v1/artists/{id}/albums?include_groups=album,single&market=US` → **200 OK with real release names** — this is the only enrichment endpoint that works, so the add-artist picker disambiguator uses the most-recent release name (max release_date).

**Album limit quirk:** the albums endpoint caps `limit` at **10** for this token — `limit=15/20/50` return `400 "Invalid limit"`. Use limit ≤ 10.

**Why:** the planned follower/genre/top-track disambiguator for the add-artist picker was impossible on this token; switched to latest-release name. If credentials are ever upgraded these limits may lift.

**How to apply:** before building any Spotify-data feature on this token, assume followers/popularity/genres are absent and top-tracks 403s; verify a fresh live curl rather than trusting the docs' field list.
