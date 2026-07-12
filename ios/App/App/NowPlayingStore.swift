import Foundation
import UIKit
import MediaPlayer

/// A single browsable queue entry mirrored from the web player (PlayerContext's
/// Up Next). Kept deliberately flat — only what a CarPlay list row needs.
struct NowPlayingQueueEntry {
    let id: String
    let title: String
    let artist: String
    let artworkUrl: String?
    /// Track length in seconds (0 when unknown) — shown in the CarPlay Up
    /// Next row's detail text. Unused off-CarPlay.
    let duration: Double
}

/// A single track inside a browsable catalog album (CarPlay album-detail row).
struct CatalogTrack {
    let id: String
    let title: String
    let artist: String
    let duration: Double
}

/// A browsable album in the CarPlay Library (root list). `tracks` is the
/// album's playable tracklist; tapping one asks JS to play the album from
/// that track. Kept flat — only what CarPlay list rows + tap-to-play need.
struct CatalogAlbum {
    let id: String
    let title: String
    let artist: String
    let artworkUrl: String?
    let tracks: [CatalogTrack]
}

/// A browsable playlist in the CarPlay Collection tab. Kept flat — only what
/// a CarPlay list row needs. Tapping one sends a `playPlaylist` remote command
/// back to JS, which fetches + plays the playlist without needing pre-pushed
/// track data.
struct CatalogPlaylist {
    let id: String
    let name: String
    let artworkUrl: String?
}

/// A single "recently played" entry mirrored from the web player (Recents
/// tab). Tapping it asks JS to play `albumId` — starting at `trackId` when the
/// recent was a specific track, else the album from the top. Kept flat — only
/// what a CarPlay list row + tap-to-play need.
struct RecentEntry {
    let albumId: String
    /// Present when the recent was a specific track; nil for album recents.
    let trackId: String?
    let title: String
    let subtitle: String
    let artworkUrl: String?
}

/**
 * NowPlayingStore — the in-process bridge between `NowPlayingPlugin` (which
 * talks to JS) and `CarPlaySceneDelegate` (which renders the in-car UI).
 *
 * Why a separate singleton: the CarPlay scene delegate is instantiated by
 * UIKit when a head unit connects — it has no reference to the Capacitor
 * plugin instance, and the plugin has no reference to the scene. This shared
 * store lets them find each other without either owning the other's lifecycle:
 *
 *   - the plugin pushes the latest catalog (browsable Library) in via
 *     `updateCatalog(...)` (from the JS `setCatalog` call) and the latest Up
 *     Next queue via `updateQueue(...)` (from `setQueue`), and registers
 *     `onPlayAlbum` / `onPlayIndex` / `onResync` so CarPlay taps + connect
 *     events can be forwarded back to JS,
 *   - the CarPlay scene reads `catalog` / `queue` to build its lists and
 *     registers `onCatalogChanged` / `onQueueChanged` so live updates refresh
 *     the UI, and calls `requestResync()` on connect so JS re-publishes the
 *     current now-playing metadata + queue + catalog (iOS resets
 *     MPNowPlayingInfoCenter around scene connect, so a one-shot resync is how
 *     the head unit gets real title/artist/art instead of the app name/icon).
 *
 * Now-playing metadata + transport are NOT routed through here: CarPlay's
 * `CPNowPlayingTemplate` reads `MPNowPlayingInfoCenter` /
 * `MPRemoteCommandCenter` directly, which the plugin already populates for the
 * lock screen, so the now-playing surface works with zero extra wiring. Only
 * the browsable catalog/queue + the connect resync need this side channel.
 */
final class NowPlayingStore {
    static let shared = NowPlayingStore()
    private init() {}

    private(set) var queue: [NowPlayingQueueEntry] = []
    private(set) var currentIndex: Int = 0
    /// The fan's browsable Library (owned GoodTunes releases + tracklists),
    /// mirrored from JS. Empty until the phone WebView publishes it.
    private(set) var catalog: [CatalogAlbum] = []
    /// The fan's "recently played" list (albums + tracks), mirrored from JS.
    /// Empty until the phone WebView publishes it.
    private(set) var recents: [RecentEntry] = []
    /// The fan's playlists, mirrored from JS. Only metadata (id/name/artwork)
    /// is pushed — tracks are loaded on demand when the driver taps a playlist
    /// row, which sends a `playPlaylist` command back to JS.
    private(set) var playlists: [CatalogPlaylist] = []
    /// Whether the *current* now-playing track is one of the fan's favorites.
    /// Drives the CarPlay Now Playing heart button's filled/outline state.
    private(set) var isCurrentFavorite: Bool = false

    // MARK: - Cold-connect snapshot (on-device persistence)
    //
    // A COLD head-unit connect (the phone app was never opened this session)
    // spins up ONLY the CarPlay scene — the phone UIWindowScene that hosts the
    // WebView + NowPlayingPlugin is never created, so JS never runs and nothing
    // is ever pushed into this store. Without persistence the three tabs render
    // empty placeholders and Now Playing shows the app icon.
    //
    // So we write-through a compact snapshot (owned catalog + recents + queue +
    // last now-playing metadata/art + favorite) to UserDefaults whenever the
    // web player publishes it, and `hydrateFromDisk()` reloads it into these
    // in-memory arrays (and restores MPNowPlayingInfoCenter) at the TOP of the
    // CarPlay scene's didConnect — before any template is built — so the car
    // shows the fan's real library/recents/last track instantly, offline.
    //
    // NEVER put tokens/secrets in the snapshot: it is unencrypted UserDefaults,
    // and it is wiped on sign-out (`clearSnapshot()`) so one fan can't see the
    // previous fan's library in the car.
    private let snapshotKey = "nowPlayingSnapshot.v1"
    // Last now-playing metadata, mirrored from the plugin's setMetadata so a
    // cold connect can restore MPNowPlayingInfoCenter (title/artist/art) instead
    // of the generic app icon. Populated only while the app is warm + playing;
    // read back on the next cold connect.
    private var metaTitle = ""
    private var metaArtist = ""
    private var metaAlbum = ""
    private var metaDuration: Double = 0
    private var metaArtworkUrl: String?
    /// Downscaled JPEG bytes of the last now-playing art, so the car shows real
    /// artwork even with no network in the garage (a remote URL fetch would
    /// fail). Bounded small (see `NowPlayingPlugin`'s downscale before persist).
    private var metaArtworkData: Data?
    /// Set true by `clearSnapshot()` (sign-out) and cleared only by a fresh
    /// NON-empty `updateCatalog(...)` publish. While true, `saveSnapshot()` is a
    /// no-op — so a signed-out fan whose audio keeps auto-advancing can't have a
    /// stray `persistMetadata` (or queue/favorite update) re-mint a snapshot with
    /// their track after the wipe. The next fan's first catalog publish re-arms
    /// persistence.
    private var suppressPersistUntilFreshCatalog = false

    /// Codable mirror of the browsable state + last now-playing metadata. Flat
    /// on purpose — only what the CarPlay lists + Now Playing surface need.
    private struct Snapshot: Codable {
        struct Track: Codable { let id: String; let title: String; let artist: String; let duration: Double }
        struct Album: Codable { let id: String; let title: String; let artist: String; let artworkUrl: String?; let tracks: [Track] }
        struct Recent: Codable { let albumId: String; let trackId: String?; let title: String; let subtitle: String; let artworkUrl: String? }
        struct QueueItem: Codable { let id: String; let title: String; let artist: String; let artworkUrl: String?; let duration: Double }
        struct Playlist: Codable { let id: String; let name: String; let artworkUrl: String? }
        var catalog: [Album] = []
        var recents: [Recent] = []
        var queue: [QueueItem] = []
        var playlists: [Playlist] = []
        var currentIndex: Int = 0
        var isFavorite: Bool = false
        var metaTitle: String = ""
        var metaArtist: String = ""
        var metaAlbum: String = ""
        var metaDuration: Double = 0
        var metaArtworkUrl: String?
        var metaArtworkData: Data?
    }

    /// Set by `NowPlayingPlugin` on load — forwards a CarPlay Up Next row tap
    /// back into JS as a `playIndex` remote command. nil when the plugin isn't
    /// loaded.
    var onPlayIndex: ((Int) -> Void)?
    /// Set by `NowPlayingPlugin` on load — forwards a CarPlay catalog/recents
    /// tap back into JS as a `playAlbum` remote command: album id, an optional
    /// track id (nil = play the album from the top), and whether to shuffle.
    var onPlayAlbum: ((String, String?, Bool) -> Void)?
    /// Set by `NowPlayingPlugin` on load — a CarPlay Now Playing heart tap →
    /// `toggleFavorite` (toggles the current track's favorite state in JS).
    var onToggleFavorite: (() -> Void)?
    /// Set by `NowPlayingPlugin` on load — a CarPlay Now Playing shuffle tap →
    /// `toggleShuffle`.
    var onToggleShuffle: (() -> Void)?
    /// Set by `NowPlayingPlugin` on load — a CarPlay Now Playing repeat tap →
    /// `cycleRepeat` (off → all → one → off, matching the web player).
    var onCycleRepeat: (() -> Void)?
    /// Set by `NowPlayingPlugin` on load — asks JS to re-publish the current
    /// now-playing metadata + playback state + queue + catalog. Fired by the
    /// CarPlay scene on connect.
    var onResync: (() -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the queue changes so the list can refresh. nil
    /// when CarPlay is disconnected (updates are then just stored, no UI work).
    var onQueueChanged: (() -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the catalog changes so the Library list can
    /// refresh (e.g. when the WebView finishes loading after a cold connect).
    var onCatalogChanged: (() -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the recents list changes so the Recents tab can
    /// refresh.
    var onRecentsChanged: (() -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the current track's favorite state changes so
    /// the Now Playing heart button can be rebuilt (outline ↔ filled).
    var onFavoriteChanged: (() -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the playlists list changes so the Collection
    /// Playlists sub-list can refresh.
    var onPlaylistsChanged: (() -> Void)?
    /// Set by `NowPlayingPlugin` on load — forwards a CarPlay playlist tap back
    /// to JS as a `playPlaylist` remote command with the playlist id. JS fetches
    /// the tracks and starts playing. nil when the plugin isn't loaded.
    var onPlayPlaylist: ((String) -> Void)?

    /// Replace the mirrored queue and notify any connected CarPlay scene.
    func updateQueue(_ items: [NowPlayingQueueEntry], currentIndex: Int) {
        // Mutate + notify on main: CarPlaySceneDelegate reads these arrays on the
        // main thread, and Swift arrays are not thread-safe (a CoW replacement
        // during a concurrent read is a rare-but-real crash). The Capacitor
        // plugin calls in on a background thread, so hop to main here.
        DispatchQueue.main.async { [weak self] in
            self?.queue = items
            self?.currentIndex = currentIndex
            self?.onQueueChanged?()
            self?.saveSnapshot()
        }
    }

    /// Replace the mirrored catalog and notify any connected CarPlay scene.
    func updateCatalog(_ albums: [CatalogAlbum]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.catalog = albums
            // A fresh NON-empty catalog publish means a real (re-)authenticated
            // session — re-arm persistence that sign-out suppressed. An empty
            // publish (e.g. the logout catalog effect) must NOT re-arm it.
            if !albums.isEmpty { self.suppressPersistUntilFreshCatalog = false }
            self.onCatalogChanged?()
            self.saveSnapshot()
        }
    }

    /// Replace the mirrored recents and notify any connected CarPlay scene.
    func updateRecents(_ entries: [RecentEntry]) {
        DispatchQueue.main.async { [weak self] in
            self?.recents = entries
            self?.onRecentsChanged?()
            self?.saveSnapshot()
        }
    }

    /// Update whether the current track is a favorite and notify any connected
    /// CarPlay scene so the Now Playing heart button can be rebuilt.
    func updateFavorite(_ isFavorite: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isCurrentFavorite = isFavorite
            self?.onFavoriteChanged?()
            self?.saveSnapshot()
        }
    }

    /// Replace the mirrored playlists list and notify any connected CarPlay scene.
    func updatePlaylists(_ items: [CatalogPlaylist]) {
        DispatchQueue.main.async { [weak self] in
            self?.playlists = items
            self?.onPlaylistsChanged?()
            self?.saveSnapshot()
        }
    }

    /// Ask the web player to load and play `playlistId` (CarPlay playlist tap).
    func requestPlayPlaylist(playlistId: String) {
        onPlayPlaylist?(playlistId)
    }

    /// Ask the web player to jump to `index` in the queue (CarPlay Up Next tap).
    func requestPlayIndex(_ index: Int) {
        onPlayIndex?(index)
    }

    /// Ask the web player to play `albumId`. `trackId` nil = start from the top;
    /// `shuffle` true = shuffle the album (CarPlay album Play/Shuffle rows, a
    /// track tap, or a Recents tap).
    func requestPlayAlbum(albumId: String, trackId: String?, shuffle: Bool) {
        onPlayAlbum?(albumId, trackId, shuffle)
    }

    /// Ask the web player to toggle the current track's favorite (CarPlay Now
    /// Playing heart tap).
    func requestToggleFavorite() {
        onToggleFavorite?()
    }

    /// Ask the web player to toggle shuffle (CarPlay Now Playing shuffle tap).
    func requestToggleShuffle() {
        onToggleShuffle?()
    }

    /// Ask the web player to cycle the repeat mode (CarPlay Now Playing repeat
    /// tap).
    func requestCycleRepeat() {
        onCycleRepeat?()
    }

    /// Ask the web player to re-publish now-playing metadata + queue + catalog
    /// (CarPlay connected — recover from iOS's scene-connect info reset).
    func requestResync() {
        onResync?()
    }

    // MARK: - Cold-connect snapshot persistence

    /// Mirror the last now-playing metadata from the plugin's setMetadata so a
    /// future cold connect can restore MPNowPlayingInfoCenter. Text only — the
    /// art bytes arrive separately via `persistArtworkData` once the async image
    /// fetch resolves. Changing tracks clears the stale art until the new one
    /// loads. Call from the plugin (background thread ok — hops to main).
    func persistMetadata(title: String, artist: String, album: String, duration: Double, artworkUrl: String?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.metaTitle = title
            self.metaArtist = artist
            self.metaAlbum = album
            self.metaDuration = duration
            if artworkUrl != self.metaArtworkUrl {
                self.metaArtworkUrl = artworkUrl
                self.metaArtworkData = nil
            }
            self.saveSnapshot()
        }
    }

    /// Persist downscaled JPEG bytes for the current now-playing art, so a cold
    /// connect renders real artwork offline. Ignored if the track changed while
    /// the image loaded (url no longer matches). Call from the plugin.
    func persistArtworkData(_ data: Data?, forUrl url: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, url == self.metaArtworkUrl else { return }
            self.metaArtworkData = data
            self.saveSnapshot()
        }
    }

    /// Serialize the current browsable state + last now-playing metadata to
    /// UserDefaults. Skips writing an all-empty snapshot so the mount-time
    /// empty-publish race can't wipe a good one (the JS side also guards).
    /// Must run on main (all callers already hop there).
    private func saveSnapshot() {
        // Post sign-out: stay wiped until a fresh non-empty catalog publish, so a
        // signed-out fan's still-playing/auto-advancing audio can't re-mint a
        // snapshot with their track (see suppressPersistUntilFreshCatalog).
        guard !suppressPersistUntilFreshCatalog else { return }
        guard !catalog.isEmpty || !recents.isEmpty || !metaTitle.isEmpty else { return }
        var snap = Snapshot()
        snap.catalog = catalog.map { album in
            Snapshot.Album(
                id: album.id, title: album.title, artist: album.artist,
                artworkUrl: album.artworkUrl,
                tracks: album.tracks.map {
                    Snapshot.Track(id: $0.id, title: $0.title, artist: $0.artist, duration: $0.duration)
                }
            )
        }
        snap.recents = recents.map {
            Snapshot.Recent(albumId: $0.albumId, trackId: $0.trackId, title: $0.title, subtitle: $0.subtitle, artworkUrl: $0.artworkUrl)
        }
        snap.playlists = playlists.map {
            Snapshot.Playlist(id: $0.id, name: $0.name, artworkUrl: $0.artworkUrl)
        }
        snap.queue = queue.map {
            Snapshot.QueueItem(id: $0.id, title: $0.title, artist: $0.artist, artworkUrl: $0.artworkUrl, duration: $0.duration)
        }
        snap.currentIndex = currentIndex
        snap.isFavorite = isCurrentFavorite
        snap.metaTitle = metaTitle
        snap.metaArtist = metaArtist
        snap.metaAlbum = metaAlbum
        snap.metaDuration = metaDuration
        snap.metaArtworkUrl = metaArtworkUrl
        snap.metaArtworkData = metaArtworkData
        if let data = try? JSONEncoder().encode(snap) {
            UserDefaults.standard.set(data, forKey: snapshotKey)
        }
    }

    /// Load the persisted snapshot into the in-memory arrays + last-metadata
    /// cache and restore MPNowPlayingInfoCenter (only when it is currently nil,
    /// so a warm connect is never stomped). Sets arrays only — never pushes a
    /// template or roots Now Playing — so it is safe to call at the very top of
    /// the CarPlay scene's didConnect, before templates are built. Main-thread.
    func hydrateFromDisk() {
        guard let data = UserDefaults.standard.data(forKey: snapshotKey),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }

        catalog = snap.catalog.map { album in
            CatalogAlbum(
                id: album.id, title: album.title, artist: album.artist,
                artworkUrl: album.artworkUrl,
                tracks: album.tracks.map {
                    CatalogTrack(id: $0.id, title: $0.title, artist: $0.artist, duration: $0.duration)
                }
            )
        }
        recents = snap.recents.map {
            RecentEntry(albumId: $0.albumId, trackId: $0.trackId, title: $0.title, subtitle: $0.subtitle, artworkUrl: $0.artworkUrl)
        }
        playlists = snap.playlists.map {
            CatalogPlaylist(id: $0.id, name: $0.name, artworkUrl: $0.artworkUrl)
        }
        queue = snap.queue.map {
            NowPlayingQueueEntry(id: $0.id, title: $0.title, artist: $0.artist, artworkUrl: $0.artworkUrl, duration: $0.duration)
        }
        currentIndex = snap.currentIndex
        isCurrentFavorite = snap.isFavorite
        metaTitle = snap.metaTitle
        metaArtist = snap.metaArtist
        metaAlbum = snap.metaAlbum
        metaDuration = snap.metaDuration
        metaArtworkUrl = snap.metaArtworkUrl
        metaArtworkData = snap.metaArtworkData

        // Restore the Now Playing surface's metadata/art so the car shows the
        // real last track instead of the app icon. Only when the live dict is
        // empty (a warm connect already has real, currently-playing info — don't
        // overwrite it). Paused presentation: rate + elapsed 0. Transport stays
        // inert on a true cold connect (no web player yet) until the deferred
        // background-bring-up work lands — see docs/roadmap.md.
        if MPNowPlayingInfoCenter.default().nowPlayingInfo == nil, !metaTitle.isEmpty {
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: metaTitle,
                MPMediaItemPropertyArtist: metaArtist,
                MPMediaItemPropertyAlbumTitle: metaAlbum,
                MPNowPlayingInfoPropertyPlaybackRate: 0.0,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: 0.0,
            ]
            if metaDuration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = metaDuration
            }
            if let bytes = metaArtworkData, let image = UIImage(data: bytes) {
                info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
    }

    /// Wipe the persisted snapshot + in-memory mirror on sign-out — a privacy
    /// requirement so the next fan can't see the previous fan's library in the
    /// car. Deliberately NOT coupled to the plugin's `clear()` (that fires on
    /// every launch when nothing is playing, which would defeat cold connect).
    func clearSnapshot() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Stay wiped until a fresh non-empty catalog publish (re-login), so a
            // still-playing signed-out session can't re-persist its track.
            self.suppressPersistUntilFreshCatalog = true
            UserDefaults.standard.removeObject(forKey: self.snapshotKey)
            self.catalog = []
            self.recents = []
            self.queue = []
            self.playlists = []
            self.currentIndex = 0
            self.isCurrentFavorite = false
            self.metaTitle = ""
            self.metaArtist = ""
            self.metaAlbum = ""
            self.metaDuration = 0
            self.metaArtworkUrl = nil
            self.metaArtworkData = nil
            // Refresh any connected CarPlay scene so the car clears immediately.
            self.onCatalogChanged?()
            self.onRecentsChanged?()
            self.onQueueChanged?()
            self.onFavoriteChanged?()
            self.onPlaylistsChanged?()
        }
    }
}
