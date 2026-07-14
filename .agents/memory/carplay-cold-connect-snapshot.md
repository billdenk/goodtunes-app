---
name: CarPlay cold-connect snapshot + headless tap-to-play
description: Why cold CarPlay connect needs an on-device snapshot for browse, the sign-out wipe rule, and the manifest-free headless web-player bring-up that makes cold tap-to-play work.
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

**Tap-to-play from a stone-cold connect — IMPLEMENTED (manifest-free), pending
on-device verification.** Design (all in-repo; `UIApplicationSceneManifest`
untouched — that's the hard constraint, see `ios-scene-manifest-black-screen.md`):

- **Headless bring-up:** a `HeadlessWebPlayer` process-singleton instantiates the
  storyboard `MainViewController` off-screen from CarPlay `didConnect` when no
  bridge VC is live; `SceneDelegate` **adopts** the same VC as window root if the
  phone opens later (never two web players). Kill switch is a UserDefaults bool
  stored INVERTED (`…disabled`) so the feature defaults ON under older web
  bundles; JS re-persists it every boot (`configureHeadlessBringUp()`), so a web
  publish can turn it off with no rebuild.
- **Tap buffering is three-layered** — each layer covers a different gap: (1) tap
  before plugin `load()` → `NowPlayingStore.pendingIntent` (last-wins), drained by
  `load()` after callbacks register; (2) tap before the JS listener attaches →
  play-intent emits use `notifyListeners(retainUntilConsumed: true)` + a `ts`
  payload, JS drops >2min-old commands (a retained tap from an aborted boot must
  not blast audio hours later — retained events NEVER expire on their own); (3)
  command before the library queries resolve → `PlayerContext` stashes + replays
  once `/api/my-albums` + song list land.
- **Audio-session etiquette (architect-critical):** a headless boot must NOT
  `setActive(true)` on connect — that kills Spotify/radio the fan was playing just
  by plugging the phone in. Defer activation to the first genuine play intent
  (one-shot guard; `setPlaybackState(isPlaying)` also triggers it but never
  re-activates recurringly).

**How to apply:** the Swift half needs a manual `ios-testflight` Codemagic build +
the on-device pass in `docs/native-builds.md` step 7 before `docs/capabilities.md`
may claim cold tap-to-play. Until then the honest customer-facing boundary is
still browse + metadata.

Unchanged hard rules still apply: `CPNowPlayingTemplate` is push-only, never rooted
or in a tab bar (SIGABRT) — see `carplay-restricted-entitlement.md`; ship only
behind `CARPLAY_GRANTED`; device-only verification (no Xcode/head unit in the
container).
