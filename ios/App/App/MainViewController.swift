import Foundation
import Capacitor

/// Custom Capacitor bridge view controller — the storyboard's initial VC.
///
/// WHY THIS EXISTS: Capacitor 6 does NOT auto-discover plugins via an
/// Objective-C runtime scan. Its bridge (`CapacitorBridge.registerPlugins()`)
/// registers exactly two sources: (1) four hardcoded built-ins (Http, Console,
/// WebView, Cookies) and (2) the plugin classes listed in `packageClassList`
/// inside the bundled `capacitor.config.json`, which `npx cap sync ios`
/// generates from installed *npm* Capacitor packages only.
///
/// Our three plugins — `SystemVolume`, `SecureKeyStore`, `NowPlaying` — are
/// in-tree Swift files compiled into the App target, NOT npm packages, so they
/// never land in `packageClassList` and were therefore NEVER registered on any
/// build. They silently no-op'd at the bridge: `Capacitor.isPluginAvailable()`
/// returned false and every call fell through. Two of them had JS fallbacks
/// (IndexedDB key store; volume hidden on web iOS) that hid the gap; NowPlaying
/// has no fallback, which is how the missing registration finally surfaced (the
/// lock screen / CarPlay showed the app name with dead metadata).
/// See `.agents/memory/native-ios-capacitor-plugin.md`.
///
/// THE FIX is the official Capacitor custom-code pattern: subclass the bridge
/// view controller and register each in-tree plugin explicitly in
/// `capacitorDidLoad()`. The bridge invokes that override inside `loadView()`,
/// BEFORE `viewDidLoad()` loads the remote web page — so each plugin's JS proxy
/// (injected as a WKUserScript by `registerPluginInstance`) exists by the time
/// the page can call it. Registering later (e.g. from SceneDelegate) would be
/// too late: the user script would miss the already-loaded document.
///
/// This runs identically on both launch paths — the UIScene lifecycle (CarPlay
/// build) and the scene-manifest-stripped legacy path both instantiate this
/// same storyboard initial view controller — so it is orthogonal to the prior
/// scene-manifest black-screen incidents.
///
/// Use `registerPluginInstance` (NOT `registerPluginType`, which is a no-op
/// while `autoRegisterPlugins` is on — the default).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SystemVolumePlugin())
        bridge?.registerPluginInstance(SecureKeyStorePlugin())
        bridge?.registerPluginInstance(NowPlayingPlugin())
    }
}
