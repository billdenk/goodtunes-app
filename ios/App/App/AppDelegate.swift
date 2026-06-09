import UIKit
import Capacitor

// Brand navy — matches capacitor.config.ts SplashScreen.backgroundColor and
// the LaunchScreen.storyboard background so there is no colour discontinuity
// at any point during launch or app load.
private let brandNavy = UIColor(red: 0.0, green: 6.0/255.0, blue: 43.0/255.0, alpha: 1.0)

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Paint brand navy on every layer that could show through before the
        // remote-origin page fully renders.  Without this the transition is:
        //   OS LaunchScreen (navy, fixed above)
        //   → Capacitor SplashScreen overlay (navy, already configured)
        //   → WKWebView white flash while my.goodtunes.music loads (~4 s)
        //   → app
        // Setting backgroundColor here closes that last white gap.
        window?.backgroundColor = brandNavy
        if let root = window?.rootViewController {
            root.view.backgroundColor = brandNavy
            applyNavyToWebView(in: root)
        }
        return true
    }

    // Called every time the app comes back to the foreground — covers the
    // race where the CAPBridgeViewController's view wasn't yet attached
    // when didFinishLaunchingWithOptions ran.
    func applicationDidBecomeActive(_ application: UIApplication) {
        if let root = window?.rootViewController {
            applyNavyToWebView(in: root)
        }
    }

    // Walk the view-controller tree to find the Capacitor bridge VC and
    // set its WKWebView background to brand navy so no white ever shows
    // through during a remote-URL load.
    private func applyNavyToWebView(in vc: UIViewController) {
        if let bridgeVC = vc as? CAPBridgeViewController {
            bridgeVC.view.backgroundColor = brandNavy
            if let wv = bridgeVC.webView {
                wv.backgroundColor         = brandNavy
                wv.scrollView.backgroundColor = brandNavy
                // isOpaque=false lets the WKWebView honour its backgroundColor
                // instead of forcing an opaque white surface.
                wv.isOpaque = false
            }
        }
        for child in vc.children {
            applyNavyToWebView(in: child)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    // Push notifications — forward the APNs registration callbacks to the
    // Capacitor PushNotifications plugin. The plugin listens on these
    // NotificationCenter names and turns the raw device token into the
    // `registration` event the JS layer (client/src/lib/pushNotifications.ts)
    // subscribes to. Without these two methods the JS `register()` call
    // never resolves a token.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
