# Bottom Tab Bar — Launch Plan

Planning doc. No code in `client/src/components/BottomNav.tsx` changes from this — that's a follow-up task once a direction is signed off.

Mockups of the recommended bar live in the sandbox at:
- `/__mockup/preview/tab-bar-launch/Home`
- `/__mockup/preview/tab-bar-launch/Library`

---

## 1. What we ship today

`client/src/components/BottomNav.tsx` carries **4 slots**:

| Slot | Route | Job |
|---|---|---|
| Collection | `/collection` | The fan's library — albums they own (today's catalog browse, since we don't have a separate Home) |
| Playlists | `/playlists` | Custom playlists + Favorites virtual playlist |
| Chat | `/chat` | Demo: fan ↔ vendor messages, seeded from instrument vendor cards |
| Account | `/account` | Profile / orders / settings, with avatar tile in the bar |

Plumbing that comes out if Chat is dropped:
- `subscribeChats` + `totalUnread()` subscription in `BottomNav.tsx`
- `chatIcon`'s `#FF5470` unread badge
- `/chat` + `/chat/:id` route registrations in `App.tsx`
- The `Chat`/`ChatThreadPage` page exports stay in the build for the demo flag (see §7).

## 2. Candidate destinations

Every fan-facing route that could plausibly earn a tab slot, with launch traffic expectation:

| Destination | Launch traffic | Notes |
|---|---|---|
| **Library** (today's Collection) | Very high | The "what do I own and want to play" surface. Always-on. |
| **Home / Browse** | High | Curated discovery — "New on GoodTunes", "Albums with SuperCredits™", featured artists. Doesn't exist yet; would be built. |
| **Search** | High once catalog > ~50 albums | At ~17 albums it's overkill. By the time the catalog has 50+ rows it's the second-most-used surface in every music app. |
| **Playlists** | Medium | Real, but secondary to Library. Apple Music puts playlists *inside* Library. |
| **GoodDeeds** | Low–medium | Emotional surface (purchase certificates). High-meaning, low-frequency. Better as a destination off Account or Library. |
| **Now Playing** | Medium | Already reachable via the persistent MiniPlayer — a tab for it is redundant. |
| **Bookmarks / Saved** | Unknown | Exists today (`/account/bookmarks`) but lightly used. Not tab-worthy at launch. |
| **Chat** | Demo only | Pulled per task. See §7. |
| **Account** | Medium | Profile, orders, GoodDeeds, prefs. Conventional rightmost slot. |

## 3. Reference: Apple Music + Spotify

**Apple Music (iOS, 2026):** Home · New · Radio · Library · Search *(5 slots)*. Deliberately **not** tabs: Now Playing (mini-player), Playlists (live inside Library), Account (top-right avatar on Home/Listen).

**Spotify (iOS, 2026):** Home · Search · Your Library *(3 slots)*. Premium and Create surface as cards in Home, not tabs. Notably, **Search has its own tab in both apps** — that's the load-bearing signal: if neither Apple nor Spotify trusts users to hunt for search inside another tab, neither should we.

Things both apps agree on:
- Library always gets a slot.
- Search always gets a slot.
- Playlists never get a slot — they're a section inside Library.
- Account / settings is not a tab — it's an avatar in the corner of Home or Library.
- Now Playing is never a tab; the persistent mini-player handles it.

## 4. Candidate layouts

### Layout A — Apple-Music-parallel (5 slots)
Home · Browse · Search · Library · Account
- **Job of each**: Home = curated landing. Browse = "new + featured" feed. Search = catalog hunt. Library = owned albums + playlists. Account = profile / orders / GoodDeeds.
- **Trade-off**: 5 slots is dense at 390px. Browse and Home are barely distinguishable until the catalog grows past ~100 albums. Forces us to design and ship two discovery surfaces before launch.

### Layout B — GoodTunes-first (4 slots) — **RECOMMENDED**
Home · Library · Search · Account
- **Job of each**:
  - **Home** — curated landing for fans. Hero: "Continue listening" + "New from artists you own" + "New on GoodTunes" + "Albums with SuperCredits™". This is where the streaming-handoff banner ("X Album is live on Qobuz — open now") fires when releases go to streaming. Also the natural home for a "Buy an album as a gift" entry once that ships.
  - **Library** — albums you own + Playlists + Favorites (matches Apple Music's "Library tab contains playlists" model). Drops the separate Playlists tab.
  - **Search** — single search field over the whole catalog (albums, songs, artists, gear). At ~17 albums it's light; sized for the day we have 200.
  - **Account** — profile, orders, **GoodDeeds**, downloaded files, settings.
- **Demoted**: Playlists → inside Library (Apple pattern). Chat → removed (see §7). GoodDeeds → inside Account.
- **Trade-off**: GoodDeeds drops a level deeper than today. Mitigated by surfacing the GoodDeed cert as the post-purchase landing already (Welcome route) and as a top-row card in Account.

### Layout C — Library-heavy (5 slots)
Home · Library · Playlists · GoodDeeds · Account
- **Job of each**: Same as B except Playlists and GoodDeeds get dedicated tabs. No Search tab.
- **Trade-off**: Burns two slots on surfaces neither Apple nor Spotify dedicate a tab to, and leaves Search homeless. By the time the catalog is 50+ albums, fans will be looking for Search and we'll have to redesign the bar anyway. Don't do it.

## 5. Recommendation — Layout B

**Home · Library · Search · Account.** Four slots, same count as today, no density change to the bar.

Why:
- **Search is the load-bearing post-launch addition.** Both reference apps tab it. Burning a slot on it now means we don't redesign the bar the day the catalog crosses 50 rows.
- **Home unlocks the streaming-handoff loop.** The "X is live on Qobuz" banner needs a real first-screen surface that isn't the user's library. Without Home, that banner has to compete with album thumbnails on Collection.
- **Library absorbing Playlists matches both Apple and Spotify** and gives GoodTunes-original playlists (e.g. "Songs with SuperCredits™") a natural shelf alongside the user's own lists.
- **Account holds the low-frequency-but-meaningful stuff** (orders, GoodDeeds, settings). That's the conventional shape — Apple and Spotify both keep account out of the tab bar but we ship it as a tab because we sell things; fans need a one-tap path to "where's my order."

Open implementation question (not blocking this plan): does the Home tab need a header avatar in the top-right (Apple pattern, makes Account two taps away from anywhere)? Probably yes, but settle that with the Home redesign task.

## 6. Mockups

Two canvas mockups live in the sandbox so this can be reviewed against real content rather than in the abstract:

- **`/__mockup/preview/tab-bar-launch/Home`** — recommended bar over a Home view (Continue Listening + New on GoodTunes + Streaming-Live banner + Albums with SuperCredits™ rail).
- **`/__mockup/preview/tab-bar-launch/Library`** — recommended bar over a Library view (Recently Played rail + Albums/Songs/Artists/Playlists tabs + library grid).

The bar primitive is intentionally inline in the mockup file — it'll graduate into `BottomNav.tsx` only after the operator signs off.

## 7. What happens to Chat

**Removed from v1 launch, kept behind a build flag for pitch-deck demos.**

- The Chat tab disappears from `BottomNav.tsx`.
- `/chat` and `/chat/:id` routes stay registered behind `import.meta.env.VITE_DEMO_CHAT === "true"` (or similar). The demo build (`VITE_DEMO_CHAT=true npm run dev`) keeps the tab visible exactly as today.
- The chat-bubble entry-points inside instrument sheets (`AlbumDetail.tsx`) gate on the same flag. With the flag off, they don't render — the vendor row's other CTAs stay.
- `chatStore` + the `Chat`/`ChatThreadPage` page components stay in the codebase. Removing them entirely is a separate cleanup once we're certain the demo isn't needed for fundraising.

Rationale: the demo is genuinely valuable for the pitch deck (proves "fans reach brands directly inside the player"), but it isn't a shipping feature. Hiding behind a flag is cheaper than tearing it out and re-implementing later, and avoids the "we used to have chat — what happened?" question if it returns post-funding.

## 8. Open questions for the operator

1. **Home tab content priority** — what's the top rail on day one? Three options to choose from once we build it:
   (a) "Continue Listening" (Apple-style — most recent activity first)
   (b) "New on GoodTunes" (label-first — celebrates the catalog)
   (c) "Streaming-Live alerts" (when relevant, push to top; otherwise hide)
   The mockup uses (a) + (b) stacked; (c) appears conditionally as a banner.
2. **Does Search ship at v1 launch or v1.1?** If v1.1, the recommended bar still works — the Search tab just opens a "Coming soon" empty state with a stub input. Better than redesigning the bar to add Search later.
3. **Bookmarks/Saved at launch?** Today it lives under `/account/bookmarks` and that's where it stays in the recommendation. Confirm we don't want a top-level shelf for it.
4. **Avatar-in-Home-header?** Apple puts the account entry top-right of Home so Account is also reachable from there. Adopt for parity, or rely on the Account tab alone? Recommend adopting — it costs nothing and matches habit.
5. **Demo Chat: keep the build flag indefinitely, or sunset after fundraising?** Doesn't need to be answered now, but worth flagging — the codebase carries dead code while the flag exists.

