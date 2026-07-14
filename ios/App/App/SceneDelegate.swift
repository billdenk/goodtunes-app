import UIKit
import Capacitor

/// Phone/iPad window-scene delegate.
///
/// This class only exists because re-adding CarPlay (`CarPlaySceneDelegate.swift`)
/// requires SOME `UIApplicationSceneManifest` in Info.plist, and the moment any
/// scene manifest exists, UIKit runs the WHOLE app on the UIScene lifecycle —
/// including the ordinary phone window, which used to be owned directly by
/// `AppDelegate`. This delegate reproduces that legacy behaviour line-for-line
/// so the phone experience doesn't regress.
///
/// TWO prior real-device attempts at this exact pattern black-screened the
/// store-signed binary (see `.agents/memory/ios-scene-manifest-black-screen.md`).
/// Every step below is deliberate:
///   - the window is built and made key synchronously in `willConnectTo`
///     (never deferred to a later callback),
///   - `AppDelegate.window` is mirrored to the same instance, because some
///     Capacitor/Cordova-style code reads `UIApplication.shared.delegate?.window`
///     directly rather than via `UIWindowScene.windows` (this mirroring was
///     NOT present in the second, still-failing attempt),
///   - the brand-navy repaint that used to run in
///     `AppDelegate.didFinishLaunchingWithOptions` / `applicationDidBecomeActive`
///     is duplicated here so the white-flash-during-remote-load fix keeps working
///     under the scene lifecycle,
///   - deep links / universal links, which used to arrive on AppDelegate's
///     `application(_:open:)` / `application(_:continue:)`, are forwarded from
///     the scene-level equivalents to the SAME `ApplicationDelegateProxy` so
///     Capacitor's URL/App plugins keep working unchanged.
///
/// This file is only compiled into the target's Sources build phase and only
/// ever instantiated by UIKit when Info.plist's `UIApplicationSceneManifest`
/// is present. The Codemagic "Gate CarPlay out of the distribution archive"
/// step strips that whole key (and the carplay-audio entitlement) unless
/// `CARPLAY_GRANTED=true`, which reverts a build to the proven-good
/// `AppDelegate.window` lifecycle with zero code changes — this class simply
/// never gets used in that case.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        // ADOPT the headless-booted web player when one exists (cold CarPlay
        // connect booted it off-window — see HeadlessWebPlayer in
        // MainViewController.swift). Instantiating a fresh storyboard VC here
        // would create a SECOND WKWebView with its own <audio> element →
        // double audio + a from-scratch reload killing in-car playback. On the
        // normal launch path adoptForWindow() returns nil and this line is
        // byte-for-byte the legacy behaviour.
        if let headless = HeadlessWebPlayer.shared.adoptForWindow() {
            window.rootViewController = headless
        } else {
            let storyboard = UIStoryboard(name: "Main", bundle: nil)
            window.rootViewController = storyboard.instantiateInitialViewController()
        }

        // Same white-flash fix AppDelegate used to apply directly — see the
        // comment on `applyNavyToWebView` in AppDelegate.swift.
        window.backgroundColor = brandNavy
        if let root = window.rootViewController {
            root.view.backgroundColor = brandNavy
            applyNavyToWebView(in: root)
        }

        self.window = window
        // Mirror onto AppDelegate.window: some pods still read
        // `UIApplication.shared.delegate?.window` directly. Keeping both in
        // sync is the documented compatibility step Apple recommends for apps
        // migrating an AppDelegate-owned window onto scene-owned windows.
        (UIApplication.shared.delegate as? AppDelegate)?.window = window
        window.makeKeyAndVisible()

        // Cold-launch deep links (custom scheme + universal links) land here
        // instead of AppDelegate's application(_:open:)/application(_:continue:)
        // once the app is on the UIScene lifecycle.
        for context in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    // Covers the race where the CAPBridgeViewController's view wasn't yet
    // attached when `willConnectTo` ran — mirrors what
    // `AppDelegate.applicationDidBecomeActive` used to do (that method never
    // fires for a scene-based app).
    func sceneDidBecomeActive(_ scene: UIScene) {
        if let root = window?.rootViewController {
            applyNavyToWebView(in: root)
        }
    }
}
