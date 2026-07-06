import UIKit
import Capacitor

/**
 * SceneDelegate — the phone/iPad window under the UIScene lifecycle (Task #2570).
 *
 * WHY THIS EXISTS: adding CarPlay (Task #2504) put a `UIApplicationSceneManifest`
 * into Info.plist. Once ANY scene manifest is present, UIKit adopts the
 * scene-based lifecycle for the WHOLE app — it stops using the legacy
 * AppDelegate/`UIMainStoryboardFile` window path. The original manifest declared
 * ONLY the CarPlay role (on the theory that omitting the window role would leave
 * the phone on the legacy lifecycle), so the phone session had no window scene
 * configuration at all and the App Store build launched to a pure BLACK screen:
 * iOS created a window scene session, found nothing to attach, and never built
 * a window. (The Codemagic pipeline strips the CarPlay *entitlement* from
 * distribution archives, but Info.plist — and therefore the manifest — ships
 * as committed, which is why the approved binary hit this.)
 *
 * The fix is Apple's supported pattern for a CarPlay-audio app: declare BOTH
 * roles in the manifest —
 *   - `UIWindowSceneSessionRoleApplication` → this class + `Main` storyboard
 *     (whose initial VC is Capacitor's `CAPBridgeViewController`), so the phone
 *     window hosts the exact same bridge the AppDelegate lifecycle did;
 *   - `CPTemplateApplicationSceneSessionRoleApplication` → CarPlaySceneDelegate
 *     for the in-car surface (unchanged).
 * `UIApplicationSupportsMultipleScenes` stays true so the phone scene and the
 * CarPlay scene can run simultaneously (required for CarPlay audio).
 *
 * Under the scene lifecycle, deep links (custom-scheme URLs + universal links)
 * arrive HERE, not on AppDelegate — both the cold-launch connectionOptions and
 * the warm-app callbacks below forward into Capacitor's
 * ApplicationDelegateProxy so App Links / OAuth round-trips keep working.
 * APNs registration callbacks stay on AppDelegate (they are app-level, not
 * scene-level, under both lifecycles).
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Info.plist points this configuration at Main.storyboard via
        // UISceneStoryboardFile, so UIKit normally instantiates the window +
        // CAPBridgeViewController and assigns `self.window` before this runs.
        // Defensive fallback: if that hookup ever breaks, build the window by
        // hand so a launch can never end on an empty (black) scene again.
        if window == nil {
            let w = UIWindow(windowScene: windowScene)
            w.rootViewController = UIStoryboard(name: "Main", bundle: nil).instantiateInitialViewController()
            window = w
            w.makeKeyAndVisible()
        }

        // Mirror the scene window onto AppDelegate.window: AppDelegate's own
        // navy painting keeps working, and anything that reads the app-delegate
        // window (Capacitor internals, plugins) finds the real one.
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            appDelegate.window = window
        }

        paintNavy()

        // Cold launch FROM a deep link: under the scene lifecycle the URL /
        // user activity rides in on the connection options instead of the
        // AppDelegate launch callbacks.
        for context in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
        for activity in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
        }
    }

    // Re-apply navy every time the scene foregrounds — covers the race where
    // the CAPBridgeViewController's WKWebView wasn't attached yet at connect
    // time (same reason AppDelegate.applicationDidBecomeActive did this under
    // the legacy lifecycle; that callback doesn't fire under scenes).
    func sceneDidBecomeActive(_ scene: UIScene) {
        paintNavy()
    }

    // Warm-app custom-scheme URL open (OAuth return, etc.).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    // Warm-app universal link (applinks:my.goodtunes.music).
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    private func paintNavy() {
        window?.backgroundColor = brandNavy
        if let root = window?.rootViewController {
            root.view.backgroundColor = brandNavy
            applyNavyToWebView(in: root)
        }
    }
}
