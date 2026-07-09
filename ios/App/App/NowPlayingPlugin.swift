import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import UIKit

/**
 * NowPlaying — iOS lock-screen / Control Center bridge for the web player.
 *
 * The GoodTunes native app is a thin Capacitor wrap: audio is played by the
 * WKWebView's hidden <audio> element (PlayerContext.tsx), not by native code.
 * On its own the WebView tells the OS nothing about *what* is playing, so the
 * lock screen would show only "GoodTunes" with dead transport buttons and
 * audio would stop when the screen locks. This plugin closes that gap:
 *
 *   - configures the shared AVAudioSession with the `.playback` category so
 *     the WebView's audio keeps going with the app backgrounded / screen
 *     locked (paired with UIBackgroundModes=audio in Info.plist),
 *   - populates MPNowPlayingInfoCenter with title/artist/album/artwork and a
 *     live elapsed-time + duration so the lock-screen scrubber tracks real
 *     playback, and
 *   - wires MPRemoteCommandCenter play/pause/next/prev/seek and forwards each
 *     event to JS (`remoteCommand`), which drives the in-app player
 *     bidirectionally.
 *
 * The matching JS wrapper is client/src/lib/nativeNowPlaying.ts. Android has no
 * counterpart on purpose — the Chromium System WebView surfaces the web
 * MediaSession as a media notification for free.
 *
 * Mirrors the in-tree plugin pattern established by SystemVolumePlugin.swift;
 * registered in the Xcode target by hand (project.pbxproj).
 */
@objc(NowPlayingPlugin)
public class NowPlayingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NowPlayingPlugin"
    public let jsName = "NowPlaying"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    private var commandsWired = false
    /// The URL of the artwork currently being (or already) loaded, so a slow
    /// image fetch that resolves after the user has skipped tracks is ignored.
    private var artworkURL: String?

    public override func load() {
        configureAudioSession()
        wireRemoteCommands()
        // Register with the shared store so a CarPlay row tap (which reaches
        // NowPlayingStore, not this plugin) is forwarded to JS as a `playIndex`
        // remote command, exactly like the transport commands above.
        NowPlayingStore.shared.onPlayIndex = { [weak self] index in
            self?.emitPlayIndex(index)
        }
    }

    /// Put the shared audio session in `.playback` so the WebView's <audio>
    /// keeps playing when backgrounded / locked. WKWebView can reset the
    /// category, so this is re-applied on metadata + play-state updates too.
    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            // Best-effort — a failure here just means the OS keeps the default
            // (ambient) category; playback still works while foregrounded.
        }
    }

    // MARK: - Now-playing info

    @objc func setMetadata(_ call: CAPPluginCall) {
        configureAudioSession()
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""
        let duration = call.getDouble("duration") ?? 0
        let artwork = call.getString("artworkUrl")

        DispatchQueue.main.async {
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
            info[MPMediaItemPropertyTitle] = title
            info[MPMediaItemPropertyArtist] = artist
            info[MPMediaItemPropertyAlbumTitle] = album
            if duration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = duration
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info

            // Load artwork asynchronously; only apply it if the track hasn't
            // changed by the time the image arrives.
            if let artwork = artwork, !artwork.isEmpty {
                if artwork != self.artworkURL {
                    self.artworkURL = artwork
                    self.loadArtwork(artwork)
                }
            } else {
                self.artworkURL = nil
            }
            call.resolve()
        }
    }

    private func loadArtwork(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        let requested = urlString
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self,
                  let data = data,
                  let image = UIImage(data: data) else { return }
            // The user may have skipped to another song while this loaded.
            guard self.artworkURL == requested else { return }
            let art = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                guard self.artworkURL == requested else { return }
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
                info[MPMediaItemPropertyArtwork] = art
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }.resume()
    }

    @objc func setPlaybackState(_ call: CAPPluginCall) {
        let isPlaying = call.getBool("isPlaying") ?? false
        let elapsed = call.getDouble("elapsed") ?? 0
        let duration = call.getDouble("duration") ?? 0
        if isPlaying {
            configureAudioSession()
        }
        DispatchQueue.main.async {
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
            if duration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = duration
            }
            // The OS interpolates the scrubber between our updates using the
            // rate, so 1.0 while playing / 0.0 while paused keeps it accurate.
            info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            call.resolve()
        }
    }

    /// Mirror the web player's Up Next queue into the shared store so the
    /// CarPlay browse list can render it. No effect on the lock screen (which
    /// only shows the single now-playing item); consumed by CarPlay only.
    @objc func setQueue(_ call: CAPPluginCall) {
        let raw = call.getArray("items", [String: Any].self) ?? []
        let currentIndex = call.getInt("currentIndex") ?? 0
        let items: [NowPlayingQueueEntry] = raw.map { dict in
            NowPlayingQueueEntry(
                id: dict["id"] as? String ?? "",
                title: dict["title"] as? String ?? "",
                artist: dict["artist"] as? String ?? "",
                artworkUrl: dict["artworkUrl"] as? String,
                duration: (dict["duration"] as? NSNumber)?.doubleValue ?? 0
            )
        }
        NowPlayingStore.shared.updateQueue(items, currentIndex: currentIndex)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        artworkURL = nil
        NowPlayingStore.shared.updateQueue([], currentIndex: 0)
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    // MARK: - Remote commands

    private func wireRemoteCommands() {
        if commandsWired { return }
        commandsWired = true
        let cc = MPRemoteCommandCenter.shared()

        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in
            self?.emit("play"); return .success
        }
        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { [weak self] _ in
            self?.emit("pause"); return .success
        }
        cc.togglePlayPauseCommand.isEnabled = true
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.emit("toggle"); return .success
        }
        cc.nextTrackCommand.isEnabled = true
        cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.emit("next"); return .success
        }
        cc.previousTrackCommand.isEnabled = true
        cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.emit("prev"); return .success
        }
        cc.changePlaybackPositionCommand.isEnabled = true
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self?.emitSeek(e.positionTime)
            return .success
        }
    }

    private func emit(_ action: String) {
        notifyListeners("remoteCommand", data: ["action": action])
    }

    private func emitSeek(_ time: Double) {
        notifyListeners("remoteCommand", data: ["action": "seek", "value": time])
    }

    private func emitPlayIndex(_ index: Int) {
        notifyListeners("remoteCommand", data: ["action": "playIndex", "value": index])
    }
}
