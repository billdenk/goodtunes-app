import Foundation
import UIKit

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
    /// Whether the *current* now-playing track is one of the fan's favorites.
    /// Drives the CarPlay Now Playing heart button's filled/outline state.
    private(set) var isCurrentFavorite: Bool = false

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
        }
    }

    /// Replace the mirrored catalog and notify any connected CarPlay scene.
    func updateCatalog(_ albums: [CatalogAlbum]) {
        DispatchQueue.main.async { [weak self] in
            self?.catalog = albums
            self?.onCatalogChanged?()
        }
    }

    /// Replace the mirrored recents and notify any connected CarPlay scene.
    func updateRecents(_ entries: [RecentEntry]) {
        DispatchQueue.main.async { [weak self] in
            self?.recents = entries
            self?.onRecentsChanged?()
        }
    }

    /// Update whether the current track is a favorite and notify any connected
    /// CarPlay scene so the Now Playing heart button can be rebuilt.
    func updateFavorite(_ isFavorite: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isCurrentFavorite = isFavorite
            self?.onFavoriteChanged?()
        }
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
}
