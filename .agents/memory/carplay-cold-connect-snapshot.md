---
name: CarPlay cold-connect snapshot (browse works, audio deferred)
description: Why cold CarPlay connect needs an on-device snapshot for browse, why tap-to-play is impossible from cold, and the sign-out wipe rule.
---

On a **cold** head-unit connect (phone app fully quit), iOS spins up **only the
CarPlay scene**. The phone window scene that hosts the Capacitor web player — and
its hidden `<audio>` element — is never created. Consequences that drive the whole
design:

- The native `NowPlayingStore` is **empty** (browse lists, recents, and now-playing
  metadata are all *pushed from JS* via `PlayerContext` → `nativeNowPlaying.ts` →
  `NowPlayingPlugin`). Nothing publishes on a cold connect, so without persistence
  the car shows empty tabs + the generic GoodTunes logo forever.
- There is **no audio engine**: audio is produced by the web player's `<audio>`.
  With no web player, car transport commands have nothing to talk to.

**Fix that shipped (browse only):** persist a compact snapshot to disk from the
plugin (catalog/recents on publish, now-playing on `setMetadata`, a **downscaled**
JPEG on `loadArtwork`) and `hydrateFromDisk()` at the top of the CarPlay
`didConnect`. Snapshot is the fan's own owned-album titles/art + recents — no
secrets/tokens. Neutral empty copy ("Your library"/"Your collection") replaces any
"open the app on your phone" message (App-Review rejection trigger).

**Connect→resync handshake:** `didConnect` fires a **bounded** retry
(`scheduleResync(attempt:)`) — guard `interfaceController != nil`, 2s recursion,
`attempt >= 15` ceiling — and the web player must publish catalog/recents **as soon
as its queries resolve** (only when `length > 0`), not just on change, or a slow
first load strands the car on the cached view. **Gotcha:** `hydrateFromDisk()` runs
*before* the resync, so the catalog is already non-empty on every connect after
first use — a naive `if !catalog.isEmpty { return }` at the top makes resync
**dead** (fresh data never re-requested on a warm connect; a paused warm connect
sits at the hydrated 0:00). Fire attempt 0 **unconditionally**; apply the
catalog-non-empty stop only to retries (`attempt > 0`).

**Sign-out MUST wipe the snapshot AND stop re-persisting.** `useAuth` logout calls
`clearNowPlayingLibrary()` (→ plugin `clearLibrary`, a **separate** method from the
transient `clear`) after `queryClient.clear()`, or the next fan on the device sees
the previous fan's library/track in the car. But logout does **not** stop web-player
audio, so a still-playing/auto-advancing track's `setMetadata` → `persistMetadata`
would re-mint a snapshot with the signed-out fan's track right after the wipe.
Guard it: `clearSnapshot()` sets a `suppressPersistUntilFreshCatalog` flag that
makes `saveSnapshot()` a no-op until the next **non-empty** `updateCatalog(...)`
(re-login) re-arms it. All no-op off native iOS.

**Deferred — tap-to-play from a stone-cold connect.** Starting audio when the app
was never opened needs an **off-screen web-player bring-up**: a process-singleton
`CAPBridgeViewController`/webview owned at app level that either scene can attach to
(the cold CarPlay scene can't reuse the phone `SceneDelegate` window — it doesn't
exist). **Why deferred:** that's a real refactor, and it must NOT touch
`UIApplicationSceneManifest` (two prior manifest changes black-screened the
store-signed binary — see `ios-scene-manifest-black-screen.md`).
**How to apply:** cold connect = browse + metadata today; audio needs a warm
connect (app opened once this session). Tracked in `docs/roadmap.md` "CarPlay
cold-connect tap-to-play".

Unchanged hard rules still apply: `CPNowPlayingTemplate` is push-only, never rooted
or in a tab bar (SIGABRT) — see `carplay-restricted-entitlement.md`; ship only
behind `CARPLAY_GRANTED`; device-only verification (no Xcode/head unit in the
container).
