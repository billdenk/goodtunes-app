import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { SONGS, ALBUMS, type Song, type Album } from "@/data/musicData";
import type { Song as DbSong, Album as DbAlbum } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useFavoriteSongs, useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";

const FAVORITES_PLAYLIST_ID = "__favorites";

interface Playlist {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  artworks?: string[];
  songCount?: number;
}

function PlaylistArtwork({
  artworks,
  songCount,
  size,
  rounded = "rounded-xl",
  variant,
}: {
  artworks: string[];
  songCount: number;
  size: number;
  rounded?: string;
  variant?: "favorites";
}) {
  const wrapperStyle: React.CSSProperties = {
    width: size,
    height: size,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  };

  if (variant === "favorites" && (songCount === 0 || artworks.length === 0)) {
    return (
      <div
        className={`${rounded} flex-shrink-0 flex items-center justify-center relative overflow-hidden`}
        style={{
          ...wrapperStyle,
          background: "linear-gradient(135deg, #FF5470 0%, #7F10A7 60%, #319ED8 100%)",
        }}
      >
        <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="white" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))" }}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </div>
    );
  }

  if (songCount === 0 || artworks.length === 0) {
    return (
      <div
        className={`${rounded} flex-shrink-0 flex items-center justify-center relative overflow-hidden`}
        style={{
          ...wrapperStyle,
          background: "linear-gradient(135deg, #1D5E8F 0%, #4A1E8F 100%)",
        }}
      >
        <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="white" opacity="0.85">
          <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
        </svg>
      </div>
    );
  }

  const tint = (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(135deg, rgba(49,158,216,0.10) 0%, rgba(127,16,167,0.10) 100%)",
      }}
    />
  );

  const unique = artworks.slice(0, 4);

  if (unique.length === 1) {
    return (
      <div className={`${rounded} flex-shrink-0 overflow-hidden relative`} style={wrapperStyle}>
        <img src={unique[0]} alt="" className="w-full h-full object-cover" />
        {tint}
      </div>
    );
  }

  if (unique.length === 2) {
    return (
      <div
        className={`${rounded} flex-shrink-0 overflow-hidden grid grid-cols-2 grid-rows-1 relative`}
        style={wrapperStyle}
      >
        {unique.map((src, i) => (
          <div key={i} className="w-full h-full flex items-center justify-center bg-[#00062B]">
            <img src={src} alt="" className="w-full h-full object-contain" />
          </div>
        ))}
        {tint}
      </div>
    );
  }

  if (unique.length === 3) {
    return (
      <div
        className={`${rounded} flex-shrink-0 overflow-hidden grid grid-cols-2 grid-rows-2 relative`}
        style={wrapperStyle}
      >
        {/* Large left tile fills the full height of the cover — square album art
            is cropped to fit the tall slot rather than letterboxed. */}
        <div className="w-full h-full row-span-2 overflow-hidden bg-[#00062B]">
          <img src={unique[0]} alt="" className="w-full h-full object-cover object-center" />
        </div>
        <div className="w-full h-full flex items-center justify-center bg-[#00062B]">
          <img src={unique[1]} alt="" className="w-full h-full object-contain" />
        </div>
        <div className="w-full h-full flex items-center justify-center bg-[#00062B]">
          <img src={unique[2]} alt="" className="w-full h-full object-contain" />
        </div>
        {tint}
      </div>
    );
  }

  return (
    <div
      className={`${rounded} flex-shrink-0 overflow-hidden grid grid-cols-2 grid-rows-2 relative`}
      style={wrapperStyle}
    >
      {unique.map((src, i) => (
        <div key={i} className="w-full h-full flex items-center justify-center bg-[#00062B]">
          <img src={src} alt="" className="w-full h-full object-contain" />
        </div>
      ))}
      {tint}
    </div>
  );
}

interface PlaylistSongEntry {
  id: string;
  song: Song & { album: Album };
}

export function Playlists() {
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const { playSong } = usePlayer();
  const queryClient = useQueryClient();
  const favSongs = useFavoriteSongs();
  const favArtists = useFavoriteArtists();
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const listScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(listScrollRef);
  useScrollHideNav(detailScrollRef);

  // Auto-open create dialog when arriving with ?create=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") {
      setShowCreate(true);
      window.history.replaceState({}, "", "/playlists");
    }
  }, [location]);

  const { data: playlistsRaw, isLoading } = useQuery<Playlist[] | null>({
    queryKey: ["/api/playlists"],
  });
  const userPlaylists = playlistsRaw ?? [];

  // DB-backed catalog for the Add Songs sheet — the local SONGS demo data has
  // hardcoded IDs that don't exist in the songs table, so POST /api/playlists/:id/songs
  // would fail the FK on song_id. Fetching the real catalog keeps adds reliable.
  const { data: dbSongs } = useQuery<DbSong[]>({ queryKey: ["/api/songs"] });
  const { data: dbAlbums } = useQuery<DbAlbum[]>({ queryKey: ["/api/albums"] });

  const dbAddCandidates = (() => {
    if (!dbSongs || !dbAlbums) return [] as Array<{ id: string; title: string; artist: string; artwork: string }>;
    const albumById = new Map(dbAlbums.map((a) => [a.id, a] as const));
    return dbSongs
      .map((s) => {
        const a = albumById.get(s.albumId);
        if (!a) return null;
        return { id: s.id, title: s.title, artist: a.artist, artwork: a.artwork };
      })
      .filter((x): x is { id: string; title: string; artist: string; artwork: string } => x !== null);
  })();

  const allSongsWithAlbumAll = SONGS
    .map((s) => ({ ...s, album: ALBUMS.find((a) => a.id === s.albumId)! }))
    .filter((s) => s.album);

  const { toast } = useToast();

  const favSongEntries: PlaylistSongEntry[] = (() => {
    const byId = new Map(allSongsWithAlbumAll.map((s) => [s.id, s] as const));
    const seen = new Set<string>();
    const out: PlaylistSongEntry[] = [];
    // Most-recent-first: newest favorited songs first, then newest favorited artists' songs
    const recentSongIds = [...favSongs.ordered].reverse();
    const recentArtists = [...favArtists.ordered].reverse();
    for (const id of recentSongIds) {
      const s = byId.get(id);
      if (s && !seen.has(s.id)) { seen.add(s.id); out.push({ id: `fav-${s.id}`, song: s }); }
    }
    for (const artist of recentArtists) {
      for (const s of allSongsWithAlbumAll) {
        if (s.album.artist === artist && !seen.has(s.id)) {
          seen.add(s.id);
          out.push({ id: `fav-${s.id}`, song: s });
        }
      }
    }
    return out;
  })();

  const isFavoritesView = selectedPlaylist?.id === FAVORITES_PLAYLIST_ID;

  const favoritesPlaylist: Playlist | null = favSongEntries.length > 0
    ? {
        id: FAVORITES_PLAYLIST_ID,
        name: "Favorites",
        userId: "__local",
        createdAt: "",
        artworks: Array.from(new Set(favSongEntries.map((e) => e.song.album.artwork))).slice(0, 4),
        songCount: favSongEntries.length,
      }
    : null;

  const playlists: Playlist[] = favoritesPlaylist
    ? [favoritesPlaylist, ...userPlaylists]
    : userPlaylists;

  // Deep-link: open a specific playlist via ?playlist=<id> (or ?playlist=__favorites).
  // Used by the "Go to Playlist" action on the add-to-playlist toast.
  // Depend on the joined id signature (not just length) so a same-count list
  // swap still triggers a re-match.
  const playlistIdsKey = playlists.map((p) => p.id).join(",");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("playlist");
    if (!target) return;
    const match = playlists.find((p) => p.id === target);
    if (match) {
      setSelectedPlaylist(match);
      window.history.replaceState({}, "", "/playlists");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, playlistIdsKey]);

  const { data: playlistSongsRaw } = useQuery<PlaylistSongEntry[] | null>({
    queryKey: ["/api/playlists", selectedPlaylist?.id, "songs"],
    enabled: !!selectedPlaylist && !isFavoritesView,
  });
  const playlistSongs: PlaylistSongEntry[] = isFavoritesView ? favSongEntries : (playlistSongsRaw ?? []);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/playlists", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      setShowCreate(false);
      setNewPlaylistName("");
      setCreateError("");
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/playlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      if (selectedPlaylist) setSelectedPlaylist(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PUT", `/api/playlists/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      setEditingPlaylist(null);
    },
  });

  const removeSongMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: string; songId: string }) => {
      await apiRequest("DELETE", `/api/playlists/${playlistId}/songs/${songId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", selectedPlaylist?.id, "songs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
    },
  });

  const addSongMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: string; songId: string }) => {
      const res = await apiRequest("POST", `/api/playlists/${playlistId}/songs`, { songId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", selectedPlaylist?.id, "songs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't add song",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const allSongsWithAlbum = allSongsWithAlbumAll;

  const addedSongIds = new Set(playlistSongs.map((ps) => ps.song.id));
  const addQuery = addSearch.trim().toLowerCase();
  const addCandidates = dbAddCandidates.filter((s) =>
    !addQuery || s.title.toLowerCase().includes(addQuery) || s.artist.toLowerCase().includes(addQuery),
  );

  const handlePlayPlaylist = () => {
    if (playlistSongs.length === 0) return;
    playSong(playlistSongs[0].song, playlistSongs.map((ps) => ps.song));
  };

  const handleShufflePlaylist = () => {
    if (playlistSongs.length === 0) return;
    const songs = playlistSongs.map((ps) => ps.song);
    const shuffled = [...songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playSong(shuffled[0], shuffled);
  };

  const closeDetail = () => {
    setSelectedPlaylist(null);
    queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
  };

  if (selectedPlaylist) {
    return (
      <main className="h-screen w-full flex justify-center overflow-hidden">
        <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
          <header className="flex items-center justify-between px-5 pt-14 pb-3 flex-shrink-0">
            <button type="button" onClick={closeDetail} className="w-9 h-9 rounded-full flex items-center justify-center text-white/80" style={{ background: "rgba(255,255,255,0.08)" }} data-testid="button-back-playlist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" />
              </svg>
            </button>
            {!isFavoritesView ? (
              <button
                type="button"
                onClick={() => { setEditingPlaylist(selectedPlaylist); setEditName(selectedPlaylist.name); }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
                style={{ background: "rgba(255,255,255,0.08)" }}
                data-testid="button-edit-playlist"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <div className="w-9 h-9" />
            )}
          </header>

          <div className="flex flex-col items-center px-5 pb-4 flex-shrink-0">
            <PlaylistArtwork
              artworks={Array.from(
                new Set(playlistSongs.map((ps) => ps.song.album.artwork))
              ).slice(0, 4)}
              songCount={playlistSongs.length}
              size={180}
              rounded="rounded-2xl"
              variant={isFavoritesView ? "favorites" : undefined}
            />
            <p className="text-white text-[22px] font-bold leading-tight text-center mt-4 px-4 truncate max-w-full" data-testid="text-playlist-name">
              {selectedPlaylist.name}
            </p>
            <p className="text-white/45 text-xs mt-1">
              {playlistSongs.length === 0
                ? "Empty playlist"
                : `${playlistSongs.length} ${playlistSongs.length === 1 ? "song" : "songs"}`}
            </p>
          </div>

          <div className="flex items-center gap-4 px-5 mt-1 mb-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleShufflePlaylist}
              disabled={playlistSongs.length === 0}
              aria-label="Shuffle playlist"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-shuffle-playlist"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handlePlayPlaylist}
              disabled={playlistSongs.length === 0}
              className="flex-1 max-w-[210px] flex items-center justify-center gap-2 h-12 rounded-full font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-40 mx-auto"
              style={{ background: "#fff", color: "#00062B" }}
              data-testid="button-play-playlist"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
            {!isFavoritesView ? (
              <button
                type="button"
                onClick={() => { setShowAddSongs(true); setAddSearch(""); }}
                aria-label="Add songs to playlist"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)" }}
                data-testid="button-add-songs"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            ) : (
              <div className="w-10 h-10" />
            )}
          </div>

          <div ref={detailScrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-[170px]">
            {playlistSongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.3">
                    <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-white/40 text-sm">No songs yet</p>
                <p className="text-white/25 text-xs mt-1">Tap "Add Songs" to search your library</p>
              </div>
            ) : (
              playlistSongs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-3"
                  data-testid={`row-playlist-song-${entry.song.id}`}
                >
                  <button
                    type="button"
                    onClick={() => playSong(entry.song, playlistSongs.map((ps) => ps.song))}
                    className="flex items-center gap-3 flex-1 min-w-0 active:opacity-60 text-left"
                    aria-label={`Play ${entry.song.title}`}
                  >
                    <img
                      src={entry.song.album.artwork}
                      alt={entry.song.album.title}
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{entry.song.title}</p>
                      <p className="text-white/40 text-xs truncate">{entry.song.album.artist}</p>
                    </div>
                  </button>
                  {isFavoritesView ? (
                    <button
                      type="button"
                      onClick={() => favSongs.toggle(entry.song.id)}
                      aria-label="Remove from favorites"
                      className="w-8 h-8 flex items-center justify-center flex-shrink-0 active:scale-[0.9] transition-transform"
                      data-testid={`button-unfavorite-${entry.song.id}`}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="#FF5470" stroke="#FF5470" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeSongMutation.mutate({ playlistId: selectedPlaylist.id, songId: entry.song.id })}
                      aria-label="Remove from playlist"
                      className="text-white/30 p-1 flex-shrink-0"
                      data-testid={`button-remove-song-${entry.song.id}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <MiniPlayer />
          <BottomNav />

          {showAddSongs && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <div
                className="absolute inset-0 bg-black/60"
                style={{ backdropFilter: "blur(4px)" }}
                onClick={() => setShowAddSongs(false)}
              />
              <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-6 z-10 flex flex-col" style={{ height: "78vh" }}>
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
                <div className="flex items-center justify-between px-5 mb-3 flex-shrink-0">
                  <h3 className="text-white font-semibold text-base">Add Songs</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddSongs(false)}
                    className="text-[#319ED8] text-sm font-semibold"
                    data-testid="button-close-add-songs"
                  >
                    Done
                  </button>
                </div>

                <div className="px-5 mb-3 flex-shrink-0">
                  <div className="relative flex items-center" style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.2" strokeLinecap="round" className="ml-3 flex-shrink-0">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </svg>
                    <input
                      type="text"
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="Search songs"
                      className="flex-1 bg-transparent border-0 px-2.5 py-2 text-white placeholder-white/35 text-sm focus:outline-none"
                      autoFocus
                      data-testid="input-add-song-search"
                    />
                    {addSearch && (
                      <button
                        type="button"
                        onClick={() => setAddSearch("")}
                        className="mr-2 w-5 h-5 flex items-center justify-center rounded-full"
                        style={{ background: "rgba(255,255,255,0.18)" }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
                  {addCandidates.length === 0 ? (
                    <p className="text-white/35 text-sm text-center mt-8">No songs match "{addSearch}"</p>
                  ) : (
                    addCandidates.map((song) => {
                      const already = addedSongIds.has(song.id);
                      return (
                        <div key={song.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <img src={song.artwork} alt={song.title} className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate leading-tight">{song.title}</p>
                            <p className="text-white/45 text-xs truncate leading-tight mt-0.5">{song.artist}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => !already && addSongMutation.mutate({ playlistId: selectedPlaylist.id, songId: song.id })}
                            disabled={already || addSongMutation.isPending}
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60 disabled:opacity-40"
                            style={{ background: already ? "rgba(74,255,202,0.18)" : "rgba(49,158,216,0.22)" }}
                            data-testid={`button-add-song-${song.id}`}
                          >
                            {already ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="3" strokeLinecap="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {editingPlaylist && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setEditingPlaylist(null)} />
              <div className="relative w-full bg-[#0D1B4B] rounded-t-3xl p-5 pb-10 z-10">
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                <h3 className="text-white font-semibold text-base mb-4">Rename Playlist</h3>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#319ED8]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  autoFocus
                />
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(editingPlaylist.id)}
                    className="px-4 py-3 rounded-2xl border border-red-500/30 text-red-400 text-sm font-medium"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ id: editingPlaylist.id, name: editName })}
                    disabled={!editName.trim()}
                    className="flex-1 py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <header className="relative z-10 flex items-end justify-between px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Playlists</h1>
          <button
            type="button"
            onClick={() => { setShowCreate(true); setCreateError(""); }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={listScrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-5 mt-4">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-5">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.3">
                  <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white/60 text-base font-medium">No playlists yet</p>
              <p className="text-white/30 text-sm mt-1 max-w-[220px]">Create a playlist and add songs from your albums</p>
              <button
                type="button"
                onClick={() => { setShowCreate(true); setCreateError(""); }}
                className="mt-5 px-5 py-3 rounded-2xl font-semibold text-sm text-white"
                style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              >
                Create Playlist
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {playlists.map((pl) => {
                const count = pl.songCount ?? 0;
                const isFav = pl.id === FAVORITES_PLAYLIST_ID;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlaylist(pl)}
                    className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 active:bg-white/10 transition-colors text-left"
                    data-testid={`row-playlist-${pl.id}`}
                  >
                    <PlaylistArtwork
                      artworks={pl.artworks ?? []}
                      songCount={count}
                      size={56}
                      variant={isFav ? "favorites" : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{pl.name}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {isFav
                          ? `${count} favorited`
                          : count === 0 ? "Playlist" : `${count} ${count === 1 ? "song" : "songs"}`}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              style={{ backdropFilter: "blur(4px)" }}
              onClick={() => { setShowCreate(false); setCreateError(""); setNewPlaylistName(""); }}
            />
            <div className="relative w-full bg-[#0D1B4B] rounded-t-3xl p-5 pb-10 z-10">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <h3 className="text-white font-semibold text-base mb-4">New Playlist</h3>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => { setNewPlaylistName(e.target.value); setCreateError(""); }}
                placeholder="Playlist name"
                className="w-full border rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  borderColor: createError ? "rgba(255,80,80,0.5)" : "rgba(255,255,255,0.1)",
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPlaylistName.trim() && !createMutation.isPending) {
                    createMutation.mutate(newPlaylistName.trim());
                  }
                }}
              />
              {createError && (
                <p className="text-red-400 text-xs mt-2">{createError}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (newPlaylistName.trim() && !createMutation.isPending) {
                    createMutation.mutate(newPlaylistName.trim());
                  }
                }}
                disabled={!newPlaylistName.trim() || createMutation.isPending}
                className="w-full mt-4 py-3.5 rounded-2xl font-semibold text-sm text-white disabled:opacity-50 transition-opacity"
                style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              >
                {createMutation.isPending ? "Creating..." : "Create Playlist"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
