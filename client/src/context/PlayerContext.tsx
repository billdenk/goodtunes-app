import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Hls from "hls.js";
import { Song, Album, getSongById } from "@/data/musicData";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { track } from "@/lib/analytics";
import { apiRequest } from "@/lib/queryClient";
import { isNative, isNativeIOS, isWebIOS } from "@/lib/platform";
import {
  setNowPlayingMetadata,
  setNowPlayingPlaybackState,
  setNowPlayingQueue,
  clearNowPlaying,
  onNowPlayingRemoteCommand,
  absolutizeArtwork,
} from "@/lib/nativeNowPlaying";
import { offlineSrcFor } from "@/lib/nativeDownloads";

export interface PlayerSong extends Song {
  album: Album;
  /** True when the fan has an admin-granted *preview* (full playback, but
   *  not a real purchase/comp). Playlist adds require genuine ownership so
   *  Player.tsx uses this — alongside previewMode — to gate the action. */
  isPreviewGrant?: boolean;
}

interface PlayerState {
  queue: PlayerSong[];
  currentIndex: number;
  currentSong: PlayerSong | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: "none" | "all" | "one";
  showLyrics: boolean;
  showPlayer: boolean;
  showAddToPlaylist: boolean;
  showQueue: boolean;
  autoplay: boolean;
  favorites: Set<string>;
  /** Album IDs the fan has permanently purchased or comped (isPreview=false).
   *  Derived from /api/my-albums inside the provider so Player.tsx can gate
   *  Add-to-Playlist without knowing which host surface queued the song. */
  trulyOwnedAlbumIds: Set<string>;
  /** True only when iOS WebKit reports at least one AirPlay target (Apple TV
   *  / HomePod) is reachable for the hidden audio element. Stays false on
   *  every non-Safari platform (Android, desktop, in-app browsers) because
   *  the availability event never fires there — no platform sniffing needed.
   *  Drives whether a reachable wireless target currently exists. */
  airPlayAvailable: boolean;
  /** True on any platform that exposes `webkitShowPlaybackTargetPicker`
   *  (i.e. iOS Safari), regardless of whether a target is reachable yet.
   *  Apple Music keeps its output button permanently visible on iPhone —
   *  tapping it always opens the route picker (even when only "iPhone
   *  Speaker" is listed) — so the player gates its AirPlay button on this,
   *  not on `airPlayAvailable`. Stays false everywhere else (Android,
   *  desktop, in-app webviews) so the button never appears off-platform. */
  airPlaySupported: boolean;
  /** When true, playback auto-advances to the next queued song after 30
   *  seconds — used by the desktop Preview & Purchase route to audition
   *  the album without playing through full songs. Independent of the
   *  per-song `isPreviewable` flag; the host decides when to switch on. */
  previewMode: boolean;
  /** Output volume level, 0–100. Applied to the hidden audio element so the
   *  full-screen desktop Now Playing volume slider drives real playback. */
  volume: number;
  /** True when output is muted (volume preserved so unmute restores it). */
  muted: boolean;
}

interface PlayerContextValue extends PlayerState {
  playSong: (song: PlayerSong, queue?: PlayerSong[]) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (time: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setShowLyrics: (show: boolean) => void;
  setShowPlayer: (show: boolean) => void;
  setShowAddToPlaylist: (show: boolean) => void;
  setShowQueue: (show: boolean) => void;
  /** Toggles the shared desktop right rail between lyrics, queue, and
   *  closed. Lyrics and the Up Next queue are mutually exclusive: opening
   *  one closes the other; tapping the already-open mode closes the rail. */
  toggleRail: (mode: "lyrics" | "queue") => void;
  toggleAutoplay: () => void;
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (index: number) => void;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: PlayerSong) => void;
  playNext: (song: PlayerSong) => void;
  playLast: (song: PlayerSong) => void;
  /** Jump to a track already in the queue by its index and start playing it.
   *  Used by the CarPlay / Android Auto browse list (`playIndex` command). */
  playQueueIndex: (index: number) => void;
  setPreviewMode: (on: boolean) => void;
  /** Preview window for the current song, in seconds, derived from the
   *  operator/GoodSync-placed previewStartMs/previewEndMs. previewStartSec is
   *  where the 30-sec preview begins (0 when no window is set), previewEndSec
   *  where it ends, and previewWindowSec the clamped length (≤ PREVIEW_CAP_
   *  SECONDS). Only meaningful while previewMode is on; off-preview they
   *  resolve to 0 / cap / cap so scrubber math reduces to 0..duration. */
  previewStartSec: number;
  previewEndSec: number;
  previewWindowSec: number;
  /** Sets output volume (0–100). Unmutes when the new level is > 0. */
  setVolume: (level: number) => void;
  /** Toggles mute, preserving the prior volume level. */
  toggleMute: () => void;
  /** Opens the native iOS AirPlay device picker for the hidden audio
   *  element. No-op when no target is available or the API is absent. */
  showAirPlayPicker: () => void;
}

/** Hard cap on a single preview clip, in seconds. Apple/Spotify/etc all
 *  use 30 — long enough to recognize a song, short enough that the fan
 *  can't substitute it for the purchase. */
export const PREVIEW_CAP_SECONDS = 30;

// Exported so component/integration tests can supply a controlled context
// value (the mobile Player consumes this via usePlayer rather than props —
// see client/src/pages/playerLyricsPanel.test.ts). App code should keep
// using usePlayer()/PlayerProvider, not this raw context.
export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PlayerSong[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "all" | "one">("none");
  const [showLyrics, setShowLyrics] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [previewMode, setPreviewModeState] = useState(false);
  const [volume, setVolumeState] = useState(100);
  const [muted, setMuted] = useState(false);
  const [airPlayAvailable, setAirPlayAvailable] = useState(false);
  const [airPlaySupported, setAirPlaySupported] = useState(false);
  const favSongs = useFavoriteSongs();
  const favorites = favSongs.set;
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Catalog-wide DB song fetch. Every entry point that builds a queue
  // (album page, artist page, Songs tab, playlists, ⋯-menu actions) hands
  // PlayerSong objects to playSong/playNext/playLast/addToQueue. The
  // surfaces that still derive their lists from the static seed catalog
  // in `@/data/musicData` (artist page, Songs tab) don't include the
  // server-side fields fans need to actually hear the song — `audioUrl`,
  // `syncedLyrics` (GoodSync cues), and the canonical `lyrics` text. We
  // fetch the whole catalog once on app load and hydrate any PlayerSong
  // by id below so the player always sees real DB values regardless of
  // how the queue was assembled. `staleTime: Infinity` matches the rest
  // of the app's query defaults; invalidation happens via TanStack when
  // an admin mutation updates a song row.
  const { data: dbSongList } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });
  // True ownership set — albums the fan has bought/comped (isPreview=false).
  // Used by Player.tsx to gate "Add to Playlist" regardless of which host
  // surface (AlbumDetail, Collection, Playlists, etc.) queued the songs.
  const { data: myAlbumsForOwnership } = useQuery<Array<{ albumId: string; isPreview?: boolean }> | null>({
    queryKey: ["/api/my-albums"],
  });
  const trulyOwnedAlbumIds = useMemo(
    () => new Set((myAlbumsForOwnership ?? []).filter((a) => !a.isPreview).map((a) => a.albumId)),
    [myAlbumsForOwnership],
  );
  const dbSongById = useMemo(() => {
    const m = new Map<string, Song>();
    (dbSongList ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [dbSongList]);
  // Merge DB fields onto a PlayerSong without losing its joined `album`
  // (which the static seed surfaces still supply). DB row wins for the
  // playable fields; the album reference is preserved from the caller.
  // The catalog response intentionally omits the heavy `lyrics`,
  // `syncedLyrics`, and `waveform` columns (see /api/songs server-side
  // — keeps the payload off the iOS Safari OOM cliff), so we preserve
  // those from `s` when the catalog row doesn't carry them. They're
  // back-filled per-currentSong by the GET /api/songs/:id effect below.
  const hydrate = useCallback(
    (s: PlayerSong): PlayerSong => {
      const db = dbSongById.get(s.id);
      if (!db) return s;
      return {
        ...s,
        ...db,
        lyrics: (db as any).lyrics ?? s.lyrics,
        syncedLyrics: (db as any).syncedLyrics ?? s.syncedLyrics,
        waveform: (db as any).waveform ?? (s as any).waveform,
        album: s.album,
      };
    },
    [dbSongById],
  );
  // Re-hydrate the existing queue whenever the DB map changes. Covers two
  // races the architect review flagged:
  //   1. First-tap race — fan taps play before `/api/songs` resolves, queue
  //      is set with unhydrated seed songs. When data arrives, this effect
  //      back-fills GoodSync cues + audioUrl into the already-loaded queue
  //      so the currently-playing song picks them up mid-playback.
  //   2. Refetch staleness — when an admin updates a song row and
  //      `/api/songs` revalidates, existing queue state would otherwise
  //      stay stale. This patches it in place, preserving currentIndex.
  // Guarded on dbSongList being defined (the query may be loading) so we
  // don't replace the queue with itself on every render.
  useEffect(() => {
    if (!dbSongList) return;
    setQueue((q) => {
      if (q.length === 0) return q;
      let changed = false;
      const next = q.map((s) => {
        const h = hydrate(s);
        if (h !== s) changed = true;
        return h;
      });
      return changed ? next : q;
    });
  }, [dbSongList, hydrate]);

  // Hidden HTMLAudioElement — never mounted to the DOM, so there's no UI change.
  // Used when the current song has a real audioUrl. Songs without an audioUrl
  // fall back to the simulated timer below (existing behavior).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (typeof window !== "undefined" && audioRef.current === null) {
    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;
  }

  // Apply the output volume/mute to the persistent hidden audio element.
  // Runs whenever either changes; the element is created once above so a
  // single effect keeps it in sync for the lifetime of the provider.
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = muted ? 0 : volume / 100;
  }, [volume, muted]);

  // WebKit autoplay unlock. iPhone/iPad Safari, desktop Safari, and
  // standalone home-screen installs refuse to start *unmuted* playback on a
  // media element unless that element was first played from inside a real
  // user gesture. Our signed Mux URL is fetched asynchronously after the tap,
  // so the eventual a.play() lands OUTSIDE the gesture stack and WebKit
  // silently blocks it — the dock flips to "playing" but no sound comes out.
  // (Chrome and high-engagement operator devices are exempted by the Media
  // Engagement Index, which is why fresh fans hit this and we don't.)
  //
  // ensureAudioUnlocked() blesses the persistent element by playing a
  // zero-length silent clip from inside a user gesture. It is:
  //   • idempotent — no-ops once the element is blessed;
  //   • success-driven — it only marks the element unlocked after play()
  //     actually resolves, so a non-qualifying gesture (a scroll, a rejected
  //     play) never permanently "burns" the unlock; the next gesture retries;
  //   • non-destructive — it only borrows the element while nothing real is
  //     attached, and restores it only while the silent clip is still loaded,
  //     so it can never clobber a Mux/offline source resolveStream swapped in
  //     (the silent clip resolves in a microtask, long before the network
  //     fetch for the real signed URL completes, and the restore is guarded).
  // It runs both on the first qualifying interaction anywhere (the listeners
  // below, kept alive and retried until success) and synchronously at the top
  // of the play handlers, guaranteeing a gesture-bound attempt on the very tap
  // that starts playback.
  const audioUnlockedRef = useRef(false);
  const ensureAudioUnlocked = useCallback(() => {
    const a = audioRef.current;
    if (a === null || audioUnlockedRef.current) return;
    const SILENT_WAV =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    // When a REAL (Mux/offline) source is already attached we must still issue
    // a play() inside THIS gesture — in this app the actual play/resume usually
    // fires from an effect (the isPlaying effect / attachSrc), i.e. OUTSIDE the
    // gesture, so if the silent bless above ever got blocked the element can
    // stay locked forever and the fan is trapped in "flips to playing, no
    // sound". The in-gesture play here resolves that. We must NOT borrow or
    // restore in this case — the source is real, so we only finalize the unlock
    // on resolve and otherwise leave playback entirely to the normal effect.
    const hasRealSrc = !!a.src && !a.src.startsWith("data:audio/wav");
    const restore = () => {
      // Only undo our own silent borrow — if resolveStream has already swapped
      // in the real (Mux/offline) source, leave it completely alone.
      //
      // CRITICAL: we only PAUSE the silent clip — we must NOT removeAttribute
      // + load() it. On WebKit (Safari desktop + iOS) the gesture "bless" that
      // play() grants is per-element and is dropped the moment the element is
      // reset to a no-source state via removeAttribute("src") + load(). The
      // real play() fires later from attachSrc/the isPlaying effect — OUTSIDE
      // the gesture — so if we de-bless here that deferred play is autoplay-
      // blocked, flipping isPlaying back to false. The fan then sees the dock
      // load the track but sit paused, and a SECOND tap is needed to actually
      // play. Leaving the (zero-length, paused) silent src attached preserves
      // the bless; resolveStream overwrites a.src wholesale with the real
      // source, so the lingering data: URL is harmless (hasRealSrc checks key
      // off the data:audio/wav prefix). Pausing also stops the silent clip
      // before it can fire a spurious zero-length `ended` that would advance
      // the queue.
      try {
        if (a.src.startsWith("data:audio/wav")) {
          a.pause();
        }
      } catch {
        /* best-effort */
      }
    };
    try {
      if (!a.src) a.src = SILENT_WAV;
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          audioUnlockedRef.current = true;
          if (!hasRealSrc) restore();
        }).catch(() => {
          // Gesture didn't qualify — leave it for the next one to retry. Never
          // restore over a real source (don't disturb an in-flight stream).
          if (!hasRealSrc) restore();
        });
      } else {
        // Older browsers return no promise; assume the in-gesture play took.
        audioUnlockedRef.current = true;
        if (!hasRealSrc) restore();
      }
    } catch {
      /* best-effort; the next gesture (or the play tap) will retry */
    }
  }, []);

  // Keep listening for the first qualifying interaction anywhere on the page
  // and retry until the bless succeeds; ensureAudioUnlocked() no-ops after.
  useEffect(() => {
    const handler = () => ensureAudioUnlocked();
    document.addEventListener("click", handler, true);
    document.addEventListener("touchend", handler, true);
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("touchend", handler, true);
      document.removeEventListener("keydown", handler, true);
    };
  }, [ensureAudioUnlocked]);

  // Per-play analytics milestones. Reset whenever the current song changes
  // (or restarts via repeat-one). `started`/`hit30`/`completed` ensure each
  // event fires at most once per play instance.
  const milestonesRef = useRef<{
    songId: string | null;
    started: boolean;
    hit30: boolean;
    completed: boolean;
  }>({ songId: null, started: false, hit30: false, completed: false });
  const resetMilestones = useCallback((songId: string | null) => {
    milestonesRef.current = { songId, started: false, hit30: false, completed: false };
  }, []);
  const songMeta = useCallback((s: PlayerSong | null) => {
    if (!s) return {};
    return {
      songId: s.id,
      songTitle: s.title,
      albumId: s.album?.id,
      albumTitle: s.album?.title,
      artist: s.album?.artist,
    };
  }, []);

  const currentSong = queue[currentIndex] ?? null;

  // Preview window (seconds) for the current song, derived from the
  // operator/GoodSync-placed previewStartMs/previewEndMs. The fan preview
  // starts at previewStartSec (the placed chorus) instead of always 0:00, and
  // auto-advances at previewEndSec. Falls back to the first PREVIEW_CAP_SECONDS
  // when no window is set, and the window length never exceeds PREVIEW_CAP_
  // SECONDS so the "30s preview" guarantee holds. Resolves to 0 / cap / cap
  // off-preview (gated on previewMode) so the consuming scrubbers' subtractions
  // collapse back to the original 0..duration math.
  const rawPreviewStartMs = previewMode ? currentSong?.previewStartMs : null;
  const previewStartSec =
    Number.isFinite(rawPreviewStartMs) && (rawPreviewStartMs as number) > 0
      ? (rawPreviewStartMs as number) / 1000
      : 0;
  const rawPreviewEndMs = previewMode ? currentSong?.previewEndMs : null;
  let previewEndSec =
    Number.isFinite(rawPreviewEndMs) &&
    (rawPreviewEndMs as number) / 1000 > previewStartSec
      ? (rawPreviewEndMs as number) / 1000
      : previewStartSec + PREVIEW_CAP_SECONDS;
  if (previewEndSec - previewStartSec > PREVIEW_CAP_SECONDS) {
    previewEndSec = previewStartSec + PREVIEW_CAP_SECONDS;
  }
  const previewWindowSec = previewEndSec - previewStartSec;

  // On-demand lyrics hydration for the currently playing song. The
  // catalog list (/api/songs) omits lyrics/syncedLyrics/waveform to
  // keep the response small on mobile Safari, so we lazily fetch the
  // full row for the current song and patch it into the queue. Skipped
  // when the song already carries lyrics (e.g. it arrived via the
  // album-detail fetch which still returns full fields).
  const currentSongId = currentSong?.id ?? null;
  const currentSongNeedsLyrics =
    !!currentSong &&
    (currentSong as any).lyrics == null &&
    (currentSong as any).syncedLyrics == null;
  const { data: fullCurrent } = useQuery<Song>({
    queryKey: ["/api/songs", currentSongId],
    enabled: !!currentSongId && currentSongNeedsLyrics,
  });
  useEffect(() => {
    if (!fullCurrent || !currentSongId || fullCurrent.id !== currentSongId) return;
    setQueue((q) => {
      const i = q.findIndex((s) => s.id === currentSongId);
      if (i < 0) return q;
      const cur = q[i];
      if ((cur as any).lyrics != null || (cur as any).syncedLyrics != null) return q;
      const next = q.slice();
      next[i] = {
        ...cur,
        lyrics: (fullCurrent as any).lyrics ?? cur.lyrics,
        syncedLyrics: (fullCurrent as any).syncedLyrics ?? cur.syncedLyrics,
        waveform: (fullCurrent as any).waveform ?? (cur as any).waveform,
      };
      return next;
    });
  }, [fullCurrent, currentSongId]);

  // Fan playback is Mux-only — "real audio" means the master is Mux-ready
  // and has a playback id we can sign. Songs with only a raw `audioUrl`
  // (legacy / not-yet-ingested) are not playable by fans; they fall back
  // to the simulated-timer path so the UI still ticks instead of stalling.
  const hasRealAudio =
    !!currentSong?.muxPlaybackId && currentSong?.muxStatus === "ready";
  const duration = (hasRealAudio && audioDuration != null && audioDuration > 0)
    ? audioDuration
    : (currentSong?.duration ?? 0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Simulated playback timer (only used when the song has no real audioUrl)
  const startTimer = useCallback(() => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration - 1) return prev;
        return prev + 1;
      });
    }, 1000);
  }, [clearTimer, duration]);

  useEffect(() => {
    if (hasRealAudio) {
      // Real audio drives currentTime via timeupdate; no simulated timer.
      clearTimer();
      return;
    }
    if (isPlaying) startTimer();
    else clearTimer();
    return clearTimer;
  }, [isPlaying, startTimer, clearTimer, hasRealAudio]);

  // Simulated-track end → next (only when not using real audio; real audio uses 'ended' event)
  useEffect(() => {
    if (hasRealAudio) return;
    if (currentTime >= duration && duration > 0 && isPlaying) {
      // Force-mark complete before advancing so this isn't classified as a skip.
      milestonesRef.current.completed = true;
      handleNext(false);
    }
  }, [currentTime, duration, hasRealAudio]);

  // Keep live refs so audio-event callbacks (which close over the initial
  // render) can always read the latest values without stale-closure bugs.
  const currentSongRef = useRef<PlayerSong | null>(null);
  // One-shot target (seconds) for the initial seek into a preview window. Set
  // when a song attaches under previewMode; consumed by the loadedmetadata
  // handler once the media is seekable, then cleared. Covers hls.js + native
  // HLS + offline blobs (all fire loadedmetadata) and re-arms on every
  // preview song-change because the attach effect re-runs per currentSong.id.
  const previewSeekTargetRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Reset per-play analytics milestones whenever the current song changes.
  useEffect(() => {
    resetMilestones(currentSong?.id ?? null);
  }, [currentSong?.id, resetMilestones]);

  // Begin a new analytics play instance: reset milestones and emit play_start.
  // Called from playSong (initial play of any song, including replay of the
  // currently-playing one), repeat-one restart, and the simulated playback path.
  const beginPlayInstance = useCallback((song: PlayerSong, simulated: boolean) => {
    resetMilestones(song.id);
    milestonesRef.current.started = true;
    track("play_start", { ...songMeta(song), simulated: simulated || undefined });
  }, [resetMilestones, songMeta]);

  // Fire play_30s and play_complete based on currentTime / duration milestones.
  useEffect(() => {
    const m = milestonesRef.current;
    const song = currentSongRef.current;
    if (!song) return;
    if (!m.hit30 && currentTime >= 30) {
      m.hit30 = true;
      track("play_30s", { ...songMeta(song), at: currentTime, duration });
    }
    if (!m.completed && duration > 0 && currentTime >= duration * 0.9) {
      m.completed = true;
      track("play_complete", { ...songMeta(song), at: currentTime, duration });
    }
  }, [currentTime, duration, songMeta]);

  // userInitiated=false is used by the natural-end paths (audio 'ended'
  // event + simulated end-of-track effect). Auto-advance never counts as a skip.
  const handleNext = useCallback((userInitiated: boolean = true) => {
    const m = milestonesRef.current;
    const song = currentSongRef.current;
    const ct = currentTimeRef.current;
    const dur = durationRef.current;
    if (userInitiated && song && !m.completed && ct < 30) {
      track("play_skip", { ...songMeta(song), at: ct, duration: dur, direction: "next" });
    }
    if (repeat === "one") {
      if (song) beginPlayInstance(song, !song.audioUrl);
      setCurrentTime(0);
      const a = audioRef.current;
      if (a && hasRealAudio) { a.currentTime = 0; a.play().catch(() => {}); }
      return;
    }
    if (shuffle && queue.length > 1) {
      let next = Math.floor(Math.random() * queue.length);
      while (next === currentIndex) next = Math.floor(Math.random() * queue.length);
      setCurrentIndex(next);
      setCurrentTime(0);
    } else if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setCurrentTime(0);
    } else if (repeat === "all") {
      setCurrentIndex(0);
      setCurrentTime(0);
    } else {
      setIsPlaying(false);
    }
  }, [currentIndex, queue.length, repeat, shuffle, hasRealAudio, songMeta, beginPlayInstance]);

  // Preview-mode cap. When the host flips on previewMode (desktop
  // Preview & Purchase route), playback auto-advances at 30s per track
  // instead of running through full songs. We mark the milestone as
  // completed so handleNext doesn't classify the cut as a skip, then
  // delegate to the natural advance path so shuffle/repeat/end-of-queue
  // behave the same as a real song ending.
  useEffect(() => {
    if (!previewMode) return;
    if (!isPlaying) return;
    if (currentTime < previewEndSec) return;
    milestonesRef.current.completed = true;
    const a = audioRef.current;
    if (a && hasRealAudio) {
      try { a.pause(); } catch {}
    }
    handleNext(false);
  }, [previewMode, isPlaying, currentTime, previewEndSec, hasRealAudio, handleNext]);

  // Exiting preview mode while paused at the cap shouldn't trap the
  // dock at 30s — leave currentTime where it is so the song resumes
  // from there (host typically stops playback on toggle-off anyway).
  const setPreviewMode = useCallback((on: boolean) => {
    setPreviewModeState(on);
  }, []);

  const setVolume = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const handlePrev = useCallback(() => {
    const ct = currentTimeRef.current;
    const dur = durationRef.current;
    const m = milestonesRef.current;
    const song = currentSongRef.current;
    // Apple behavior: prev with currentTime > 3 restarts the same song (no skip).
    if (ct > 3) {
      setCurrentTime(0);
      const a = audioRef.current;
      if (a && hasRealAudio) a.currentTime = 0;
      return;
    }
    // Only count as a skip when we're actually leaving the current track.
    if (currentIndex > 0) {
      if (song && !m.completed && ct < 30) {
        track("play_skip", { ...songMeta(song), at: ct, duration: dur, direction: "prev" });
      }
      setCurrentIndex((i) => i - 1);
      setCurrentTime(0);
    } else {
      // At start of queue with currentTime <= 3 — just restart, no skip.
      setCurrentTime(0);
      const a = audioRef.current;
      if (a && hasRealAudio) a.currentTime = 0;
    }
  }, [currentIndex, hasRealAudio, songMeta]);

  // Track the active hls.js instance so we can tear it down on song change
  // (otherwise repeated mounts leak `MediaSource` listeners + buffers).
  const hlsRef = useRef<Hls | null>(null);
  // Holds the in-memory blob: URL for a decrypted offline download so we can
  // revoke it when the track changes or the player unmounts (Task #1664).
  const offlineBlobRef = useRef<string | null>(null);
  const revokeOfflineBlob = () => {
    if (offlineBlobRef.current) {
      try { URL.revokeObjectURL(offlineBlobRef.current); } catch {}
      offlineBlobRef.current = null;
    }
  };
  // Race-token: a counter bumped on every src resolution. If a slower
  // Mux signed-URL fetch resolves AFTER the user has already skipped
  // to another song, we drop the stale result instead of clobbering
  // the now-current song's src.
  const srcTokenRef = useRef(0);
  // Mirror `isPlaying` into a ref so the source-resolution effect can peek
  // at the latest value WITHOUT being re-run on every play/pause toggle.
  // Re-running the effect on isPlaying caused (a) extra Mux URL signings on
  // every pause/resume and (b) currentTime resetting to 0 — i.e. the song
  // restarted whenever the user tapped pause then play. Play/pause is now
  // handled by a separate, lightweight effect (below) that only calls
  // audio.play() / audio.pause() on the already-attached source.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Resolve and attach the audio source. Deps deliberately exclude
  // `isPlaying` — see comment on isPlayingRef above.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    // Arm the one-shot preview seek for this attach. When the host is in
    // preview mode and this song has a placed start, the loadedmetadata
    // handler will jump straight to the chorus instead of playing the intro.
    previewSeekTargetRef.current =
      previewMode && previewStartSec > 0.05 ? previewStartSec : null;

    const teardownHls = () => {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
    };

    const song = currentSong;
    const token = ++srcTokenRef.current;

    const attachSrc = (url: string) => {
      // Stale resolution — user already moved on to another song.
      if (srcTokenRef.current !== token) return;
      teardownHls();
      const isHls = /\.m3u8(\?|$)/i.test(url);
      if (isHls && Hls.isSupported() && !a.canPlayType("application/vnd.apple.mpegurl")) {
        // Chrome / Firefox / non-Safari: use hls.js to drive MSE.
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) {
            console.error("[player] hls fatal", data.type, data.details);
            setIsPlaying(false);
          }
        });
        // Defer play() until MANIFEST_PARSED — calling play() immediately
        // after attachMedia() fires before MSE has any buffered data.
        // The call resolves silently (no rejection) while hls.js loads the
        // manifest in the background, leaving the dock in a phantom
        // "playing" state with no audio. Waiting for MANIFEST_PARSED
        // guarantees the source is ready before play() is invoked.
        // The srcTokenRef guard handles the race where the user skips to
        // another song before the manifest fetch completes.
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (isPlayingRef.current && srcTokenRef.current === token) {
            a.play().catch(() => setIsPlaying(false));
          }
        });
        hls.loadSource(url);
        hls.attachMedia(a);
      } else {
        // Native HLS (Safari/iOS), progressive (wav/mp3), or a decrypted
        // offline `blob:` URL — direct src assignment. play() is safe to call
        // immediately (the browser begins actual output once enough data is
        // buffered).
        a.src = url;
        // iOS WebKit quirk — the missing half of the autoplay-unlock fix.
        // ensureAudioUnlocked() blesses the element with a gesture-bound
        // silent-clip play(), and the restore() carefully avoids
        // removeAttribute+load() so the bless survives until we swap in the
        // real source here. But calling HTMLMediaElement.load() ALSO re-locks
        // the element on iOS WebKit: it drops the gesture activation, so the
        // real play() below — which fires from this async attach, OUTSIDE the
        // original tap — is autoplay-blocked and the fan hears nothing (the
        // anon-preview "flips to playing, no sound" bug on iPhone Safari AND
        // Chrome; both are WebKit). This is the same quirk howler.js works
        // around by never calling load() after the unlock. Assigning a.src
        // already invokes the media-element load algorithm, so the explicit
        // load() is redundant — skipping it on iOS web preserves the bless so
        // the deferred play() is permitted on the FIRST tap. Desktop Safari
        // (already working, leave it alone), Android (hls.js branch above),
        // and the native apps are untouched.
        if (!isWebIOS) a.load();
        if (isPlayingRef.current) {
          a.play().catch(() => setIsPlaying(false));
        }
      }
      setAudioDuration(null);
      setCurrentTime(0);
    };

    // Mux-only streaming path (the default for everything not downloaded).
    const resolveStream = () => {
      if (!song || !song.muxPlaybackId || song.muxStatus !== "ready") {
        // No streamable master for this song (Mux not ingested yet, or
        // preparing, or errored) — pause and clear any in-flight source.
        // Fan playback is Mux-only; we never attach a raw audioUrl from
        // the fan player (see comment in the Mux branch below). If a
        // master exists but just isn't Mux-ready, also flip play state
        // off so the UI doesn't sit in a phantom "playing" state with no
        // audio — the dock + Mux banner + per-track pill surface why.
        if (srcTokenRef.current !== token) return;
        a.pause();
        teardownHls();
        if (a.src) {
          a.removeAttribute("src");
          a.load();
        }
        setAudioDuration(null);
        const hasMasterButNotReady =
          !!song && (!!song.audioUrl || !!song.muxAssetId || !!song.muxStatus);
        if (hasMasterButNotReady) setIsPlaying(false);
        return;
      }
      // Async: fetch a signed 1-hour HLS URL, then attach.
      // Task #364 — no raw `audioUrl` fallback in the fan player. The
      // raw master is admin-only (legal + bandwidth); falling back to
      // it would let any signed-in fan grab the unprotected file the
      // moment Mux signing hiccuped. If the signed URL fetch fails the
      // player just stops — the AdminAlbum row + Mux banner will show
      // the operator why, and a successful retry will flip
      // `muxStatus === "ready"` and re-enter this branch.
      (async () => {
        try {
          // Forward the campaign share token (`?k=`) so an anonymous
          // pre-launch preview visitor can mint a signed 30s URL. The token —
          // not the song id — is the capability the server checks; a signed-in
          // fan ignores it entirely (ownership decides access server-side).
          const campaignToken =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("k")
              : null;
          const r = await apiRequest(
            "POST",
            `/api/songs/${song.id}/playback-url`,
            campaignToken ? { k: campaignToken } : undefined,
          );
          const json = await r.json();
          if (srcTokenRef.current !== token) return;
          if (json?.url) attachSrc(json.url);
          else throw new Error(json?.message || "no url");
        } catch (e) {
          if (srcTokenRef.current !== token) return;
          console.warn("[player] Mux signed URL fetch failed — refusing raw fallback", e);
          setIsPlaying(false);
        }
      })();
    };

    if (!song) {
      resolveStream();
      return;
    }

    // Offline-first on NATIVE: a track the fan has downloaded plays from its
    // on-device, encrypted file — decrypted in-memory to a short-lived
    // `blob:` URL (Task #1664). This is the ONLY fan-player path that uses a
    // local master, and it's reachable only when (a) we're native and (b) a
    // real, entitled download exists for this song; everything else stays
    // Mux-only. `offlineSrcFor` returns null on web and when no file exists,
    // so this is a true no-op in the browser and we fall through to Mux.
    if (isNative) {
      (async () => {
        let local: string | null = null;
        try {
          local = await offlineSrcFor(song.id, song.audioUrl ?? undefined);
        } catch {
          local = null;
        }
        if (srcTokenRef.current !== token) {
          if (local) { try { URL.revokeObjectURL(local); } catch {} }
          return;
        }
        if (local) {
          revokeOfflineBlob();
          offlineBlobRef.current = local;
          attachSrc(local);
        } else {
          resolveStream();
        }
      })();
      return;
    }

    resolveStream();
  }, [currentSong?.id, currentSong?.muxPlaybackId, currentSong?.muxStatus]);

  // Play/pause toggle — operates on the already-attached source without
  // re-fetching or re-loading. Keeps tap-pause-tap-play seamless.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    // A lingering silent-bless clip (data:audio/wav, left attached by
    // ensureAudioUnlocked's restore to preserve the WebKit gesture activation)
    // is NOT a real source — treat it as "nothing attached yet" so this effect
    // never resumes the silent clip before resolveStream swaps in the real
    // Mux/offline src.
    const hasAttachedSrc =
      (!!a.src && !a.src.startsWith("data:audio/wav")) || !!hlsRef.current;
    if (!hasAttachedSrc) return;
    if (isPlaying) {
      a.play().catch(() => setIsPlaying(false));
    } else {
      a.pause();
    }
  }, [isPlaying]);

  // Tear down hls.js + any decrypted offline blob URL on unmount.
  useEffect(() => () => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }
    revokeOfflineBlob();
  }, []);

  // AirPlay availability — iOS Safari (and only iOS Safari) fires
  // `webkitplaybacktargetavailabilitychanged` on a media element whenever the
  // set of reachable AirPlay targets changes. event.availability is
  // "available" when at least one Apple TV / HomePod is nearby, "not-available"
  // otherwise. Feature-detect the picker method before subscribing so every
  // other platform (Android, desktop Chrome/Firefox, in-app webviews) simply
  // never flips `airPlayAvailable` true — the player button stays hidden with
  // no platform sniffing. The hidden <audio> already streams the signed Mux
  // HLS source, which iOS plays via native HLS and can route over AirPlay.
  useEffect(() => {
    const a = audioRef.current as any;
    if (!a) return;
    if (typeof a.webkitShowPlaybackTargetPicker !== "function") return;
    // On iOS Safari the picker method exists — mark AirPlay supported so the
    // player shows the output button permanently (Apple-Music behavior),
    // even before any wireless target becomes reachable.
    setAirPlaySupported(true);
    const onAvail = (e: any) => {
      setAirPlayAvailable(e?.availability === "available");
    };
    a.addEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
    return () => {
      a.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
    };
  }, []);

  const showAirPlayPicker = useCallback(() => {
    const a = audioRef.current as any;
    if (!a || typeof a.webkitShowPlaybackTargetPicker !== "function") return;
    try {
      a.webkitShowPlaybackTargetPicker();
    } catch {
      /* picker can throw if invoked without a user gesture — ignore */
    }
  }, []);

  // Wire audio element events once
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    // Keep fractional seconds so synced-lyric cues (which carry ms-precision
    // timestamps) light up on the right beat instead of drifting up to ~1s
    // late waiting for the next integer-second tick. Vimeo's player works
    // because it never floors video.currentTime; we shouldn't either.
    const onTime = () => setCurrentTime(a.currentTime);
    // Also push currentTime immediately after a seek so the lyrics overlay
    // jumps to the new line on tap instead of waiting for the next
    // timeupdate (which can be 100-250ms away).
    const onSeeked = () => setCurrentTime(a.currentTime);
    const onMeta = () => {
      if (Number.isFinite(a.duration)) setAudioDuration(Math.floor(a.duration));
      // Initial seek into the placed preview window, once the media reports a
      // finite duration (so the target is within the seekable range). One-shot:
      // cleared after the first seek so durationchange re-fires don't fight a
      // fan's manual scrub. iOS native HLS + hls.js both reach this.
      const target = previewSeekTargetRef.current;
      if (
        target != null &&
        Number.isFinite(a.duration) &&
        a.duration > target
      ) {
        try {
          a.currentTime = target;
        } catch {}
        previewSeekTargetRef.current = null;
      }
    };
    const onEnded = () => {
      // The gesture-bless silent WAV (data:audio/wav src, 0 audio bytes) fires
      // `ended` immediately after the in-gesture play() call in playSong on iOS
      // web. If the song queue is already set at that moment, handleNext() would
      // advance it past the track the user just tapped — producing no audio. Skip
      // the advancement for the silent bless clip; only react to a real source.
      if (a.src.startsWith("data:audio/wav")) return;
      milestonesRef.current.completed = true;
      handleNext(false);
    };
    const onError = () => {
      // Surface the actual MediaError so prod-side playback failures
      // stop being silent. Without this `<audio>` swallows the error
      // and the UI just flips back to paused with no signal — leaving
      // us to guess between "file 404", "wrong MIME", "decode failed",
      // "CORS blocked", or "network aborted". Logging code + message +
      // src is enough to identify all five from the browser console.
      const err = a.error;
      const song = currentSongRef.current;
      const codeMap: Record<number, string> = {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      };
      console.error("[player] audio error", {
        code: err?.code,
        name: err ? codeMap[err.code] || "UNKNOWN" : "no MediaError",
        message: err?.message || "(empty)",
        src: a.currentSrc || a.src,
        readyState: a.readyState,
        networkState: a.networkState,
        songId: song?.id,
        songTitle: song?.title,
      });
      setIsPlaying(false);
    };
    const onPlaying = () => {
      const m = milestonesRef.current;
      const song = currentSongRef.current;
      if (song && !m.started) {
        m.started = true;
        track("play_start", { ...songMeta(song), duration: Number.isFinite(a.duration) ? Math.floor(a.duration) : undefined });
      }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("seeked", onSeeked);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    a.addEventListener("playing", onPlaying);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("seeked", onSeeked);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      a.removeEventListener("playing", onPlaying);
    };
  }, [handleNext]);

  const playSong = useCallback((song: PlayerSong, newQueue?: PlayerSong[]) => {
    // Bless the audio element inside this user gesture (WebKit autoplay
    // unlock) BEFORE the async signed-URL fetch, so the deferred play() that
    // resolveStream issues is permitted on iOS/desktop Safari. No-ops once
    // unlocked, and harmless when called outside a gesture (autoplay/next).
    ensureAudioUnlocked();
    // iOS-web extra bless: ensureAudioUnlocked() is idempotent — it no-ops
    // once audioUnlockedRef.current is true (set after the first successful
    // play() in a touchend listener fires before this click handler). On iOS
    // WebKit the existing bless can be silently reset by the media-element
    // load algorithm when attachSrc later assigns `a.src = muxUrl` (even
    // without an explicit a.load()). Re-issuing play() HERE — inside the
    // synchronous click/tap handler — gives a FRESH gesture-bound bless that
    // is at most as old as this tap, not an earlier touchend. The deferred
    // a.play() in attachSrc (after the async Mux URL fetch) then succeeds on
    // the first tap. Only applies when no real Mux/offline source is already
    // attached; the `hasRealSrc` branch of ensureAudioUnlocked already covers
    // the resume case (real src present → play() called in-gesture above).
    if (isWebIOS) {
      const _a = audioRef.current;
      if (_a && (!_a.src || _a.src.startsWith("data:audio/wav"))) {
        const SILENT_WAV =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        if (!_a.src) _a.src = SILENT_WAV;
        try { _a.play().catch(() => {}); } catch { /* best-effort */ }
      }
    }
    // Hydrate every song in the incoming queue against the DB so GoodSync
    // cues + real audioUrl + canonical lyrics light up regardless of which
    // surface assembled the queue (album page, artist page, Songs tab,
    // playlists, ⋯-menu).
    const hydratedSong = hydrate(song);
    // Task #734 — stream-elsewhere tracks (credits-bearing songs GoodTunes
    // does NOT host) must never enter the player. They carry no master, so
    // there is nothing to play in-app; the fan reaches them via the
    // "Stream this" handoff on the album surface instead. Guard here so any
    // surface that accidentally queues one (⋯-menu, shuffle, autoplay)
    // simply no-ops rather than starting a silent/forever-loading instance.
    if ((hydratedSong as any).streamOnly) return;
    const rawQueue = (newQueue ?? [song]).filter((s) => !(hydrate(s) as any).streamOnly);
    const q = rawQueue.map(hydrate);
    const idx = q.findIndex((s) => s.id === hydratedSong.id);
    setQueue(q);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setCurrentTime(0);
    setAudioDuration(null);
    setIsPlaying(true);
    // Always begin a new play instance — covers replays of the currently-
    // playing song where currentSong.id wouldn't change. For real audio the
    // 'playing' event would also try to fire play_start, but the `started`
    // flag set here keeps it idempotent.
    beginPlayInstance(hydratedSong, !hydratedSong.audioUrl);
    // Apple Music behavior: tapping a song updates the mini-player only.
    // The full Now Playing sheet opens only when the user taps the mini-player.
    setShowLyrics(false);
    setShowAddToPlaylist(false);
    // Task #530 — stamp every play into fan_recents so the Recents
    // tab reflects "anything opened or played", not just navigations
    // into AlbumDetail / ArtistDetail / InstrumentDetail. We POST
    // directly (the hook can't be used here — PlayerContext sits above
    // any auth provider that uses it). Session cookie carries the
    // identity; anonymous calls 401 and we silently ignore.
    // Task #782 — this fan_recents row is also the source of truth for
    // the Collection "Recently Played" rail (no more in-memory list), so
    // we invalidate the recents query on success to surface the played
    // album at the front of the rail immediately, without a reload.
    const album = hydratedSong.album;
    fetch("/api/me/recents", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityKind: "song",
        entityId: hydratedSong.id,
        title: hydratedSong.title,
        subtitle: album?.artist ?? null,
        thumbUrl: album?.artwork ?? null,
        href: album?.id ? `/album/${album.id}` : "/collection",
      }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/recents"] }))
      .catch(() => { /* fire-and-forget */ });
  }, [hydrate, beginPlayInstance, queryClient, ensureAudioUnlocked]);

  // Jump to an existing queue entry by index and start it. Backs the CarPlay /
  // Android Auto browse list — the head-unit sends the index of the tapped row
  // and we re-point currentIndex at it (no re-hydration; the queue is already
  // hydrated). Guarded so an out-of-range index from a stale car snapshot no-ops.
  const playQueueIndex = useCallback((index: number) => {
    ensureAudioUnlocked();
    setQueue((q) => {
      if (index < 0 || index >= q.length) return q;
      const song = q[index];
      setCurrentIndex(index);
      setCurrentTime(0);
      setAudioDuration(null);
      setIsPlaying(true);
      beginPlayInstance(song, !song.audioUrl);
      return q;
    });
  }, [beginPlayInstance, ensureAudioUnlocked]);

  const togglePlay = useCallback(() => {
    // Bless the element on the resume tap too (WebKit autoplay unlock).
    ensureAudioUnlocked();
    setIsPlaying((p) => {
      const next = !p;
      const song = currentSongRef.current;
      if (song) {
        // Only fire pause/resume when a song is actually loaded — toggling
        // play with no queue is a no-op visually and shouldn't show up
        // in the funnel.
        track(next ? "play_resume" : "play_pause", {
          ...songMeta(song),
          at: currentTimeRef.current,
        });
      }
      return next;
    });
  }, [songMeta, ensureAudioUnlocked]);
  const seekTo = useCallback((time: number) => {
    let clamped = Math.max(0, Math.min(time, duration));
    // Store-compliance hard guard: in preview mode EVERY seek (including any
    // future fan surface) is clamped into the placed window, so a fan can never
    // reach audio outside the <=30s preview even if a call site forgets to clamp.
    if (previewMode) {
      const hi = Math.max(previewStartSec, previewEndSec - 0.1);
      clamped = Math.min(Math.max(clamped, previewStartSec), hi);
    }
    const song = currentSongRef.current;
    if (song) track("play_seek", { ...songMeta(song), from: currentTime, to: clamped, duration });
    setCurrentTime(clamped);
    const a = audioRef.current;
    if (a && hasRealAudio) a.currentTime = clamped;
  }, [duration, hasRealAudio, currentTime, songMeta, previewMode, previewStartSec, previewEndSec]);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const toggleRepeat = useCallback(() => {
    setRepeat((r) => (r === "none" ? "all" : r === "all" ? "one" : "none"));
  }, []);

  // ── Lock-screen / Control Center / media-notification integration ────────
  //
  // Background audio + lock-screen transport (Task #162). Two layers:
  //   1. Web `navigator.mediaSession` — drives mobile-web/PWA now-playing AND,
  //      inside the Android Chromium System WebView, the media-style
  //      notification + background playback for the native Android app. Gated
  //      OFF on native iOS so the native plugin (below) is the sole owner of
  //      the WKWebView lock-screen info (WKWebView's own MediaSession would
  //      otherwise fight MPNowPlayingInfoCenter).
  //   2. Native `NowPlaying` plugin — iOS only; sets AVAudioSession `.playback`
  //      (keeps audio alive when locked/backgrounded), populates the lock
  //      screen with artwork/metadata/position, and forwards MPRemoteCommand
  //      transport back here. No-op on Android/web (plugin absent).
  //
  // Latest control callbacks are read through a ref so the OS action handlers
  // register once and never go stale, without re-subscribing on every render.
  const mediaControlsRef = useRef({
    togglePlay,
    next: handleNext,
    prev: handlePrev,
    seekTo,
    playQueueIndex,
  });
  useEffect(() => {
    mediaControlsRef.current = {
      togglePlay,
      next: handleNext,
      prev: handlePrev,
      seekTo,
      playQueueIndex,
    };
  }, [togglePlay, handleNext, handlePrev, seekTo, playQueueIndex]);

  // Publish current-track metadata to the OS (song change only).
  useEffect(() => {
    const song = currentSong;
    const ms: any =
      typeof navigator !== "undefined" ? (navigator as any).mediaSession : undefined;

    if (!song) {
      if (ms) {
        try {
          ms.metadata = null;
        } catch {}
      }
      clearNowPlaying();
      return;
    }

    const title = song.title ?? "";
    const artist = song.album?.artist ?? "";
    const albumTitle = song.album?.title ?? "";
    // Album artwork is stored as an app-relative path (e.g. "/objects/uploads/x"
    // or "/figmaAssets/x"). The web MediaSession resolves relative URLs against
    // the page origin, but the native iOS plugin fetches the image with a native
    // URLSession *outside* the WebView, where `URL(string: "/objects/…")` has no
    // host and the fetch silently fails (no lock-screen art). Absolutize against
    // the WebView origin (the live remote host on native) so both paths get a
    // fetchable URL; already-absolute URLs pass through unchanged.
    const artwork = absolutizeArtwork(song.album?.artwork ?? undefined);

    // Web MediaSession — skip on native iOS (native plugin owns the lock screen).
    if (ms && !isNativeIOS && typeof (window as any)?.MediaMetadata === "function") {
      try {
        ms.metadata = new (window as any).MediaMetadata({
          title,
          artist,
          album: albumTitle,
          artwork: artwork
            ? [96, 128, 192, 256, 384, 512].map((sz) => ({
                src: artwork,
                sizes: `${sz}x${sz}`,
                type: "image/jpeg",
              }))
            : [],
        });
      } catch {}
    }

    // Native iOS lock screen.
    setNowPlayingMetadata({ title, artist, album: albumTitle, artworkUrl: artwork, duration });
    // duration is intentionally excluded from deps — the position effect below
    // republishes it once loadedmetadata resolves the real length.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentSong?.id,
    currentSong?.title,
    currentSong?.album?.artist,
    currentSong?.album?.title,
    currentSong?.album?.artwork,
  ]);

  // Keep the web MediaSession playback-state + scrubber position live. Cheap
  // (in-process), so it runs on every currentTime tick.
  useEffect(() => {
    const ms: any =
      typeof navigator !== "undefined" ? (navigator as any).mediaSession : undefined;
    if (!ms || isNativeIOS) return;
    try {
      ms.playbackState = isPlaying ? "playing" : "paused";
    } catch {}
    if (
      typeof ms.setPositionState === "function" &&
      Number.isFinite(duration) &&
      duration > 0
    ) {
      try {
        ms.setPositionState({
          duration,
          position: Math.min(Math.max(currentTime, 0), duration),
          playbackRate: 1,
        });
      } catch {}
    }
  }, [isPlaying, currentTime, duration]);

  // Mirror playback state + elapsed position to the native lock screen. The
  // JS↔native bridge is chattier than an in-process call, so throttle the
  // currentTime pushes to whole-second granularity while still reacting
  // immediately to play/pause, duration, and song changes.
  const nativeSyncRef = useRef({ sec: -1, playing: false, dur: 0, id: "" });
  useEffect(() => {
    const st = nativeSyncRef.current;
    const sec = Math.floor(currentTime);
    const id = currentSong?.id ?? "";
    if (st.sec === sec && st.playing === isPlaying && st.dur === duration && st.id === id) {
      return;
    }
    nativeSyncRef.current = { sec, playing: isPlaying, dur: duration, id };
    setNowPlayingPlaybackState({ isPlaying, elapsed: currentTime, duration });
  }, [isPlaying, currentTime, duration, currentSong?.id]);

  // Mirror the Up Next queue to the native plugin so CarPlay / Android Auto can
  // render a browsable list. Only the head-unit (CarPlay scene / Android Auto
  // MediaBrowserService) consumes this — the phone lock screen ignores it — so
  // it is a no-op off-native. Re-published whenever the queue contents or the
  // now-playing row change; the bridge itself short-circuits when unavailable.
  useEffect(() => {
    setNowPlayingQueue(
      queue.map((s) => ({
        id: s.id,
        title: s.title ?? "",
        artist: s.album?.artist ?? "",
        artworkUrl: s.album?.artwork ?? undefined,
      })),
      currentIndex,
    );
  }, [queue, currentIndex]);

  // Register OS transport action handlers ONCE. All handlers dispatch through
  // mediaControlsRef so they always call the latest player callbacks.
  useEffect(() => {
    // Web MediaSession action handlers (Android WebView + mobile web/PWA).
    const ms: any =
      typeof navigator !== "undefined" ? (navigator as any).mediaSession : undefined;
    const wiredWeb = ms && !isNativeIOS && typeof ms.setActionHandler === "function";
    if (wiredWeb) {
      const set = (action: string, fn: ((d?: any) => void) | null) => {
        try {
          (ms as any).setActionHandler(action, fn);
        } catch {}
      };
      set("play", () => {
        if (!isPlayingRef.current) mediaControlsRef.current.togglePlay();
      });
      set("pause", () => {
        if (isPlayingRef.current) mediaControlsRef.current.togglePlay();
      });
      set("previoustrack", () => mediaControlsRef.current.prev());
      set("nexttrack", () => mediaControlsRef.current.next());
      set("seekto", (d?: any) => {
        if (d && typeof d.seekTime === "number") mediaControlsRef.current.seekTo(d.seekTime);
      });
      set("seekbackward", (d?: any) => {
        const off = d && typeof d.seekOffset === "number" ? d.seekOffset : 10;
        mediaControlsRef.current.seekTo(Math.max(0, currentTimeRef.current - off));
      });
      set("seekforward", (d?: any) => {
        const off = d && typeof d.seekOffset === "number" ? d.seekOffset : 10;
        mediaControlsRef.current.seekTo(currentTimeRef.current + off);
      });
    }

    // Native iOS remote commands (MPRemoteCommandCenter → here).
    const unsubscribeNative = onNowPlayingRemoteCommand((cmd) => {
      const c = mediaControlsRef.current;
      switch (cmd.action) {
        case "play":
          if (!isPlayingRef.current) c.togglePlay();
          break;
        case "pause":
        case "stop":
          if (isPlayingRef.current) c.togglePlay();
          break;
        case "toggle":
          c.togglePlay();
          break;
        case "next":
          c.next();
          break;
        case "prev":
          c.prev();
          break;
        case "seek":
          if (typeof cmd.value === "number") c.seekTo(cmd.value);
          break;
        case "playIndex":
          if (typeof cmd.value === "number") c.playQueueIndex(cmd.value);
          break;
      }
    });

    return () => {
      if (wiredWeb) {
        const clear = (action: string) => {
          try {
            (ms as any).setActionHandler(action, null);
          } catch {}
        };
        [
          "play",
          "pause",
          "previoustrack",
          "nexttrack",
          "seekto",
          "seekbackward",
          "seekforward",
        ].forEach(clear);
      }
      unsubscribeNative();
    };
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    const wasFav = favSongs.has(songId);
    favSongs.toggle(songId);
    track(wasFav ? "unfavorite_song" : "favorite_song", { songId });
  }, [favSongs]);

  const isFavorite = useCallback((songId: string) => favSongs.has(songId), [favSongs]);

  const addToQueue = useCallback((song: PlayerSong) => {
    const h = hydrate(song);
    // Task #734 — never queue a stream-elsewhere track; it has no master.
    if ((h as any).streamOnly) return;
    setQueue((q) => [...q, h]);
  }, [hydrate]);

  // Insert a song immediately after the currently-playing track (Apple's "Play Next").
  // If nothing is playing, start it now so the action isn't silently a no-op.
  const playNext = useCallback((song: PlayerSong) => {
    const h = hydrate(song);
    // Task #734 — stream-elsewhere tracks never enter the player queue.
    if ((h as any).streamOnly) return;
    setQueue((q) => {
      if (q.length === 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return [h];
      }
      const next = q.slice();
      next.splice(currentIndex + 1, 0, h);
      return next;
    });
  }, [currentIndex, hydrate]);

  // Append to the end of the queue (Apple's "Play Last" / "Play After").
  // Same fallback: start playback if there's nothing in the queue yet.
  const playLast = useCallback((song: PlayerSong) => {
    const h = hydrate(song);
    // Task #734 — stream-elsewhere tracks never enter the player queue.
    if ((h as any).streamOnly) return;
    setQueue((q) => {
      if (q.length === 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return [h];
      }
      return [...q, h];
    });
  }, [hydrate]);

  const toggleAutoplay = useCallback(() => setAutoplay((a) => !a), []);

  // Lyrics + Up Next share the single desktop right rail and are mutually
  // exclusive — opening one closes the other (same pattern the full-screen
  // Now Playing overlay uses), and re-tapping the open mode closes the rail.
  const toggleRail = useCallback((mode: "lyrics" | "queue") => {
    if (mode === "lyrics") {
      setShowQueue(false);
      setShowLyrics((v) => !v);
    } else {
      setShowLyrics(false);
      setShowQueue((v) => !v);
    }
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    setQueue((q) => {
      if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return q;
      const next = q.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      // Keep currentIndex pointing to the same logical song
      setCurrentIndex((idx) => {
        if (idx === from) return to;
        if (from < idx && to >= idx) return idx - 1;
        if (from > idx && to <= idx) return idx + 1;
        return idx;
      });
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((q) => {
      if (index <= currentIndex || index >= q.length) return q; // never drop the current song
      const next = q.slice();
      next.splice(index, 1);
      return next;
    });
  }, [currentIndex]);

  return (
    <PlayerContext.Provider
      value={{
        queue,
        currentIndex,
        currentSong,
        isPlaying,
        currentTime,
        duration,
        shuffle,
        repeat,
        showLyrics,
        showPlayer,
        showAddToPlaylist,
        showQueue,
        autoplay,
        favorites,
        playSong,
        togglePlay,
        next: handleNext,
        prev: handlePrev,
        seekTo,
        toggleShuffle,
        toggleRepeat,
        setShowLyrics,
        setShowPlayer,
        setShowAddToPlaylist,
        setShowQueue,
        toggleRail,
        toggleAutoplay,
        reorderQueue,
        removeFromQueue,
        toggleFavorite,
        isFavorite,
        addToQueue,
        playNext,
        playLast,
        playQueueIndex,
        previewMode,
        previewStartSec,
        previewEndSec,
        previewWindowSec,
        setPreviewMode,
        trulyOwnedAlbumIds,
        volume,
        muted,
        setVolume,
        toggleMute,
        airPlayAvailable,
        airPlaySupported,
        showAirPlayPicker,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
