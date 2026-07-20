import UIKit
import CarPlay

/**
 * CarPlaySceneDelegate — GoodTunes' in-car experience under the
 * `com.apple.developer.carplay-audio` entitlement.
 *
 * A genuinely browsable library (Apple rejects carplay-audio apps it doesn't
 * consider useful — a bare "Up Next" list is not enough), all system-drawn
 * chrome. The root is a CPTabBarTemplate with three tabs, mirroring the phone
 * player's shape:
 *
 *   HOME (house) — the fan's owned GoodTunes releases, fed by
 *     NowPlayingStore.shared.catalog (mirrored from the web player). Tapping an
 *     album pushes an album-detail list (Play + Shuffle rows, then the
 *     tracklist).
 *
 *   COLLECTION (square.stack) — an "Artists" section (each artist pushes their
 *     albums) and a "Songs" section (a flat, tap-to-play list), both derived
 *     from the same catalog.
 *
 *   RECENTS (clock) — the fan's recently-played albums/tracks, fed by
 *     NowPlayingStore.shared.recents.
 *
 *   Cold connect: on didConnect we call NowPlayingStore.shared.hydrateFromDisk()
 *   BEFORE building any template, so even when the phone app was never opened
 *   this session (no WebView, no plugin, nothing ever published) the tabs render
 *   the fan's owned catalog/recents + Now Playing shows the real last track from
 *   the on-device snapshot — not empty rows + the app icon. Only if the snapshot
 *   is also empty (brand-new install, or signed out) does a single non-tappable
 *   row stand in (neutral copy only — never mention login/iPhone-open, which
 *   CarPlay review rejects as an in-car login/setup demand).
 *
 * Playback taps (album Play/Shuffle rows, a track, an artist's album, a Recents
 * row) call NowPlayingStore.shared.requestPlayAlbum(albumId:trackId:shuffle:),
 * which the plugin forwards to JS as a `playAlbum` remote command so the web
 * player loads that album and starts playing, then surface the system Now
 * Playing screen.
 *
 *   Now Playing — CPNowPlayingTemplate.shared, the system template that reads
 *     MPNowPlayingInfoCenter / MPRemoteCommandCenter directly (NowPlayingPlugin
 *     already populates those for the lock screen, so metadata + transport need
 *     nothing extra). It is ALWAYS reached by PUSHING it on top of the current
 *     tab's stack — it must NEVER be the root template and must NEVER be placed
 *     inside the CPTabBarTemplate (either throws in
 *     -[CPTabBarTemplate validateTemplates:] and SIGABRTs the instant a head
 *     unit connects — the "opens then crashes" bug from the first build). We
 *     add custom Now Playing buttons (shuffle / heart / repeat) whose handlers
 *     forward to JS; because CarPlay tints button glyphs to the system color,
 *     the heart cannot render brand-pink in the car.
 *
 *   Up Next — still reachable without embedding Now Playing anywhere:
 *     CPNowPlayingTemplate.shared.isUpNextButtonEnabled is on and this delegate
 *     is a CPNowPlayingTemplateObserver, so the system Now Playing screen's Up
 *     Next button pushes our queue list on demand.
 *
 * Empty-on-connect fix: iOS resets MPNowPlayingInfoCenter around scene connect,
 * so on didConnect we call NowPlayingStore.shared.requestResync(), which the
 * plugin forwards to JS; PlayerContext then re-publishes the current metadata +
 * playback state + queue + catalog + recents + favorite. (The plugin also
 * self-heals the now-playing dict in setPlaybackState as a backstop.)
 *
 * No lyrics/commerce/GoodDeed/SuperCredits surfaces — CarPlay is playback +
 * browse only.
 *
 * See NowPlayingStore.swift for why a shared singleton (rather than a direct
 * reference) is the bridge between this scene and NowPlayingPlugin: UIKit
 * instantiates this class when a head unit connects, with no reference to the
 * Capacitor plugin instance.
 */
@available(iOS 14.0, *)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, CPNowPlayingTemplateObserver {

    private var interfaceController: CPInterfaceController?
    private var tabBarTemplate: CPTabBarTemplate?
    private let homeTemplate = CPListTemplate(title: "Home", sections: [])
    private let collectionTemplate = CPListTemplate(title: "Collection", sections: [])
    private let recentsTemplate = CPListTemplate(title: "Recents", sections: [])
    private let queueListTemplate = CPListTemplate(title: "Up Next", sections: [])

    /// In-memory album-art cache, keyed by URL. Bounds memory across the whole
    /// Library list + album-detail rows and avoids re-fetching the same art.
    private let artworkCache = NSCache<NSString, UIImage>()

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController

        // COLD-CONNECT HYDRATION: on a cold connect (phone app never opened this
        // session) the WebView + NowPlayingPlugin never load, so nothing was ever
        // pushed into the store. Reload the fan's owned catalog/recents/queue +
        // last now-playing metadata/art from the on-device snapshot BEFORE any
        // template is built, so the tabs + Now Playing show real content instead
        // of empty placeholders + the app icon. This only sets in-memory arrays
        // and restores MPNowPlayingInfoCenter (when empty) — it never pushes a
        // template or roots Now Playing, so it is SIGABRT-safe here.
        NowPlayingStore.shared.hydrateFromDisk()

        // COLD-CONNECT TAP-TO-PLAY: if no web player is alive (true cold
        // connect), boot one OFF-WINDOW now so a browse tap ~10-15s from now
        // has something to play — otherwise every tap is silently lost (the
        // App Store rejection risk Bill flagged). No-op on a warm connect, and
        // a no-op when the JS kill switch disabled it. Plain app code — no
        // scene-manifest change. Taps that land BEFORE the web player finishes
        // booting are buffered (NowPlayingStore.pendingIntent) and replayed.
        HeadlessWebPlayer.shared.bringUpIfNeeded()

        // Now Playing is reached by PUSH only (never rooted, never inside the
        // tab bar — either SIGABRTs on connect). Enable + observe the Up Next
        // button so the queue list is pushable from the system Now Playing
        // screen; the album-artist button stays off (no artist page from Now
        // Playing in CarPlay v1). Install the custom shuffle/heart/repeat
        // buttons up front.
        CPNowPlayingTemplate.shared.isUpNextButtonEnabled = true
        CPNowPlayingTemplate.shared.isAlbumArtistButtonEnabled = false
        CPNowPlayingTemplate.shared.add(self)
        rebuildNowPlayingButtons()

        // Tab titles + system icons.
        homeTemplate.tabTitle = "Home"
        homeTemplate.tabImage = UIImage(systemName: "house")
        collectionTemplate.tabTitle = "Collection"
        collectionTemplate.tabImage = UIImage(systemName: "square.stack")
        recentsTemplate.tabTitle = "Recents"
        recentsTemplate.tabImage = UIImage(systemName: "clock")

        rebuildHomeTemplate()
        rebuildCollectionTemplate()
        rebuildRecentsTemplate()
        rebuildQueueTemplate()

        // Build the tab bar, guarding the head unit's tab cap (well above 3, but
        // defensive — an over-cap tab bar throws in validateTemplates:).
        var tabs: [CPTemplate] = [homeTemplate, collectionTemplate, recentsTemplate]
        let maxTabs = CPTabBarTemplate.maximumTabCount
        if tabs.count > maxTabs { tabs = Array(tabs.prefix(maxTabs)) }
        let tabBar = CPTabBarTemplate(templates: tabs)
        self.tabBarTemplate = tabBar

        NowPlayingStore.shared.onCatalogChanged = { [weak self] in
            self?.rebuildHomeTemplate()
            self?.rebuildCollectionTemplate()
        }
        NowPlayingStore.shared.onQueueChanged = { [weak self] in
            self?.rebuildQueueTemplate()
        }
        NowPlayingStore.shared.onRecentsChanged = { [weak self] in
            self?.rebuildRecentsTemplate()
        }
        NowPlayingStore.shared.onFavoriteChanged = { [weak self] in
            self?.rebuildNowPlayingButtons()
        }
        NowPlayingStore.shared.onPlaylistsChanged = { [weak self] in
            self?.rebuildCollectionTemplate()
        }
        // Track changed → force CPNowPlayingTemplate to re-render. CarPlay's
        // framework caches the template's visual state and does NOT auto-refresh
        // title + artwork when MPNowPlayingInfoCenter changes; an explicit
        // updateNowPlayingButtons call is required to trigger a re-render.
        NowPlayingStore.shared.onTrackChanged = { [weak self] in
            self?.rebuildNowPlayingButtons()
        }

        // Root is the browsable tab bar; the system Now Playing surface rides on
        // top of it, matching how Apple Music / Spotify open in CarPlay (library
        // first, now-playing bar along the bottom).
        interfaceController.setRootTemplate(tabBar, animated: false, completion: nil)

        // iOS wipes MPNowPlayingInfoCenter around scene connect, and on a WARM
        // connect the WebView may have connected before its queries resolved — ask
        // JS to re-publish metadata + playback state + queue + catalog + recents +
        // favorite, retrying on a bounded schedule until the catalog is non-empty.
        scheduleResync(attempt: 0)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        CPNowPlayingTemplate.shared.remove(self)
        NowPlayingStore.shared.onCatalogChanged = nil
        NowPlayingStore.shared.onQueueChanged = nil
        NowPlayingStore.shared.onRecentsChanged = nil
        NowPlayingStore.shared.onFavoriteChanged = nil
        NowPlayingStore.shared.onPlaylistsChanged = nil
        NowPlayingStore.shared.onTrackChanged = nil
        self.tabBarTemplate = nil
        self.interfaceController = nil
    }

    // MARK: - Resync

    /// Ask JS to re-publish now-playing metadata + queue + catalog + recents +
    /// favorite, retrying on a bounded schedule. On a WARM connect the WebView
    /// may have connected before its queries resolved, so a single resync can
    /// land while the catalog is still empty; re-fire every 2s until the catalog
    /// is non-empty, the head unit disconnects, or ~30s (15 attempts) elapses.
    /// On a true COLD connect there is no web player yet, so `onResync` is a
    /// no-op and these ticks harmlessly do nothing — `hydrateFromDisk()` already
    /// populated the lists from the on-device snapshot.
    ///
    /// `hydrateFromDisk()` runs BEFORE this, so on any connect after first use
    /// the catalog is already non-empty from the snapshot. We must therefore fire
    /// the FIRST resync (attempt 0) UNCONDITIONALLY — otherwise a warm connect
    /// (a live web player behind a hydrated catalog) never asks JS to re-publish,
    /// so iOS's connect-time MPNowPlayingInfoCenter wipe is only ever repaired by
    /// the paused-tick self-heal (and a paused track, producing no ticks, would
    /// be stuck at the hydrated 0:00 presentation). The catalog-non-empty stop
    /// applies only to RETRIES (attempt > 0), so a warm connect fires exactly
    /// once and a still-empty cold/first connect keeps retrying to the ceiling.
    private func scheduleResync(attempt: Int) {
        guard interfaceController != nil else { return }          // disconnected
        if attempt > 0 && !NowPlayingStore.shared.catalog.isEmpty { return }  // retry got real data
        NowPlayingStore.shared.requestResync()
        if attempt >= 15 { return }                              // ~30s ceiling
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.scheduleResync(attempt: attempt + 1)
        }
    }

    // MARK: - CPNowPlayingTemplateObserver

    /// System Now Playing "Up Next" tapped → push our queue list. (This is how
    /// Up Next stays reachable without rooting/embedding Now Playing.)
    func nowPlayingTemplateUpNextButtonTapped(_ nowPlayingTemplate: CPNowPlayingTemplate) {
        guard let ic = interfaceController else { return }
        // Never re-push a template already anywhere in the stack — CarPlay throws
        // the same uncaught NSException (SIGABRT) as rooting Now Playing did.
        if !ic.templates.contains(where: { $0 === queueListTemplate }) {
            ic.pushTemplate(queueListTemplate, animated: true, completion: nil)
        }
    }

    // MARK: - Now Playing buttons

    /// (Re)install the custom Now Playing buttons: shuffle, favorite (heart),
    /// repeat. Each handler forwards to JS via the store. The heart glyph
    /// reflects the current track's favorite state; CarPlay tints it to the
    /// system color, so brand-pink never renders in the car.
    private func rebuildNowPlayingButtons() {
        let shuffleButton = CPNowPlayingShuffleButton { _ in
            NowPlayingStore.shared.requestToggleShuffle()
        }
        let heartName = NowPlayingStore.shared.isCurrentFavorite ? "heart.fill" : "heart"
        let heartImage = UIImage(systemName: heartName) ?? UIImage()
        let favoriteButton = CPNowPlayingImageButton(image: heartImage) { _ in
            NowPlayingStore.shared.requestToggleFavorite()
        }
        let repeatButton = CPNowPlayingRepeatButton { _ in
            NowPlayingStore.shared.requestCycleRepeat()
        }
        CPNowPlayingTemplate.shared.updateNowPlayingButtons([shuffleButton, favoriteButton, repeatButton])
    }

    // MARK: - Home (owned albums)

    /// Rebuild the Home tab from the shared store's catalog. Each row is an
    /// album (title + artist detail + async art); tapping it pushes the
    /// album-detail tracklist. When the catalog is empty, a single non-tappable
    /// row explains how to load it.
    private func rebuildHomeTemplate() {
        let catalog = NowPlayingStore.shared.catalog
        let section: CPListSection

        if catalog.isEmpty {
            let placeholder = CPListItem(
                text: "Your library",
                detailText: "Your GoodTunes albums appear here"
            )
            // No handler → non-tappable informational row.
            section = CPListSection(items: [placeholder])
        } else {
            // Respect the head unit's item cap so an oversized library can't
            // trip CPListTemplate's validation.
            let maxItems = CPListTemplate.maximumItemCount
            let albums = catalog.count > maxItems ? Array(catalog.prefix(maxItems)) : catalog
            let items: [CPListItem] = albums.map { album in
                let item = CPListItem(
                    text: album.title,
                    detailText: album.artist.isEmpty ? nil : album.artist
                )
                item.accessoryType = .disclosureIndicator
                item.handler = { [weak self] _, completion in
                    self?.pushAlbum(album)
                    completion()
                }
                setThumbnail(item, urlString: album.artworkUrl)
                return item
            }
            section = CPListSection(items: items)
        }

        DispatchQueue.main.async { [weak self] in
            self?.homeTemplate.updateSections([section])
        }
    }

    // MARK: - Collection (Artists + Songs)

    /// Rebuild the Collection tab — Apple-Music-style Library layout:
    ///   Section 1 (no header): "Playlists" row + "Songs" row — each pushes a
    ///     sub-list derived from the fan's owned catalog.
    ///   Section 2 "Albums": owned catalog albums as browse rows with artwork;
    ///     tapping one pushes the album detail list (Play / Shuffle / tracklist).
    private func rebuildCollectionTemplate() {
        let catalog = NowPlayingStore.shared.catalog
        let playlists = NowPlayingStore.shared.playlists
        var sections: [CPListSection] = []

        if catalog.isEmpty && playlists.isEmpty {
            let placeholder = CPListItem(
                text: "Your collection",
                detailText: "Your music appears here"
            )
            sections = [CPListSection(items: [placeholder])]
        } else {
            // --- Section 1: category navigator rows (Playlists + Songs) -------
            let playlistCount = playlists.count
            let playlistItem = CPListItem(
                text: "Playlists",
                detailText: playlistCount == 0 ? nil
                    : playlistCount == 1 ? "1 playlist" : "\(playlistCount) playlists"
            )
            playlistItem.accessoryType = .disclosureIndicator
            if let artUrl = playlists.first?.artworkUrl {
                setThumbnail(playlistItem, urlString: artUrl)
            } else {
                playlistItem.setImage(listRowImage(systemName: "music.note.list"))
            }
            playlistItem.handler = { [weak self] _, completion in
                self?.pushPlaylists()
                completion()
            }

            let songCount = catalog.reduce(0) { $0 + $1.tracks.count }
            let songsItem = CPListItem(
                text: "Songs",
                detailText: songCount == 0 ? nil
                    : songCount == 1 ? "1 song" : "\(songCount) songs"
            )
            songsItem.accessoryType = .disclosureIndicator
            songsItem.setImage(listRowImage(systemName: "music.note"))
            songsItem.handler = { [weak self] _, completion in
                self?.pushSongs()
                completion()
            }

            sections.append(CPListSection(items: [playlistItem, songsItem]))

            // --- Section 2: "Albums" — owned catalog albums with artwork ------
            if !catalog.isEmpty {
                let maxItems = CPListTemplate.maximumItemCount
                // Reserve the two category rows against the template item cap.
                let albumCap = max(0, maxItems - 2)
                let display = catalog.count > albumCap ? Array(catalog.prefix(albumCap)) : catalog
                let albumItems: [CPListItem] = display.map { album in
                    let item = CPListItem(
                        text: album.title,
                        detailText: album.artist.isEmpty ? nil : album.artist
                    )
                    item.accessoryType = .disclosureIndicator
                    item.handler = { [weak self] _, completion in
                        self?.pushAlbum(album)
                        completion()
                    }
                    setThumbnail(item, urlString: album.artworkUrl)
                    return item
                }
                sections.append(CPListSection(items: albumItems, header: "Albums", sectionIndexTitle: nil))
            }
        }

        DispatchQueue.main.async { [weak self] in
            self?.collectionTemplate.updateSections(sections)
        }
    }

    /// Push the Playlists sub-list. Each row sends a `playPlaylist` remote
    /// command back to JS, which fetches the track list and starts playback.
    private func pushPlaylists() {
        let playlists = NowPlayingStore.shared.playlists
        var sections: [CPListSection] = []

        if playlists.isEmpty {
            let placeholder = CPListItem(
                text: "No playlists",
                detailText: "Create a playlist in the GoodTunes app"
            )
            sections = [CPListSection(items: [placeholder])]
        } else {
            let maxItems = CPListTemplate.maximumItemCount
            let display = playlists.count > maxItems ? Array(playlists.prefix(maxItems)) : playlists
            let items: [CPListItem] = display.map { playlist in
                let item = CPListItem(text: playlist.name, detailText: nil)
                item.handler = { _, completion in
                    NowPlayingStore.shared.requestPlayPlaylist(playlistId: playlist.id)
                    completion()
                }
                setThumbnail(item, urlString: playlist.artworkUrl)
                return item
            }
            sections = [CPListSection(items: items)]
        }

        let template = CPListTemplate(title: "Playlists", sections: sections)
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    /// Push the Songs sub-list — all tracks across the owned catalog, flat.
    private func pushSongs() {
        let catalog = NowPlayingStore.shared.catalog
        let maxItems = CPListTemplate.maximumItemCount
        var items: [CPListItem] = []

        outer: for album in catalog {
            for track in album.tracks {
                if items.count >= maxItems { break outer }
                let detail = album.artist.isEmpty ? album.title : album.artist
                let item = CPListItem(text: track.title, detailText: detail)
                item.handler = { [weak self] _, completion in
                    NowPlayingStore.shared.requestPlayAlbum(
                        albumId: album.id, trackId: track.id, shuffle: false
                    )
                    self?.presentNowPlaying()
                    completion()
                }
                setThumbnail(item, urlString: album.artworkUrl)
                items.append(item)
            }
        }

        let sections: [CPListSection] = items.isEmpty
            ? [CPListSection(items: [CPListItem(text: "No songs", detailText: "Your library is empty")])]
            : [CPListSection(items: items)]
        let template = CPListTemplate(title: "Songs", sections: sections)
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    // MARK: - List-row glyphs

    /// Render an SF Symbol for use as a CPListItem image. Unlike CarPlay
    /// buttons and tab images, list-row images are drawn as-is (template
    /// black) — the system does NOT auto-tint them, so on the dark CarPlay
    /// background they're nearly invisible until the row highlights. Bake in
    /// an explicit white tint at a consistent size/weight so every action row
    /// glyph matches the play iconography used elsewhere.
    private func listRowImage(systemName: String) -> UIImage? {
        let config = UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)
        return UIImage(systemName: systemName, withConfiguration: config)?
            .withTintColor(.white, renderingMode: .alwaysOriginal)
    }

    // MARK: - Album detail

    /// Push an album detail list: a Play row and a Shuffle row, then the
    /// tracklist. Play starts from the top; Shuffle shuffles the album; a track
    /// starts from that track. Each asks JS to play, then surfaces Now Playing.
    private func pushAlbum(_ album: CatalogAlbum) {
        var sections: [CPListSection] = []

        // Play + Shuffle action rows.
        let playItem = CPListItem(text: "Play", detailText: nil)
        playItem.setImage(listRowImage(systemName: "play.fill"))
        playItem.handler = { [weak self] _, completion in
            NowPlayingStore.shared.requestPlayAlbum(albumId: album.id, trackId: nil, shuffle: false)
            self?.presentNowPlaying()
            completion()
        }
        let shuffleItem = CPListItem(text: "Shuffle", detailText: nil)
        shuffleItem.setImage(listRowImage(systemName: "shuffle"))
        shuffleItem.handler = { [weak self] _, completion in
            NowPlayingStore.shared.requestPlayAlbum(albumId: album.id, trackId: nil, shuffle: true)
            self?.presentNowPlaying()
            completion()
        }
        sections.append(CPListSection(items: [playItem, shuffleItem]))

        // Tracklist — reserve the two action rows against the item cap.
        let maxItems = CPListTemplate.maximumItemCount
        let trackCap = max(0, maxItems - 2)
        let tracks = album.tracks.count > trackCap ? Array(album.tracks.prefix(trackCap)) : album.tracks
        let trackItems: [CPListItem] = tracks.map { track in
            let duration = formattedDuration(track.duration)
            let item = CPListItem(text: track.title, detailText: duration.isEmpty ? nil : duration)
            item.handler = { [weak self] _, completion in
                NowPlayingStore.shared.requestPlayAlbum(albumId: album.id, trackId: track.id, shuffle: false)
                self?.presentNowPlaying()
                completion()
            }
            return item
        }
        sections.append(CPListSection(items: trackItems, header: "Tracks", sectionIndexTitle: nil))

        let template = CPListTemplate(title: album.title, sections: sections)
        interfaceController?.pushTemplate(template, animated: true, completion: nil)
    }

    // MARK: - Recents

    /// Rebuild the Recents tab from the shared store's recents list. Tapping a
    /// row asks JS to play that album (starting at the track when the recent was
    /// a specific track), then surfaces Now Playing.
    private func rebuildRecentsTemplate() {
        let recents = NowPlayingStore.shared.recents
        let section: CPListSection

        if recents.isEmpty {
            let placeholder = CPListItem(
                text: "Nothing played yet",
                detailText: "Your recently played music appears here"
            )
            section = CPListSection(items: [placeholder])
        } else {
            let maxItems = CPListTemplate.maximumItemCount
            let list = recents.count > maxItems ? Array(recents.prefix(maxItems)) : recents
            let items: [CPListItem] = list.map { entry in
                let item = CPListItem(
                    text: entry.title,
                    detailText: entry.subtitle.isEmpty ? nil : entry.subtitle
                )
                item.handler = { [weak self] _, completion in
                    NowPlayingStore.shared.requestPlayAlbum(
                        albumId: entry.albumId, trackId: entry.trackId, shuffle: false
                    )
                    self?.presentNowPlaying()
                    completion()
                }
                setThumbnail(item, urlString: entry.artworkUrl)
                return item
            }
            section = CPListSection(items: items)
        }

        DispatchQueue.main.async { [weak self] in
            self?.recentsTemplate.updateSections([section])
        }
    }

    // MARK: - Up Next

    /// Rebuild the Up Next list: a "Now Playing" section (single row for the
    /// current track, marked with the system now-playing indicator) followed by
    /// an "Up Next" section (only the tracks coming AFTER the current one).
    /// Tapping any row plays that entry and surfaces the Now Playing screen.
    /// The index passed to `requestPlayIndex` is always the full-queue index so
    /// the web player's queue offset matches.
    private func rebuildQueueTemplate() {
        let queue = NowPlayingStore.shared.queue
        let currentIndex = NowPlayingStore.shared.currentIndex
        var sections: [CPListSection] = []

        if queue.isEmpty {
            let placeholder = CPListItem(text: "Nothing playing", detailText: nil)
            sections = [CPListSection(items: [placeholder])]
        } else {
            // -- Now Playing row (current track, marked with isPlaying) --
            if currentIndex < queue.count {
                let cur = queue[currentIndex]
                let dur = formattedDuration(cur.duration)
                let detail: String
                if cur.artist.isEmpty { detail = dur }
                else if dur.isEmpty    { detail = cur.artist }
                else                   { detail = "\(cur.artist) · \(dur)" }
                let nowItem = CPListItem(text: cur.title, detailText: detail)
                nowItem.isPlaying = true
                nowItem.handler = { [weak self] _, completion in
                    NowPlayingStore.shared.requestPlayIndex(currentIndex)
                    self?.presentNowPlaying()
                    completion()
                }
                sections.append(CPListSection(
                    items: [nowItem], header: "Now Playing", sectionIndexTitle: nil))
            }

            // -- Upcoming tracks (indices strictly after currentIndex) --
            let upcomingStart = currentIndex + 1
            if upcomingStart < queue.count {
                let maxItems = CPListTemplate.maximumItemCount
                // Reserve one slot for the now-playing row above.
                let budget = max(0, maxItems - 1)
                let upcomingSlice = queue[upcomingStart...].prefix(budget)
                let upcomingItems: [CPListItem] = upcomingSlice.enumerated().map { offset, entry in
                    let queueIndex = upcomingStart + offset   // full-queue index
                    let dur = formattedDuration(entry.duration)
                    let detail: String
                    if entry.artist.isEmpty { detail = dur }
                    else if dur.isEmpty    { detail = entry.artist }
                    else                   { detail = "\(entry.artist) · \(dur)" }
                    let item = CPListItem(text: entry.title, detailText: detail)
                    item.handler = { [weak self] _, completion in
                        NowPlayingStore.shared.requestPlayIndex(queueIndex)
                        self?.presentNowPlaying()
                        completion()
                    }
                    return item
                }
                if !upcomingItems.isEmpty {
                    sections.append(CPListSection(
                        items: upcomingItems, header: "Up Next", sectionIndexTitle: nil))
                }
            }

            if sections.isEmpty {
                let placeholder = CPListItem(text: "Nothing playing", detailText: nil)
                sections = [CPListSection(items: [placeholder])]
            }
        }

        DispatchQueue.main.async { [weak self] in
            self?.queueListTemplate.updateSections(sections)
        }
    }

    // MARK: - Helpers

    /// Push the system Now Playing screen on top of the current tab's stack —
    /// but only when it isn't already anywhere in the stack (re-pushing throws).
    /// Never rooted, never inside the tab bar (both SIGABRT on connect).
    private func presentNowPlaying() {
        guard let ic = interfaceController else { return }
        // Guard the WHOLE stack, not just the top: re-pushing a template already
        // anywhere in the hierarchy throws the same uncaught NSException (SIGABRT)
        // as the original root/tab attempts. (e.g. Now Playing pushed → Up Next
        // pushed on top → a browse row reached from there taps another track.)
        if !ic.templates.contains(where: { $0 === CPNowPlayingTemplate.shared }) {
            ic.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
        }
    }

    /// Fetch album art off the WebView (native URLSession) and apply it to a list
    /// row on the main thread, cached + downscaled to CPListItem.maximumImageSize
    /// so a full Library of thumbnails stays memory-bounded. A slow fetch that
    /// resolves after the list rebuilds simply lands on a discarded item — the
    /// next rebuild re-requests from the cache and applies instantly.
    private func setThumbnail(_ item: CPListItem, urlString: String?) {
        guard let urlString = urlString, !urlString.isEmpty, let url = URL(string: urlString) else {
            return
        }
        if let cached = artworkCache.object(forKey: urlString as NSString) {
            item.setImage(cached)
            return
        }
        let maxSize = CPListItem.maximumImageSize
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self,
                  let data = data,
                  let raw = UIImage(data: data) else { return }
            let image = self.downscaled(raw, to: maxSize)
            self.artworkCache.setObject(image, forKey: urlString as NSString)
            DispatchQueue.main.async {
                item.setImage(image)
            }
        }.resume()
    }

    /// Aspect-fit downscale so no dimension exceeds `maxSize`. No-op when the
    /// image already fits (or sizes are degenerate).
    private func downscaled(_ image: UIImage, to maxSize: CGSize) -> UIImage {
        let w = image.size.width, h = image.size.height
        guard w > 0, h > 0, maxSize.width > 0, maxSize.height > 0 else { return image }
        let scale = min(maxSize.width / w, maxSize.height / h, 1)
        if scale >= 1 { return image }
        let newSize = CGSize(width: w * scale, height: h * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    }

    private func formattedDuration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "" }
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
