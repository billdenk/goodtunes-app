import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Song, Album, getSongById } from "@/data/musicData";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { track } from "@/lib/analytics";

export interface PlayerSong extends Song {
  album: Album;
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
  recentAlbums: Album[];
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
  toggleAutoplay: () => void;
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (index: number) => void;
  toggleFavorite: (songId: string) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: PlayerSong) => void;
  playNext: (song: PlayerSong) => void;
  playLast: (song: PlayerSong) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

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
  const favSongs = useFavoriteSongs();
  const favorites = favSongs.set;
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hidden HTMLAudioElement — never mounted to the DOM, so there's no UI change.
  // Used when the current song has a real audioUrl. Songs without an audioUrl
  // fall back to the simulated timer below (existing behavior).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (typeof window !== "undefined" && audioRef.current === null) {
    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;
  }

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
  const hasRealAudio = !!currentSong?.audioUrl;
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

  // Sync the hidden <audio> element with the current song + isPlaying state.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    if (!currentSong || !currentSong.audioUrl) {
      // No real audio for this song — pause and clear any in-flight source.
      a.pause();
      if (a.src) {
        a.removeAttribute("src");
        a.load();
      }
      setAudioDuration(null);
      return;
    }

    // Load new source if it changed.
    // NOTE: do NOT set crossOrigin — Dropbox shared-link CDNs don't send
    // Access-Control-Allow-Origin, so requesting CORS would fail the load.
    // We don't need pixel access to the audio, so leaving it unset is fine.
    if (a.src !== currentSong.audioUrl) {
      a.src = currentSong.audioUrl;
      setAudioDuration(null);
      setCurrentTime(0);
      a.load();
    }

    if (isPlaying) {
      a.play().catch(() => {
        // Autoplay was blocked or load failed — flip the UI state back.
        setIsPlaying(false);
      });
    } else {
      a.pause();
    }
  }, [currentSong?.id, currentSong?.audioUrl, isPlaying]);

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
    };
    const onEnded = () => {
      milestonesRef.current.completed = true;
      handleNext(false);
    };
    const onError = () => setIsPlaying(false);
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
    const q = newQueue ?? [song];
    const idx = q.findIndex((s) => s.id === song.id);
    setQueue(q);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setCurrentTime(0);
    setAudioDuration(null);
    setIsPlaying(true);
    // Always begin a new play instance — covers replays of the currently-
    // playing song where currentSong.id wouldn't change. For real audio the
    // 'playing' event would also try to fire play_start, but the `started`
    // flag set here keeps it idempotent.
    beginPlayInstance(song, !song.audioUrl);
    // Apple Music behavior: tapping a song updates the mini-player only.
    // The full Now Playing sheet opens only when the user taps the mini-player.
    setShowLyrics(false);
    setShowAddToPlaylist(false);
    setRecentAlbums((prev) => {
      const album = song.album;
      const filtered = prev.filter((a) => a.id !== album.id);
      return [album, ...filtered].slice(0, 8);
    });
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const seekTo = useCallback((time: number) => {
    const clamped = Math.max(0, Math.min(time, duration));
    const song = currentSongRef.current;
    if (song) track("seek", { ...songMeta(song), from: currentTime, to: clamped, duration });
    setCurrentTime(clamped);
    const a = audioRef.current;
    if (a && hasRealAudio) a.currentTime = clamped;
  }, [duration, hasRealAudio, currentTime, songMeta]);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const toggleRepeat = useCallback(() => {
    setRepeat((r) => (r === "none" ? "all" : r === "all" ? "one" : "none"));
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    const wasFav = favSongs.has(songId);
    favSongs.toggle(songId);
    track(wasFav ? "unfavorite" : "favorite", { songId });
  }, [favSongs]);

  const isFavorite = useCallback((songId: string) => favSongs.has(songId), [favSongs]);

  const addToQueue = useCallback((song: PlayerSong) => {
    setQueue((q) => [...q, song]);
  }, []);

  // Insert a song immediately after the currently-playing track (Apple's "Play Next").
  // If nothing is playing, start it now so the action isn't silently a no-op.
  const playNext = useCallback((song: PlayerSong) => {
    setQueue((q) => {
      if (q.length === 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return [song];
      }
      const next = q.slice();
      next.splice(currentIndex + 1, 0, song);
      return next;
    });
  }, [currentIndex]);

  // Append to the end of the queue (Apple's "Play Last" / "Play After").
  // Same fallback: start playback if there's nothing in the queue yet.
  const playLast = useCallback((song: PlayerSong) => {
    setQueue((q) => {
      if (q.length === 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return [song];
      }
      return [...q, song];
    });
  }, []);

  const toggleAutoplay = useCallback(() => setAutoplay((a) => !a), []);

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
        recentAlbums,
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
        toggleAutoplay,
        reorderQueue,
        removeFromQueue,
        toggleFavorite,
        isFavorite,
        addToQueue,
        playNext,
        playLast,
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
