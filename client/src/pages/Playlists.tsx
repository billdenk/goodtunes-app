import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { SONGS, ALBUMS, type Song, type Album } from "@/data/musicData";

interface Playlist {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
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
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [editName, setEditName] = useState("");

  // Auto-open create dialog when arriving with ?create=1
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("create=1")) {
      setShowCreate(true);
      // Clean the URL so refresh doesn't re-trigger
      window.history.replaceState({}, "", "/playlists");
    }
  }, [location]);

  const { data: playlistsRaw, isLoading } = useQuery<Playlist[] | null>({
    queryKey: ["/api/playlists"],
  });
  const playlists = playlistsRaw ?? [];

  const { data: playlistSongsRaw } = useQuery<PlaylistSongEntry[] | null>({
    queryKey: ["/api/playlists", selectedPlaylist?.id, "songs"],
    enabled: !!selectedPlaylist,
  });
  const playlistSongs = playlistSongsRaw ?? [];

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
    },
  });

  const handlePlayPlaylist = () => {
    if (playlistSongs.length === 0) return;
    playSong(playlistSongs[0].song, playlistSongs.map((ps) => ps.song));
  };

  if (selectedPlaylist) {
    return (
      <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden">
        <section className="relative w-full max-w-[390px] h-screen bg-[#00062B] text-white flex flex-col">
          <header className="flex items-center gap-3 px-5 pt-14 pb-4 flex-shrink-0">
            <button type="button" onClick={() => setSelectedPlaylist(null)} className="text-white/80">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white/40 text-xs uppercase tracking-widest">Playlist</p>
              <h1 className="text-white text-xl font-bold truncate">{selectedPlaylist.name}</h1>
            </div>
            <button
              type="button"
              onClick={() => { setEditingPlaylist(selectedPlaylist); setEditName(selectedPlaylist.name); }}
              className="text-white/40 p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          {playlistSongs.length > 0 && (
            <div className="flex gap-3 px-5 mb-4 flex-shrink-0">
              <button
                type="button"
                onClick={handlePlayPlaylist}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm text-white"
                style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
                Play All
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
            {playlistSongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.3">
                    <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-white/40 text-sm">No songs yet</p>
                <p className="text-white/25 text-xs mt-1">Add songs from album pages</p>
              </div>
            ) : (
              playlistSongs.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 py-3">
                  <img
                    src={entry.song.album.artwork}
                    alt={entry.song.album.title}
                    className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{entry.song.title}</p>
                    <p className="text-white/40 text-xs truncate">{entry.song.album.artist}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSongMutation.mutate({ playlistId: selectedPlaylist.id, songId: entry.song.id })}
                    className="text-white/30 p-1 flex-shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <MiniPlayer />
          <BottomNav />

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
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] h-screen bg-[#00062B] text-white flex flex-col">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        </div>

        <header className="relative z-10 flex items-center justify-between px-5 pt-14 pb-2">
          <div>
            <p className="text-white/40 text-xs font-medium uppercase tracking-widest">GoodTunes®</p>
            <h1 className="text-white text-2xl font-bold mt-0.5">Playlists</h1>
          </div>
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

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-5 mt-4">
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
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setSelectedPlaylist(pl)}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 active:bg-white/10 transition-colors text-left"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.7">
                      <path d="M3 6h18M3 10h14M3 14h10" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{pl.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">Playlist</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
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
