import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { ALBUMS, SONGS, getSongsByAlbum, formatDuration, type Song, type Album } from "@/data/musicData";

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCert, setShowCert] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<Song | null>(null);

  const album = ALBUMS.find((a) => a.id === id);
  const songs = album ? getSongsByAlbum(id) : [];

  const { data: playlists = [] } = useQuery<any[]>({
    queryKey: ["/api/playlists"],
    queryFn: async () => {
      const res = await fetch("/api/playlists");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: string; songId: string }) => {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, position: 0 }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      setShowPlaylistPicker(null);
    },
  });

  if (!album) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="text-white text-center">
          <p>Album not found</p>
          <button onClick={() => navigate("/collection")} className="mt-4 text-[#319ED8]">Back to Collection</button>
        </div>
      </main>
    );
  }

  const albumSongs = songs.map((s) => ({ ...s, album }));

  const handlePlaySong = (song: typeof albumSongs[0]) => {
    const isCurrentSong = currentSong?.id === song.id;
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(song, albumSongs);
    }
  };

  const handlePlayAll = () => {
    if (albumSongs.length > 0) playSong(albumSongs[0], albumSongs);
  };

  const handleShuffle = () => {
    if (albumSongs.length === 0) return;
    const shuffled = [...albumSongs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);

  return (
    <main className="min-h-screen w-full bg-[#00062B] flex justify-center">
      <section className="relative w-full max-w-[390px] min-h-screen bg-[#00062B] text-white flex flex-col">
        <div className="relative flex-shrink-0">
          <div className="relative h-[340px] overflow-hidden">
            <img
              src={album.artwork}
              alt={album.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.3) 0%, rgba(0,6,43,0.7) 60%, #00062B 100%)" }} />

            <button
              type="button"
              onClick={() => navigate("/collection")}
              className="absolute top-12 left-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowCert(true)}
              className="absolute top-12 right-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="2">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </button>
          </div>

          <div className="px-5 -mt-8 relative z-10">
            <div className="flex items-start justify-between mb-1">
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 inline-block"
                style={{ background: "rgba(49,158,216,0.15)", color: "#319ED8", border: "1px solid rgba(49,158,216,0.3)" }}
              >
                {album.type}
              </span>
            </div>
            <h1 className="text-white text-2xl font-bold leading-tight">{album.title}</h1>
            <p className="text-white/60 text-base mt-1">{album.artist}</p>
            <p className="text-white/30 text-xs mt-1.5">{album.year} · {songs.length} songs · {totalMin} min</p>
            <p className="text-white/40 text-sm mt-2 leading-relaxed">{album.description}</p>
          </div>

          <div className="flex gap-3 px-5 mt-4 mb-2">
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm text-white active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
            <button
              type="button"
              onClick={handleShuffle}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/20 text-white text-sm font-semibold active:scale-[0.97] transition-transform"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              Shuffle
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide pb-2">
          {songs.map((song, i) => {
            const isActive = currentSong?.id === song.id;
            return (
              <div
                key={song.id}
                className="flex items-center px-5 py-3 gap-3 active:bg-white/5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => handlePlaySong({ ...song, album })}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="w-7 flex-shrink-0 flex items-center justify-center">
                    {isActive ? (
                      <div className="flex gap-0.5 items-end h-4">
                        {[1, 2, 3].map((j) => (
                          <div
                            key={j}
                            className="w-0.5 rounded-full"
                            style={{
                              background: "#319ED8",
                              height: isPlaying ? `${40 + j * 20}%` : "40%",
                              animationName: isPlaying ? "pulse" : "none",
                              animationDuration: `${0.5 + j * 0.1}s`,
                              animationIterationCount: "infinite",
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-white/30 text-sm">{song.trackNumber}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-[#319ED8]" : "text-white"}`}>
                      {song.title}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">{formatDuration(song.duration)}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlaylistPicker(song)}
                  className="w-7 h-7 flex items-center justify-center text-white/30 flex-shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" fill="currentColor" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <MiniPlayer />
        <BottomNav />

        {showCert && (
          <GoodDeedCertificate
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            certificateNumber={album.certificateNumber ?? 1}
            onClose={() => setShowCert(false)}
          />
        )}

        {showPlaylistPicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPlaylistPicker(null)} />
            <div className="relative w-full max-w-[390px] z-10 bg-[#0D1B4B] rounded-t-3xl p-5 pb-10">
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
              <h3 className="text-white font-semibold text-base mb-1">Add to Playlist</h3>
              <p className="text-white/40 text-sm mb-4">{showPlaylistPicker.title}</p>
              {playlists.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-white/40 text-sm">No playlists yet.</p>
                  <button
                    onClick={() => { setShowPlaylistPicker(null); }}
                    className="mt-3 text-[#319ED8] text-sm"
                  >
                    Create one in Playlists tab
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto scrollbar-hide">
                  {playlists.map((pl: any) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => addToPlaylistMutation.mutate({ playlistId: pl.id, songId: showPlaylistPicker.id })}
                      className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-white/5 text-white text-sm font-medium text-left active:bg-white/10"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" strokeLinecap="round" />
                      </svg>
                      {pl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
