import Foundation
import UIKit

/// A single browsable queue entry mirrored from the web player (PlayerContext's
/// Up Next). Kept deliberately flat — only what a CarPlay list row needs.
struct NowPlayingQueueEntry {
    let id: String
    let title: String
    let artist: String
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
 *   - the plugin pushes the latest queue in via `updateQueue(...)` (from the
 *     JS `setQueue` call) and registers `onPlayIndex` so a tapped CarPlay row
 *     can be forwarded back to JS as a `playIndex` remote command,
 *   - the CarPlay scene reads `queue` / `currentIndex` to build its list and
 *     registers `onQueueChanged` so a live queue update refreshes the list.
 *
 * Now-playing metadata + transport are NOT routed through here: CarPlay's
 * `CPNowPlayingTemplate` reads `MPNowPlayingInfoCenter` /
 * `MPRemoteCommandCenter` directly, which the plugin already populates for the
 * lock screen, so the now-playing tab works with zero extra wiring. Only the
 * browsable queue needs this side channel.
 */
final class NowPlayingStore {
    static let shared = NowPlayingStore()
    private init() {}

    private(set) var queue: [NowPlayingQueueEntry] = []
    private(set) var currentIndex: Int = 0

    /// Set by `NowPlayingPlugin` on load — forwards a CarPlay row tap back into
    /// JS as a `playIndex` remote command. nil when the plugin isn't loaded.
    var onPlayIndex: ((Int) -> Void)?
    /// Set by `CarPlaySceneDelegate` while a head unit is connected — invoked on
    /// the main thread whenever the queue changes so the list can refresh. nil
    /// when CarPlay is disconnected (updates are then just stored, no UI work).
    var onQueueChanged: (() -> Void)?

    /// Replace the mirrored queue and notify any connected CarPlay scene.
    func updateQueue(_ items: [NowPlayingQueueEntry], currentIndex: Int) {
        self.queue = items
        self.currentIndex = currentIndex
        DispatchQueue.main.async { [weak self] in
            self?.onQueueChanged?()
        }
    }

    /// Ask the web player to jump to `index` in the queue (CarPlay row tap).
    func requestPlayIndex(_ index: Int) {
        onPlayIndex?(index)
    }
}
