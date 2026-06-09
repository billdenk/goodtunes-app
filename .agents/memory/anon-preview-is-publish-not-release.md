---
name: Anonymous campaign preview is a publish concern, not a release-flag concern
description: Why "we launched the album but logged-out previews are still silent" is a stale-deploy symptom, not a release-state bug.
---

Anonymous 30s campaign previews (the `get.goodtunes.music/<artist>/<album>[/staging]`
share flow) are gated solely by `requireAuthOrCampaignPreview` + `campaignTier()` in
`server/routes.ts`. That gate checks: song exists, an entry in `CAMPAIGN_PREVIEWS`
matches the albumId, `campaignTier !== "none"`, mux ready, not previewHidden. It does
**NOT** check `albums.is_prepping` / release date at all.

**Why:** Flipping an album from prepping → released (the 8pm launch action) changes
which client route/mode renders (notify vs buy vs full album) but does **nothing** to
playback authorization. So if logged-out track playback 401s before launch, it will
still 401 after launch. The only lever that fixes anonymous previews is **publishing**
the server build that contains the campaign-preview wiring (`publicPreview: true` on
the campaign + the `if (c.publicPreview) return "preview"` branch in `campaignTier`).

**How to apply:** When an operator reports "we released but fans still can't hear the
previews," do NOT chase the release flag or the album row. Test the live endpoint
directly, anonymous:
`curl -X POST https://get.goodtunes.music/api/songs/<id>/playback-url` (and again with
`?k=<previewKey>` and `?k=<familyKey>`). If all three 401, the deployed SERVER predates
the anonymous-preview code → the fix is a republish, full stop. A 200 only with a token
means just the tokenless `publicPreview` branch is undeployed. Confirm the bundle is
stale by diffing the live `assets/index-*.js` hash against a fresh local `npm run build`.

**Link shapes (campaign album):** bare `/<artist>/<album>` (ShareSlugTwo) gates
`notifyOnly` on **`data.isPrepping` ONLY** — prepping → notify-only waitlist, LIVE
(is_prepping=false) → normal album surface (30s previews + Buy). Do NOT re-add an
`|| isCampaignRelease(...)` clause: that pinned a launched campaign to the "Get Early
Access" email-capture screen, silently blocking the public from previewing OR buying
after launch while logged-in/owner accounts (different entry) worked. ShareSlugOne
(`/<slug>`) already gated on isPrepping only — keep the two routes in parity.
`/<artist>/<album>/staging` (prefix or suffix) = ShareSlugStaging → full buy/gift
walkthrough even while prepping. Use the `get.` host (purchase funnel), never `my.`.

**Embargoed title track (`previewHidden`) does NOT unlock for owners:** desktop
`playableSongs` filters `isPreviewable !== false` for EVERYONE (server derives
`isPreviewable = !previewHidden`), and the campaign gate comment says it "stays locked
for everyone." So a buyer who purchased still can't play a previewHidden track — this is
a deliberate product call, surface it to Bill rather than silently flipping it.
