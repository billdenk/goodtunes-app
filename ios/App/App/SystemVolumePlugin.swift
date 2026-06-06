import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import UIKit

/**
 * SystemVolume — native bridge that lets the GoodTunes web player read, set,
 * and observe the iPhone's hardware output volume.
 *
 * Mobile Safari makes an HTMLMediaElement's `.volume` read-only, so on web iOS
 * the in-app volume slider is hidden (see `client/src/lib/platform.ts`
 * `isWebIOS`). Inside the native Capacitor shell we *can* reach the system
 * volume, so the slider is shown again and wired through here:
 *
 *   - `getVolume()`  → AVAudioSession.outputVolume (0–1)
 *   - `setVolume()`  → drives the hidden MPVolumeView's UISlider, the only
 *                      supported way to set system volume from an app.
 *   - `volumeChange` → KVO on AVAudioSession.outputVolume, so pressing the
 *                      hardware buttons moves the on-screen slider live.
 *
 * The matching JS wrapper is `client/src/lib/nativeVolume.ts`.
 */
@objc(SystemVolumePlugin)
public class SystemVolumePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SystemVolumePlugin"
    public let jsName = "SystemVolume"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    /// Off-screen MPVolumeView whose embedded UISlider is the only Apple-blessed
    /// handle for *setting* the system volume from app code.
    private var volumeView: MPVolumeView?
    private var observation: NSKeyValueObservation?

    public override func load() {
        DispatchQueue.main.async {
            // Park an MPVolumeView off-screen; it's never shown but its slider
            // is what we nudge to change system volume.
            let view = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 0, height: 0))
            view.isHidden = false
            view.alpha = 0.0001
            self.bridge?.viewController?.view.addSubview(view)
            self.volumeView = view
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(true)
            // Emit volumeChange whenever the hardware buttons (or anything
            // else) move the output volume.
            observation = session.observe(\.outputVolume, options: [.new]) { [weak self] session, _ in
                self?.notifyListeners("volumeChange", data: ["value": session.outputVolume])
            }
        } catch {
            // Leave observation nil; getVolume/setVolume still work best-effort.
        }
    }

    @objc func getVolume(_ call: CAPPluginCall) {
        let value = AVAudioSession.sharedInstance().outputVolume
        call.resolve(["value": value])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let value = Float(call.getDouble("value") ?? 0)
        let clamped = max(0, min(1, value))
        DispatchQueue.main.async {
            if let slider = self.volumeView?.subviews.compactMap({ $0 as? UISlider }).first {
                slider.value = clamped
                // setValue(_:) alone doesn't fire the system change; sending the
                // valueChanged action commits it to the hardware volume.
                slider.sendActions(for: .valueChanged)
            }
            call.resolve()
        }
    }

    deinit {
        observation?.invalidate()
    }
}
