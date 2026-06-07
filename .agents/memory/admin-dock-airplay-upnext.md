---
name: Admin album dock — AirPlay yes, Up Next no
description: Why the admin AdminAlbum PlayerDock host wires AirPlay but deliberately omits Up Next, unlike the fan docks.
---

The admin album Tracks-tab PlayerDock host wires **AirPlay** (`airPlaySupported` + `onAirPlay`) but deliberately does **NOT** wire **Up Next** (`onQueue`/`queueActive`), even though the fan docks (MiniPlayer / AlbumDetailDesktop) wire all four.

**Why:**
- The admin player is self-contained: it owns its OWN hidden `<audio>` (audioRef) and steps through the album's `sorted` tracklist — it does NOT use PlayerContext. So AirPlay is detected + driven against that element directly (feature-detect `webkitShowPlaybackTargetPicker`, iOS-Safari-only; hidden on desktop where operators work).
- Up Next on the fan side opens the shared desktop right-rail bound to PlayerContext's queue. The admin CMS shell has no such rail, and the full tracklist is already visible + reorderable right below the dock. An Up Next rail would just duplicate that list.

**How to apply:** A future "bring fan dock control X to admin" task should NOT add an Up Next button to the admin dock unless admin first gains real right-rail/queue infrastructure. AirPlay parity is fine to keep/extend.
