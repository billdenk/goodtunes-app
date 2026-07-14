import Foundation
import UIKit
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
    /// The one live bridge VC this process has (weak — never keeps it alive).
    /// `HeadlessWebPlayer.bringUpIfNeeded()` checks this so it never boots a
    /// SECOND web player when the phone UI is (or was) already up: two live
    /// WKWebViews would both hold `<audio>` elements and double-play. Weak on
    /// purpose — a bool flag would go stale after a dealloc and permanently
    /// block future headless boots.
    static weak var live: MainViewController?

    override open func capacitorDidLoad() {
        MainViewController.live = self
        bridge?.registerPluginInstance(SystemVolumePlugin())
        bridge?.registerPluginInstance(SecureKeyStorePlugin())
        bridge?.registerPluginInstance(NowPlayingPlugin())
    }
}

/**
 * HeadlessWebPlayer — boots the web player with NO phone window, so a COLD
 * CarPlay connect (car turned on, phone app never opened this session) can
 * actually play audio when the driver taps a song.
 *
 * THE PROBLEM: a cold head-unit connect spins up ONLY the CarPlay template
 * scene. The phone UIWindowScene — which hosts MainViewController, the
 * WKWebView, and therefore the entire player — is never created, so JS never
 * runs. Browse works (NowPlayingStore hydrates a snapshot from UserDefaults)
 * but every tap-to-play is silently lost: there is nothing alive to play it.
 *
 * THE FIX: when the CarPlay scene connects and no bridge VC is live, this
 * singleton instantiates the SAME Main-storyboard initial VC the phone window
 * would have used and forces its view to load. That runs `capacitorDidLoad`
 * (plugins register) and kicks off the remote-origin page load — all
 * OFF-WINDOW. JS runs fine in an off-window WKWebView, playback is driven by
 * the media engine (not throttleable JS timers), the audio session is
 * `.playback` with UIBackgroundModes=audio, and Capacitor's WebView config
 * sets `mediaTypesRequiringUserActionForPlayback = []` so `audio.play()`
 * needs no gesture. A connected CarPlay scene also gives the process
 * foreground runtime, so nothing here fights background suspension.
 *
 * NO SCENE-MANIFEST CHANGE — this is plain app code. It is deliberately NOT
 * a hidden UIWindow: minting a `UIWindow(frame:)` without a windowScene under
 * the scene lifecycle is exactly the class of hack behind the two historical
 * black-screen incidents (.agents/memory/ios-scene-manifest-black-screen.md).
 * The VC simply lives off-window until the phone UI wants it.
 *
 * ADOPTION: if the user later opens the phone app, `SceneDelegate` ADOPTS this
 * VC as the window's root instead of instantiating a fresh one (two web
 * players = double audio). This singleton keeps its strong reference forever
 * — it is the VC's owner of last resort, so a phone-scene teardown can never
 * kill in-car audio mid-song.
 *
 * KILL SWITCH: `NowPlaying.setHeadlessBringUp({ enabled:false })` from JS
 * persists a UserDefaults flag that disables the bring-up on the NEXT cold
 * connect — so a web publish can turn this feature off in the field without
 * a native rebuild (same escape-hatch pattern as the build-98 diagnostics).
 */
final class HeadlessWebPlayer {
    static let shared = HeadlessWebPlayer()
    private init() {}

    /// UserDefaults key for the JS-settable kill switch. Stored INVERTED
    /// (disabled=true) so the feature defaults ON for binaries whose web
    /// bundle predates the `setHeadlessBringUp` call.
    static let killSwitchKey = "carplayHeadlessBringUp.disabled"

    /// Strong, permanent owner of the headless-booted VC (see doc above).
    private(set) var viewController: MainViewController?

    /// True while the web player was booted headless AND the phone window has
    /// not adopted it yet. `NowPlayingPlugin.load()` reads this to DEFER
    /// `AVAudioSession.setActive(true)` until a real play intent — otherwise
    /// merely starting the car would kill whatever the fan was listening to
    /// (Spotify, radio) before they tapped anything.
    private(set) var isHeadlessBoot = false

    /// Boot the web player off-window if nothing else has. Main-thread only
    /// (CarPlay didConnect already is). Safe to call repeatedly.
    func bringUpIfNeeded() {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.bringUpIfNeeded() }
            return
        }
        // Kill switch (web-publishable escape hatch).
        guard !UserDefaults.standard.bool(forKey: HeadlessWebPlayer.killSwitchKey) else { return }
        // A bridge VC is already live (phone UI up, or a previous headless
        // boot) — never create a second web player.
        guard MainViewController.live == nil, viewController == nil else { return }
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        guard let vc = storyboard.instantiateInitialViewController() as? MainViewController else { return }
        isHeadlessBoot = true
        viewController = vc
        // Forces loadView → capacitorDidLoad (plugin registration) → remote
        // page load, exactly as if the phone window had hosted it.
        vc.loadViewIfNeeded()
    }

    /// Called by `SceneDelegate` when the phone window takes the headless VC
    /// as its root. Returns the VC to adopt, or nil when there is none (the
    /// normal launch path — SceneDelegate then instantiates its own).
    func adoptForWindow() -> MainViewController? {
        guard let vc = viewController else { return nil }
        isHeadlessBoot = false
        return vc
    }
}
