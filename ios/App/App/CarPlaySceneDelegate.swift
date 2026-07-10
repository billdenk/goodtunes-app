import UIKit
import CarPlay

/**
 * CarPlaySceneDelegate — GoodTunes' in-car experience under the
 * `com.apple.developer.carplay-audio` entitlement.
 *
 * Playback + browse only, system-drawn chrome:
 *
 *   root CPListTemplate ("Up Next") — fed by NowPlayingStore.shared.queue;
 *     tapping a row calls NowPlayingStore.shared.requestPlayIndex(index),
 *     which the plugin forwards to JS as the same `playIndex` remote command
 *     the lock screen's transport buttons already use.
 *
 *   Now Playing — CPNowPlayingTemplate.shared, the system template that reads
 *     MPNowPlayingInfoCenter / MPRemoteCommandCenter directly (NowPlayingPlugin
 *     already populates those for the lock screen, so metadata + transport need
 *     nothing extra). CarPlay presents it automatically for a carplay-audio app
 *     — it must NOT be embedded in the tab bar or any other container (see the
 *     note in templateApplicationScene(_:didConnect:): doing so throws in
 *     -[CPTabBarTemplate validateTemplates:] and SIGABRTs the instant a head
 *     unit connects — the "opens then crashes" bug from the first build).
 *
 * No lyrics/commerce/GoodDeed/SuperCredits surfaces — CarPlay is playback +
 * browse only.
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

        // Configure the shared system Now Playing template. CRITICAL: never put
        // CPNowPlayingTemplate in a CPTabBarTemplate (or any container).
        // CPTabBarTemplate.validateTemplates: only accepts list / grid /
        // information / point-of-interest / contact templates and throws an
        // uncaught NSException for anything else — embedding the now playing
        // template there SIGABRTs the app the instant a head unit connects
        // (confirmed crash: -[CPTabBarTemplate validateTemplates:] → abort()).
        // CarPlay presents Now Playing on its own for a carplay-audio app: it
        // shows a Now Playing bar/button automatically once MPNowPlayingInfoCenter
        // is populated (NowPlayingPlugin already does that) and pushes
        // CPNowPlayingTemplate.shared when tapped, so nothing is added here.
        // We only keep the system's own Up Next / album-artist buttons off it to
        // avoid a duplicate entry point to the same list the root already shows.
        CPNowPlayingTemplate.shared.isUpNextButtonEnabled = false
        CPNowPlayingTemplate.shared.isAlbumArtistButtonEnabled = false

        rebuildQueueTemplate()
        NowPlayingStore.shared.onQueueChanged = { [weak self] in
            self?.rebuildQueueTemplate()
        }

        // Root is the browsable "Up Next" list; the system Now Playing surface
        // rides on top of it, matching how Apple Music / Spotify open in CarPlay
        // (library first, now-playing bar along the bottom).
        interfaceController.setRootTemplate(queueListTemplate, animated: false, completion: nil)
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
