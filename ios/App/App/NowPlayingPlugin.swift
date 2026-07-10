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
        CAPPluginMethod(name: "setCatalog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRecents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFavorite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLibrary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    private var commandsWired = false
    /// The URL of the artwork currently being (or already) loaded, so a slow
    /// image fetch that resolves after the user has skipped tracks is ignored.
    private var artworkURL: String?

    // MARK: - Last-known now-playing metadata (self-heal cache)
    //
    // iOS resets MPNowPlayingInfoCenter.nowPlayingInfo around some lifecycle
    // events (notably when a CarPlay scene connects). setPlaybackState fires
    // every tick and would then rebuild the dict with only elapsed/duration/
    // rate — so the scrubber advances but the head unit shows the app name +
    // icon instead of the real title/artist/art. We cache the last metadata
    // here and re-apply it in setPlaybackState whenever the live dict has lost
    // its title, so the now-playing surface self-heals without waiting for the
    // next song change (which is the only thing that re-fires setMetadata).
    private var lastTitle = ""
    private var lastArtist = ""
    private var lastAlbum = ""
    private var lastDuration: Double = 0
    private var lastArtwork: MPMediaItemArtwork?

    public override func load() {
        configureAudioSession()
        wireRemoteCommands()
        // Register with the shared store so a CarPlay row tap (which reaches
        // NowPlayingStore, not this plugin) is forwarded to JS as a `playIndex`
        // remote command, exactly like the transport commands above.
        NowPlayingStore.shared.onPlayIndex = { [weak self] index in
            self?.emitPlayIndex(index)
        }
        // A CarPlay catalog/recents tap (album id + optional track id + shuffle)
        // → `playAlbum`.
        NowPlayingStore.shared.onPlayAlbum = { [weak self] albumId, trackId, shuffle in
            self?.emitPlayAlbum(albumId: albumId, trackId: trackId, shuffle: shuffle)
        }
        // CarPlay Now Playing button taps → their JS remote commands. These fire
        // via the store (set by CarPlaySceneDelegate's button handlers), NOT via
        // MPRemoteCommandCenter targets, so the web player owns shuffle/repeat/
        // favorite state.
        NowPlayingStore.shared.onToggleFavorite = { [weak self] in
            self?.emit("toggleFavorite")
        }
        NowPlayingStore.shared.onToggleShuffle = { [weak self] in
            self?.emit("toggleShuffle")
        }
        NowPlayingStore.shared.onCycleRepeat = { [weak self] in
            self?.emit("cycleRepeat")
        }
        // CarPlay connected → ask JS to re-publish everything. iOS wipes
        // MPNowPlayingInfoCenter around scene connect, so without this the head
        // unit shows the app name/icon until the next song change.
        NowPlayingStore.shared.onResync = { [weak self] in
            self?.emitResync()
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

        // Cache for the setPlaybackState self-heal (see property comment).
        lastTitle = title
        lastArtist = artist
        lastAlbum = album
        lastDuration = duration
        // Mirror to the persisted snapshot so a future COLD CarPlay connect (app
        // never opened, so this plugin never loads) can restore the Now Playing
        // metadata instead of the app icon. Art bytes follow from loadArtwork.
        NowPlayingStore.shared.persistMetadata(
            title: title, artist: artist, album: album, duration: duration, artworkUrl: artwork
        )
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
            // Persist a bounded, downscaled JPEG of the art so a future COLD
            // CarPlay connect can render real artwork with no network (a remote
            // URL fetch would fail in the garage). Best-effort; ignored if the
            // track changed by the time it lands (url match re-checked in store).
            let jpeg = self.downscaledJpeg(image, maxDimension: 600)
            NowPlayingStore.shared.persistArtworkData(jpeg, forUrl: requested)
            DispatchQueue.main.async {
                guard self.artworkURL == requested else { return }
                // Cache for the setPlaybackState self-heal (see property comment).
                self.lastArtwork = art
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
                info[MPMediaItemPropertyArtwork] = art
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }.resume()
    }

    /// Aspect-fit downscale + JPEG-encode album art for the cold-connect
    /// snapshot, so persisted bytes stay small (UserDefaults is not for large
    /// blobs). No upscaling; returns nil on a degenerate image.
    private func downscaledJpeg(_ image: UIImage, maxDimension: CGFloat) -> Data? {
        let w = image.size.width, h = image.size.height
        guard w > 0, h > 0 else { return nil }
        let scale = min(maxDimension / w, maxDimension / h, 1)
        let target = CGSize(width: w * scale, height: h * scale)
        let rendered: UIImage
        if scale < 1 {
            let renderer = UIGraphicsImageRenderer(size: target)
            rendered = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        } else {
            rendered = image
        }
        return rendered.jpegData(compressionQuality: 0.8)
    }

    @objc func setPlaybackState(_ call: CAPPluginCall) {
        let isPlaying = call.getBool("isPlaying") ?? false
        let elapsed = call.getDouble("elapsed") ?? 0
        let duration = call.getDouble("duration") ?? 0
        // Optional shuffle/repeat hints so the CarPlay Now Playing buttons render
        // the web player's current modes. The buttons themselves drive JS via the
        // store handlers; these calls only keep the *displayed* state in sync.
        let shuffle = call.getBool("shuffle")
        let repeatMode = call.getString("repeat")
        if isPlaying {
            configureAudioSession()
        }
        let cc = MPRemoteCommandCenter.shared()
        if let shuffle = shuffle {
            cc.changeShuffleModeCommand.currentShuffleType = shuffle ? .items : .off
        }
        if let repeatMode = repeatMode {
            switch repeatMode {
            case "one": cc.changeRepeatModeCommand.currentRepeatType = .one
            case "all": cc.changeRepeatModeCommand.currentRepeatType = .all
            default: cc.changeRepeatModeCommand.currentRepeatType = .off
            }
        }
        DispatchQueue.main.async {
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
            // Self-heal: if iOS reset the dict (e.g. on CarPlay connect) it has
            // no title, so re-apply the cached metadata before we stamp the
            // position — otherwise the head unit shows the app name/icon with a
            // live scrubber. A resync from JS also covers this, but this catches
            // any reset the resync misses and costs nothing when the title's fine.
            let hasTitle = (info[MPMediaItemPropertyTitle] as? String)?.isEmpty == false
            if !hasTitle && !self.lastTitle.isEmpty {
                info[MPMediaItemPropertyTitle] = self.lastTitle
                info[MPMediaItemPropertyArtist] = self.lastArtist
                info[MPMediaItemPropertyAlbumTitle] = self.lastAlbum
                if self.lastDuration > 0 {
                    info[MPMediaItemPropertyPlaybackDuration] = self.lastDuration
                }
                if let art = self.lastArtwork {
                    info[MPMediaItemPropertyArtwork] = art
                }
            }
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

    /// Mirror the fan's browsable Library (owned GoodTunes releases + their
    /// tracklists) into the shared store so the CarPlay root list + album-detail
    /// screens can render it. Lock-screen-agnostic — CarPlay only.
    @objc func setCatalog(_ call: CAPPluginCall) {
        let rawAlbums = call.getArray("albums", [String: Any].self) ?? []
        let albums: [CatalogAlbum] = rawAlbums.map { a in
            let rawTracks = a["tracks"] as? [[String: Any]] ?? []
            let tracks: [CatalogTrack] = rawTracks.map { t in
                CatalogTrack(
                    id: t["id"] as? String ?? "",
                    title: t["title"] as? String ?? "",
                    artist: t["artist"] as? String ?? "",
                    duration: (t["duration"] as? NSNumber)?.doubleValue ?? 0
                )
            }
            return CatalogAlbum(
                id: a["id"] as? String ?? "",
                title: a["title"] as? String ?? "",
                artist: a["artist"] as? String ?? "",
                artworkUrl: a["artworkUrl"] as? String,
                tracks: tracks
            )
        }
        NowPlayingStore.shared.updateCatalog(albums)
        call.resolve()
    }

    /// Mirror the fan's "recently played" list into the shared store so the
    /// CarPlay Recents tab can render it. Lock-screen-agnostic — CarPlay only.
    @objc func setRecents(_ call: CAPPluginCall) {
        let raw = call.getArray("items", [String: Any].self) ?? []
        let items: [RecentEntry] = raw.map { dict in
            RecentEntry(
                albumId: dict["albumId"] as? String ?? "",
                trackId: dict["trackId"] as? String,
                title: dict["title"] as? String ?? "",
                subtitle: dict["subtitle"] as? String ?? "",
                artworkUrl: dict["artworkUrl"] as? String
            )
        }
        NowPlayingStore.shared.updateRecents(items)
        call.resolve()
    }

    /// Mirror whether the current track is a favorite so the CarPlay Now Playing
    /// heart button can render filled vs outline. Lock-screen-agnostic.
    @objc func setFavorite(_ call: CAPPluginCall) {
        let isFavorite = call.getBool("isFavorite") ?? false
        NowPlayingStore.shared.updateFavorite(isFavorite)
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        artworkURL = nil
        lastTitle = ""
        lastArtist = ""
        lastAlbum = ""
        lastDuration = 0
        lastArtwork = nil
        NowPlayingStore.shared.updateQueue([], currentIndex: 0)
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    /// Wipe the persisted cold-connect snapshot (owned catalog/recents/queue +
    /// last now-playing metadata/art). Called on sign-out so the next fan can't
    /// see the previous fan's library in the car. Deliberately separate from
    /// `clear()` — that fires on every launch when nothing is playing, which
    /// would erase the snapshot cold connect depends on.
    @objc func clearLibrary(_ call: CAPPluginCall) {
        artworkURL = nil
        lastTitle = ""
        lastArtist = ""
        lastAlbum = ""
        lastDuration = 0
        lastArtwork = nil
        NowPlayingStore.shared.clearSnapshot()
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

    private func emitPlayAlbum(albumId: String, trackId: String?, shuffle: Bool) {
        var data: [String: Any] = [
            "action": "playAlbum",
            "albumId": albumId,
            "shuffle": shuffle,
        ]
        if let trackId = trackId {
            data["trackId"] = trackId
        }
        notifyListeners("remoteCommand", data: data)
    }

    private func emitResync() {
        notifyListeners("remoteCommand", data: ["action": "resync"])
    }
}
