import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Song, Album, getSongById } from "@/data/musicData";
import { useFavoriteSongs } from "@/hooks/useFavorites";

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

  const currentSong = queue[currentIndex] ?? null;
  const duration = currentSong?.duration ?? 0;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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
    if (isPlaying) {
      startTimer();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isPlaying, startTimer, clearTimer]);

  useEffect(() => {
    if (currentTime >= duration && duration > 0 && isPlaying) {
      handleNext();
    }
  }, [currentTime, duration]);

  const handleNext = useCallback(() => {
    if (repeat === "one") {
      setCurrentTime(0);
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
  }, [currentIndex, queue.length, repeat, shuffle]);

  const handlePrev = useCallback(() => {
    if (currentTime > 3) {
      setCurrentTime(0);
      return;
    }
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setCurrentTime(0);
    } else {
      setCurrentTime(0);
    }
  }, [currentIndex, currentTime]);

  const playSong = useCallback((song: PlayerSong, newQueue?: PlayerSong[]) => {
    const q = newQueue ?? [song];
    const idx = q.findIndex((s) => s.id === song.id);
    setQueue(q);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setCurrentTime(0);
    setIsPlaying(true);
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
  const seekTo = useCallback((time: number) => setCurrentTime(Math.max(0, Math.min(time, duration))), [duration]);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const toggleRepeat = useCallback(() => {
    setRepeat((r) => (r === "none" ? "all" : r === "all" ? "one" : "none"));
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    favSongs.toggle(songId);
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
