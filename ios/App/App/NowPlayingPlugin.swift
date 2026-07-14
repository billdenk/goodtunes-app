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
        CAPPluginMethod(name: "setPlaylists", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFavorite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearLibrary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBuildInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHeadlessBringUp", returnType: CAPPluginReturnPromise),
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
    /// Raw decoded image behind `lastArtwork`. Kept so a track change with the
    /// SAME artwork URL (common: songs on one album share the cover) can mint a
    /// FRESH MPMediaItemArtwork instance — CPNowPlayingTemplate keys its
    /// re-render on artwork object identity, so re-using the old instance makes
    /// CarPlay treat the new track as "no change" and freeze the panel.
    private var lastArtworkImage: UIImage?

    public override func load() {
        // HEADLESS BOOT (cold CarPlay connect, no phone window): defer
        // `setActive(true)` until a real play intent. Activating here would
        // interrupt whatever the fan is listening to (Spotify, radio) the
        // moment the car connects, before they tapped anything. The normal
        // phone launch keeps the shipped activate-on-load behaviour unchanged.
        let headless = HeadlessWebPlayer.shared.isHeadlessBoot
        deferSessionActivation = headless
        configureAudioSession(activate: !headless)
        registerSessionObservers()
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
        // CarPlay Collection Playlists row tap → ask JS to load + play the
        // playlist. JS fetches the track list and starts playback.
        NowPlayingStore.shared.onPlayPlaylist = { [weak self] playlistId in
            self?.emitPlayPlaylist(playlistId: playlistId)
        }
        // Cold-connect tap-to-play: a browse tap that landed while the web
        // player was still booting was buffered by the store (the on* above
        // were nil). Drain it now — the emits use retainUntilConsumed, so the
        // command survives the remaining gap until JS attaches its
        // `remoteCommand` listener. Stale (>2min) intents were already dropped
        // by drainPendingIntent().
        switch NowPlayingStore.shared.drainPendingIntent() {
        case .album(let albumId, let trackId, let shuffle):
            emitPlayAlbum(albumId: albumId, trackId: trackId, shuffle: shuffle)
        case .index(let index):
            emitPlayIndex(index)
        case .playlist(let playlistId):
            emitPlayPlaylist(playlistId: playlistId)
        case nil:
            break
        }
    }

    /// True while a headless (cold-CarPlay) boot has NOT yet activated the
    /// audio session — see load(). Flipped off by the first play intent.
    private var deferSessionActivation = false

    /// One-shot: activate the deferred audio session the moment a genuine play
    /// intent flows through (CarPlay tap forwarded to JS, or the web player
    /// reporting isPlaying). No-op on the normal phone-boot path and after the
    /// first activation — this is NOT a recurring-push activation site (see
    /// the configureAudioSession comment for why that would be fatal).
    private func activateSessionForPlayIntent() {
        guard deferSessionActivation else { return }
        deferSessionActivation = false
        configureAudioSession(activate: true)
    }

    /// JS-settable kill switch for the cold-CarPlay headless bring-up
    /// (HeadlessWebPlayer). Persisted so it applies to the NEXT cold connect;
    /// a web publish can flip it without a native rebuild.
    @objc func setHeadlessBringUp(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        UserDefaults.standard.set(!enabled, forKey: HeadlessWebPlayer.killSwitchKey)
        call.resolve()
    }

    /// Put the shared audio session in `.playback` so the WebView's <audio>
    /// keeps playing when backgrounded / locked.
    ///
    /// CRITICAL: `setActive(true)` must NOT be called on the recurring metadata /
    /// playback-state pushes. The web player lives in WKWebView, which owns its
    /// own media AVAudioSession; re-activating a second session ~1×/sec races it
    /// and silences the <audio> element ~2s after playback starts (confirmed
    /// on-device, iPhone + CarPlay). So we activate ONCE here on load and again
    /// only when a genuine interruption ends (see handleInterruption); the hot
    /// path only repairs a drifted category via ensurePlaybackCategory(), which
    /// never activates.
    private func configureAudioSession(activate: Bool) {
        let session = AVAudioSession.sharedInstance()
        do {
            if session.category != .playback {
                try session.setCategory(.playback, mode: .default, options: [])
            }
            if activate {
                try session.setActive(true)
            }
        } catch {
            // Best-effort — a failure here just means the OS keeps the default
            // (ambient) category; playback still works while foregrounded.
        }
    }

    /// Repair ONLY the category if something (e.g. WKWebView) reset it away from
    /// `.playback`. No `setActive` — safe to call from the recurring pushes and
    /// route changes. A no-op in the common case (category already `.playback`).
    private func ensurePlaybackCategory() {
        let session = AVAudioSession.sharedInstance()
        guard session.category != .playback else { return }
        try? session.setCategory(.playback, mode: .default, options: [])
    }

    /// Observe the two moments the OS can pull our session out from under the
    /// web player, so we re-assert it at the RIGHT times instead of blindly every
    /// tick: an interruption ending (phone call / Siri / other app) is the one
    /// legitimate place to re-`setActive(true)`; a route change (headphones out,
    /// CarPlay / Bluetooth connect) can leave the category drifted, which we
    /// repair without re-activating.
    private func registerSessionObservers() {
        let nc = NotificationCenter.default
        nc.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: nil
        )
        nc.addObserver(
            self, selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification, object: nil
        )
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        // Surface BOTH edges of the interruption into the JS diagnostic ring
        // buffer (visible in the operator debug overlay). If Bill's mid-drive
        // audio dropouts line up with `native-interruption-began` events, the
        // cause is OS-level session arbitration, not the web player.
        emitDiagEvent(type == .began ? "interruption-began" : "interruption-ended")
        guard type == .ended else { return }
        // The interruption is over — re-activate our session (the ONE legitimate
        // place to call setActive(true) again) and, if iOS says we may resume,
        // ask the web player to start playing again.
        configureAudioSession(activate: true)
        let shouldResume = (info[AVAudioSessionInterruptionOptionKey] as? UInt)
            .map { AVAudioSession.InterruptionOptions(rawValue: $0).contains(.shouldResume) } ?? false
        if shouldResume {
            emit("play")
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let info = notification.userInfo,
              let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else {
            ensurePlaybackCategory()
            return
        }
        // Route changes into the JS diagnostic ring buffer too — a dropout that
        // lines up with `native-route-…` (CarPlay/Bluetooth renegotiating the
        // audio bus) is a different failure than an interruption.
        switch reason {
        case .newDeviceAvailable: emitDiagEvent("route-new-device")
        case .oldDeviceUnavailable: emitDiagEvent("route-device-gone")
        case .categoryChange: emitDiagEvent("route-category-change")
        default: emitDiagEvent("route-other-\(raw)")
        }
        switch reason {
        case .newDeviceAvailable:
            // A new audio output connected (CarPlay head unit, Bluetooth, headphones).
            // The audio session is ALREADY active (set in load() and only
            // re-activated after genuine interruptions). Calling setActive(true)
            // here races WKWebView's own media session at the moment the car head
            // unit takes over the audio bus, producing a MEDIA_ERR_DECODE / stall
            // at t=0.0 before the first track starts. Only repair the category
            // in case something drifted — never deactivate/reactivate the session
            // on a route change.
            ensurePlaybackCategory()
            // Give the new route ~300 ms to settle (driver stack negotiation),
            // then ask the web player to resume. Without this the <audio>
            // element can land in readyState=4 / stalled / emptied when the
            // car head-unit first takes over the audio bus.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.emit("play")
            }
        case .oldDeviceUnavailable:
            // A device was removed (headphones unplugged, CarPlay disconnected).
            // iOS already pauses the <audio> element; ensure the category stays
            // .playback so the next play() routes to the new default output.
            ensurePlaybackCategory()
        default:
            ensurePlaybackCategory()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Now-playing info

    @objc func setMetadata(_ call: CAPPluginCall) {
        ensurePlaybackCategory()
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""
        let duration = call.getDouble("duration") ?? 0
        let artwork = call.getString("artworkUrl")

        // Mirror to the persisted snapshot so a future COLD CarPlay connect (app
        // never opened, so this plugin never loads) can restore the Now Playing
        // metadata instead of the app icon. Art bytes follow from loadArtwork.
        NowPlayingStore.shared.persistMetadata(
            title: title, artist: artist, album: album, duration: duration, artworkUrl: artwork
        )
        DispatchQueue.main.async {
            // All self-heal cache mutations happen on the main thread so
            // setPlaybackState's mismatch guard (also main-thread) reads a
            // consistent view — no cross-thread race on these properties.
            let previousTitle = self.lastTitle
            self.lastTitle = title
            self.lastArtist = artist
            self.lastAlbum = album
            self.lastDuration = duration

            // --- PHASE 1: forced screen refresh on track change ---
            // When the track changes, wipe nowPlayingInfo and write the new
            // values on the NEXT main-thread hop. Build 97 did the nil + write
            // synchronously in one RunLoop tick — but iOS coalesces the two
            // assignments, so when the artwork is the same object (songs on
            // one album share the cover) CPNowPlayingTemplate observed *no
            // change at all* and kept the previous track's panel (Bill's
            // "frozen on fast-forward / auto-advance" bug, build 97 on-device).
            // Deferring the rewrite by one hop makes the wipe observable: the
            // head unit sees a real new-track event and re-renders text +
            // scrubber. The blank lasts one RunLoop tick — an intentional,
            // barely-visible "refresh" (exactly what Bill asked for).
            let trackChanged = !previousTitle.isEmpty && title != previousTitle

            let applyMetadata: () -> Void = { [weak self] in
                guard let self = self else { return }
                // Track may have changed AGAIN while this hop was queued
                // (rapid double-skip) — the newer setMetadata owns the dict.
                guard self.lastTitle == title else { return }
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
                info[MPMediaItemPropertyTitle] = title
                info[MPMediaItemPropertyArtist] = artist
                info[MPMediaItemPropertyAlbumTitle] = album
                if duration > 0 {
                    info[MPMediaItemPropertyPlaybackDuration] = duration
                }
                if trackChanged {
                    // Reset the scrubber immediately — the next
                    // setPlaybackState corrects it, but without this the head
                    // unit briefly shows the OLD track's elapsed on the new
                    // title.
                    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0
                }
                // Same artwork URL as the previous track (album playback):
                // mint a FRESH MPMediaItemArtwork from the cached image.
                // CarPlay keys its re-render on artwork object identity, so
                // re-injecting the old instance reads as "nothing changed".
                if let artwork = artwork, !artwork.isEmpty,
                   artwork == self.artworkURL, let img = self.lastArtworkImage {
                    let freshArt = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    self.lastArtwork = freshArt
                    info[MPMediaItemPropertyArtwork] = freshArt
                }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }

            if trackChanged {
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
                DispatchQueue.main.async(execute: applyMetadata)
            } else {
                applyMetadata()
            }

            // --- PHASE 2: load artwork asynchronously, merge when ready ---
            // Only apply it if the track hasn't changed by the time the image
            // arrives (artworkURL guard in loadArtwork's completion block).
            if let artwork = artwork, !artwork.isEmpty {
                if artwork != self.artworkURL {
                    self.artworkURL = artwork
                    // New art URL → stale cached object/image must not be re-used.
                    self.lastArtwork = nil
                    self.lastArtworkImage = nil
                    self.loadArtwork(artwork)
                }
                // else: same URL — applyMetadata above minted a fresh artwork
                // instance from the cached image (or, if the image hasn't
                // loaded yet, loadArtwork's completion will merge it).
            } else {
                self.artworkURL = nil
                self.lastArtwork = nil
                self.lastArtworkImage = nil
            }

            // --- Pending-play drain (cold-start Bug B) ---
            // If a CarPlay Play tap arrived before the JS bridge was live, the
            // play command handler buffered it in pendingPlay. The bridge is now
            // provably live (JS just called setMetadata), so drain the tap.
            if NowPlayingStore.shared.pendingPlay {
                NowPlayingStore.shared.pendingPlay = false
                self.emit("play")
            }

            call.resolve()
        }
    }

    private func loadArtwork(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        let requested = urlString

        // --- Artwork timeout fallback (Step 3) ---
        // If the image fetch hasn't resolved within ~3 seconds, write the
        // now-playing dict WITHOUT an artwork key. A title-only display is
        // infinitely better than a CarPlay screen that never updates because
        // it's waiting on a stalled image load on a slow cell connection.
        // The timeout is cancelled when the fetch completes first (artworkURL
        // will have changed if the track advanced, so the dict write is skipped
        // anyway). If it fires, the next setPlaybackState self-heal or a
        // future setMetadata will re-inject the art once the fetch resolves.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self else { return }
            // Only act when STILL waiting on this exact URL with no image yet.
            guard self.artworkURL == requested, self.lastArtwork == nil else { return }
            // The text fields are already in the dict; just ensure they're still
            // there (iOS can wipe the dict) and write without artwork. The dict
            // we write here omits the artwork key, which is fine — CarPlay shows
            // the generic music-note for a moment, then artwork lands on the next
            // setPlaybackState or when the fetch eventually resolves.
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
            if (info[MPMediaItemPropertyTitle] as? String)?.isEmpty != false {
                info[MPMediaItemPropertyTitle] = self.lastTitle
                info[MPMediaItemPropertyArtist] = self.lastArtist
                info[MPMediaItemPropertyAlbumTitle] = self.lastAlbum
                if self.lastDuration > 0 {
                    info[MPMediaItemPropertyPlaybackDuration] = self.lastDuration
                }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }

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
                // Cache for the setPlaybackState self-heal (see property comment)
                // and the raw image so a same-album track change can mint a
                // FRESH MPMediaItemArtwork (CarPlay re-render key).
                self.lastArtwork = art
                self.lastArtworkImage = image
                // Merge artwork into the existing dict (Phase 2 of the two-phase
                // write): read whatever text + elapsed fields are already there and
                // add the artwork key. Never re-write from scratch — avoids nuking
                // a concurrent setPlaybackState's elapsed/rate stamp.
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
        // Deliberately NOT re-activating the audio session here. This fires
        // ~1×/sec while playing; re-`setActive(true)` on that cadence races the
        // WKWebView media session and cuts the audio ~2s in (confirmed on-device).
        // Session activation lives in load() + interruption recovery only.
        // ONE exception: after a headless (cold-CarPlay) boot the load()-time
        // activation was deferred; the first isPlaying=true is a genuine play
        // signal, and activateSessionForPlayIntent() is one-shot — it can never
        // re-fire on the recurring pushes.
        if isPlaying {
            activateSessionForPlayIntent()
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
            // Mismatch guard: if setPlaybackState arrives BEFORE setMetadata
            // for the new track, the incoming duration may differ from
            // lastDuration (the audio element briefly reports the OLD track's
            // duration while the new track's metadata is already in lastTitle).
            //
            // OLD BEHAVIOUR (caused Bug A): wipe the dict and bail, which left
            // CarPlay frozen on the wrong title until the next setMetadata tick.
            //
            // NEW BEHAVIOUR: only bail when the bridge is truly uninitialized
            // (lastTitle empty — setMetadata was never called this session).
            // When there IS a legitimate mismatch, apply the playback state
            // using the CACHED lastDuration so the scrubber stays live; record
            // the recovery so future diagnostics can confirm the guard is no
            // longer firing spuriously.
            if self.lastTitle.isEmpty {
                // Bridge uninitialized — nothing useful to write yet.
                call.resolve()
                return
            }
            let durationMismatch = duration > 0 && self.lastDuration > 0
                && abs(duration - self.lastDuration) > 1.0
            if durationMismatch {
                // Transitional state (new track's setMetadata already queued
                // but not yet consumed by the main thread). Use the cached
                // duration so title/artist stay visible with a live scrubber.
                NowPlayingStore.shared.recordFreezeRecovery()
            }
            let effectiveDuration = durationMismatch ? self.lastDuration : duration

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
                } else if let url = self.artworkURL, !url.isEmpty {
                    // Art URL is known but the async fetch hasn't landed yet
                    // (or was abandoned because the track changed then came
                    // back). Re-kick the load so the car head-unit gets real
                    // artwork on the next tick instead of staying on the
                    // generic music-note placeholder.
                    self.loadArtwork(url)
                }
            }
            // Belt-and-suspenders: even when the title was written correctly
            // by setMetadata, the artwork key may have been dropped in the iOS
            // dict-reset window between setMetadata and this call (specifically
            // the same-artwork-URL path, which re-injects the key but there is
            // a race between that write and the emptied/waiting lifecycle). If
            // artwork is absent and we have a cached object, inject it now.
            if info[MPMediaItemPropertyArtwork] == nil, let art = self.lastArtwork {
                info[MPMediaItemPropertyArtwork] = art
            }
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
            if effectiveDuration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = effectiveDuration
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

    /// Mirror the fan's playlist list into the shared store so the CarPlay
    /// Collection tab can render a "Playlists" drill-down row. Lock-screen-
    /// agnostic — CarPlay only. Only playlist metadata (id/name/artwork) is
    /// pushed; tracks are fetched by JS when the driver taps a row.
    @objc func setPlaylists(_ call: CAPPluginCall) {
        let raw = call.getArray("playlists", [String: Any].self) ?? []
        let items: [CatalogPlaylist] = raw.map { dict in
            CatalogPlaylist(
                id: dict["id"] as? String ?? "",
                name: dict["name"] as? String ?? "",
                artworkUrl: dict["artworkUrl"] as? String
            )
        }
        NowPlayingStore.shared.updatePlaylists(items)
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
        lastArtworkImage = nil
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
        lastArtworkImage = nil
        NowPlayingStore.shared.clearSnapshot()
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    /// Return the native build's provenance so an operator can confirm, from
    /// inside the app, exactly which source commit produced the installed binary.
    /// The native shell loads a REMOTE origin (JS ships via web publish), so
    /// without this "is this build stale or genuinely broken?" is unanswerable
    /// on-device. `commit` is the Info.plist `GTGitCommit` stamped by the
    /// Codemagic archive step from `CM_COMMIT`; version/build are the standard
    /// bundle strings. Because this only resolves once the plugin is registered,
    /// a non-empty readback also proves the registration fix landed.
    @objc func getBuildInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary
        call.resolve([
            "commit": (info?["GTGitCommit"] as? String) ?? "",
            "version": (info?["CFBundleShortVersionString"] as? String) ?? "",
            "build": (info?["CFBundleVersion"] as? String) ?? ""
        ])
    }

    // MARK: - Remote commands

    private func wireRemoteCommands() {
        if commandsWired { return }
        commandsWired = true
        let cc = MPRemoteCommandCenter.shared()

        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .success }
            self.emit("play")
            // Cold-start pending-play buffer (Bug B): if the play tap arrives
            // before the JS bridge is live (lastTitle is empty — setMetadata
            // was never called this session), the notifyListeners above hits no
            // listener and is lost. Buffer it; setMetadata drains it the
            // instant the bridge proves itself alive.
            if self.lastTitle.isEmpty {
                NowPlayingStore.shared.pendingPlay = true
            }
            return .success
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

    /// Forward a native audio-session lifecycle event to JS so it lands in the
    /// playback diagnostic ring buffer (operator debug overlay). Rides the
    /// existing `remoteCommand` channel with action "diag" — older JS bundles
    /// simply ignore the unknown action.
    private func emitDiagEvent(_ detail: String) {
        notifyListeners("remoteCommand", data: ["action": "diag", "detail": detail])
    }

    private func emitSeek(_ time: Double) {
        notifyListeners("remoteCommand", data: ["action": "seek", "value": time])
    }

    // The three play-intent emits are RETAINED (retainUntilConsumed: true):
    // on a cold-connect headless boot they fire from load()'s pending-intent
    // drain BEFORE the page has loaded, so without retention the command would
    // hit zero listeners and vanish. Capacitor holds retained events forever,
    // so each carries a "ts" (ms epoch) and JS drops commands older than ~2min
    // — otherwise a tap buffered during a boot that never finished could blast
    // audio when the phone app opens hours later. They also activate a
    // deferred (headless-boot) audio session — a real play intent is the
    // signal it's ours to take. Everything else (pause/diag/resync/seek)
    // stays non-retained: replaying those late is wrong, not helpful.

    private func emitPlayIndex(_ index: Int) {
        activateSessionForPlayIntent()
        notifyListeners(
            "remoteCommand",
            data: ["action": "playIndex", "value": index, "ts": Date().timeIntervalSince1970 * 1000],
            retainUntilConsumed: true
        )
    }

    private func emitPlayAlbum(albumId: String, trackId: String?, shuffle: Bool) {
        activateSessionForPlayIntent()
        var data: [String: Any] = [
            "action": "playAlbum",
            "albumId": albumId,
            "shuffle": shuffle,
            "ts": Date().timeIntervalSince1970 * 1000,
        ]
        if let trackId = trackId {
            data["trackId"] = trackId
        }
        notifyListeners("remoteCommand", data: data, retainUntilConsumed: true)
    }

    private func emitResync() {
        notifyListeners("remoteCommand", data: ["action": "resync"])
    }

    private func emitPlayPlaylist(playlistId: String) {
        activateSessionForPlayIntent()
        notifyListeners(
            "remoteCommand",
            data: ["action": "playPlaylist", "playlistId": playlistId, "ts": Date().timeIntervalSince1970 * 1000],
            retainUntilConsumed: true
        )
    }
}
