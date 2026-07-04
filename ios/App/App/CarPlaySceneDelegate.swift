import CarPlay
import UIKit

/**
 * CarPlaySceneDelegate — the in-car UI for GoodTunes.
 *
 * GoodTunes is a Capacitor thin-wrap: audio plays in the WKWebView and the
 * phone UI keeps the legacy AppDelegate window lifecycle. To add CarPlay
 * without migrating the whole app to UIScene, Info.plist declares ONLY the
 * CarPlay scene role (`CPTemplateApplicationSceneSessionRoleApplication`) and
 * points it at this delegate via `UISceneDelegateClassName`. Because no
 * `UIWindowSceneSessionRoleApplication` is declared, the phone app is untouched
 * and only the car surface runs through here (Apple's documented hybrid path).
 *
 * Two templates in a tab bar:
 *   - Now Playing: `CPNowPlayingTemplate.shared`, which reads
 *     `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter` directly. The web
 *     player already populates both via `NowPlayingPlugin`, so metadata,
 *     artwork, scrubber, and play/pause/next/prev all work with no extra code.
 *   - Up Next: a `CPListTemplate` built from the queue mirrored through
 *     `NowPlayingStore`; tapping a row forwards a `playIndex` command back to
 *     the web player.
 *
 * Requires the `com.apple.developer.carplay-audio` entitlement (App.entitlements)
 * which Apple must grant to the App ID before a real head unit will connect.
 */
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    private var interfaceController: CPInterfaceController?
    private var upNextTemplate: CPListTemplate?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController

        let nowPlaying = CPNowPlayingTemplate.shared

        let upNext = CPListTemplate(title: "Up Next", sections: [buildSection()])
        upNext.tabTitle = "Up Next"
        if #available(iOS 14.0, *) {
            upNext.tabImage = UIImage(systemName: "list.bullet")
        }
        self.upNextTemplate = upNext

        let tabBar = CPTabBarTemplate(templates: [nowPlaying, upNext])
        interfaceController.setRootTemplate(tabBar, animated: true, completion: nil)

        // Refresh the Up Next list whenever the web player republishes its queue.
        NowPlayingStore.shared.onQueueChanged = { [weak self] in
            self?.refreshUpNext()
        }
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        NowPlayingStore.shared.onQueueChanged = nil
        self.interfaceController = nil
        self.upNextTemplate = nil
    }

    // MARK: - Up Next list

    private func refreshUpNext() {
        upNextTemplate?.updateSections([buildSection()])
    }

    private func buildSection() -> CPListSection {
        let store = NowPlayingStore.shared
        let items: [CPListItem] = store.queue.enumerated().map { index, entry in
            let item = CPListItem(text: entry.title, detailText: entry.artist)
            item.isPlaying = (index == store.currentIndex)
            item.handler = { _, completion in
                NowPlayingStore.shared.requestPlayIndex(index)
                completion()
            }
            // Best-effort async thumbnail; the row shows text immediately and
            // gains its artwork when the image arrives (ignored if it fails).
            if let art = entry.artworkUrl, !art.isEmpty, let url = URL(string: art) {
                loadImage(url) { [weak item] image in
                    item?.setImage(image)
                }
            }
            return item
        }
        return CPListSection(items: items)
    }

    private func loadImage(_ url: URL, completion: @escaping (UIImage) -> Void) {
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async { completion(image) }
        }.resume()
    }
}
