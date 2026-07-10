import UIKit
import CarPlay

/**
 * CarPlaySceneDelegate — GoodTunes' in-car experience under the
 * `com.apple.developer.carplay-audio` entitlement.
 *
 * Playback-only, system-drawn chrome, well under Apple's per-connection
 * template ceiling for audio apps:
 *
 *   root CPTabBarTemplate
 *     ├── "Now Playing" tab — CPNowPlayingTemplate.shared (system template;
 *     │     reads MPNowPlayingInfoCenter / MPRemoteCommandCenter directly,
 *     │     which NowPlayingPlugin already populates for the lock screen —
 *     │     nothing extra to wire for metadata/transport)
 *     └── "Up Next" tab — a single CPListTemplate fed by
 *           NowPlayingStore.shared.queue; tapping a row calls
 *           NowPlayingStore.shared.requestPlayIndex(index), which the plugin
 *           forwards to JS as the same `playIndex` remote command the lock
 *           screen's transport buttons already use.
 *
 * No pushes, no additional templates, no lyrics/commerce/GoodDeed/
 * SuperCredits surfaces — CarPlay is playback + browse only.
 *
 * See NowPlayingStore.swift for why a shared singleton (rather than a direct
 * reference) is the bridge between this scene and NowPlayingPlugin: UIKit
 * instantiates this class when a head unit connects, with no reference to the
 * Capacitor plugin instance.
 */
@available(iOS 14.0, *)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    private var interfaceController: CPInterfaceController?
    private let queueListTemplate = CPListTemplate(title: "Up Next", sections: [])

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController

        let nowPlaying = CPNowPlayingTemplate.shared
        // We already have a dedicated "Up Next" tab, so keep the system's own
        // Up Next / album-artist buttons off the Now Playing template to
        // avoid a duplicate, slightly different entry point to the same list.
        nowPlaying.isUpNextButtonEnabled = false
        nowPlaying.isAlbumArtistButtonEnabled = false

        rebuildQueueTemplate()
        NowPlayingStore.shared.onQueueChanged = { [weak self] in
            self?.rebuildQueueTemplate()
        }

        let tabBar = CPTabBarTemplate(templates: [nowPlaying, queueListTemplate])
        interfaceController.setRootTemplate(tabBar, animated: false, completion: nil)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        NowPlayingStore.shared.onQueueChanged = nil
        self.interfaceController = nil
    }

    /// Rebuild the Up Next list's rows from the shared store's current queue.
    /// Plain title + "artist · duration" detail text only — system row
    /// highlighting is the only "now playing" signal (no hand-drawn playing
    /// indicator), matching the system-drawn-chrome requirement.
    private func rebuildQueueTemplate() {
        let queue = NowPlayingStore.shared.queue
        let items: [CPListItem] = queue.enumerated().map { index, entry in
            let duration = formattedDuration(entry.duration)
            let detail: String
            if entry.artist.isEmpty {
                detail = duration
            } else if duration.isEmpty {
                detail = entry.artist
            } else {
                detail = "\(entry.artist) · \(duration)"
            }
            let item = CPListItem(text: entry.title, detailText: detail)
            item.handler = { _, completion in
                NowPlayingStore.shared.requestPlayIndex(index)
                completion()
            }
            return item
        }
        let section = CPListSection(items: items)
        DispatchQueue.main.async { [weak self] in
            self?.queueListTemplate.updateSections([section])
        }
    }

    private func formattedDuration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "" }
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
