import CarPlay
import UIKit

/**
 * CarPlaySceneDelegate — the in-car UI for GoodTunes.
 *
 * GoodTunes is a Capacitor thin-wrap: audio plays in the WKWebView. The app
 * runs the UIScene lifecycle — Info.plist declares BOTH scene roles:
 * `UIWindowSceneSessionRoleApplication` → SceneDelegate.swift (the phone
 * window hosting the Capacitor bridge) and
 * `CPTemplateApplicationSceneSessionRoleApplication` → this delegate for the
 * in-car surface. (The original CarPlay change declared ONLY the CarPlay role
 * on the theory that omitting the window role would leave the phone on the
 * legacy AppDelegate lifecycle — WRONG: any scene manifest flips the whole
 * app to scenes, and the missing window role black-screened the phone at
 * launch. See Task #2570 / SceneDelegate.swift.)
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
 *
 * The whole delegate is gated to iOS 14.0+: every CarPlay template API it uses
 * (CPNowPlayingTemplate, CPTabBarTemplate, CPListItem.isPlaying/handler/setImage,
 * tabTitle, and the completion-handler setRootTemplate) is iOS 14.0-only. The
 * app's deployment target stays at iOS 13.0; UIKit instantiates this class only
 * by name from Info.plist's CarPlay scene role, so the attribute never cascades
 * availability onto the iOS 13-capable phone app.
 */
@available(iOS 14.0, *)
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
        upNext.tabImage = UIImage(systemName: "list.bullet")
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
