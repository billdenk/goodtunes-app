import { useState } from "react";
import { useLocation } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { ALBUMS, SONGS, type Album } from "@/data/musicData";

export function Collection() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { playSong, currentSong, recentAlbums } = usePlayer();
  const [certAlbum, setCertAlbum] = useState<Album | null>(null);

  const handlePlayAll = () => {
    const allSongs = SONGS.map((s) => ({
      ...s,
      album: ALBUMS.find((a) => a.id === s.albumId)!,
    })).filter((s) => s.album);
    if (allSongs.length > 0) playSong(allSongs[0], allSongs);
  };

  const handleShuffle = () => {
    const allSongs = SONGS.map((s) => ({
      ...s,
      album: ALBUMS.find((a) => a.id === s.albumId)!,
    })).filter((s) => s.album);
    if (allSongs.length === 0) return;
    const shuffled = [...allSongs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <main className="min-h-screen w-full bg-[#00062B] flex justify-center">
      <section className="relative w-full max-w-[390px] min-h-screen bg-[#00062B] text-white overflow-hidden flex flex-col">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-12" style={{ background: "radial-gradient(circle, #319ED8, transparent)" }} />
          <div className="absolute top-1/2 -left-20 w-64 h-64 rounded-full opacity-8" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        </div>

        <header className="relative z-10 flex items-center justify-between px-5 pt-14 pb-3">
          <GoodTunesLogo size="md" />
          <button
            type="button"
            onClick={() => navigate("/account")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            {initials}
          </button>
        </header>

        <div className="relative z-10 flex gap-3 px-5 mt-1 mb-3">
          <button
            type="button"
            onClick={handlePlayAll}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold active:scale-[0.97] transition-transform"
            style={{ background: "rgba(49,158,216,0.18)", border: "1px solid rgba(49,158,216,0.25)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#319ED8">
              <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
            </svg>
            <span style={{ color: "#319ED8" }}>Play</span>
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold active:scale-[0.97] transition-transform"
            style={{ background: "rgba(49,158,216,0.18)", border: "1px solid rgba(49,158,216,0.25)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round">
              <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
            <span style={{ color: "#319ED8" }}>Shuffle</span>
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide">
          {recentAlbums.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between px-5 mb-3">
                <h2 className="text-white text-base font-bold">Recently Played</h2>
              </div>
              <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pt-2 pb-2" style={{ marginTop: -8 }}>
                {recentAlbums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => navigate(`/album/${album.id}`)}
                    className="flex-shrink-0 flex flex-col active:scale-[0.95] transition-transform"
                    style={{ width: 90 }}
                  >
                    <div
                      className="rounded-2xl overflow-hidden mb-1.5"
                      style={{
                        width: 90,
                        height: 90,
                        boxShadow: currentSong?.albumId === album.id
                          ? "0 0 0 2px #319ED8, 0 4px 16px rgba(0,0,0,0.5)"
                          : "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-[11px] font-semibold truncate leading-tight text-left">{album.title}</p>
                    <p className="text-white/45 text-[10px] truncate leading-tight text-left mt-0.5">{album.artist}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 mb-3">
            <h2 className="text-white text-base font-bold">My Library</h2>
          </div>

          <div className="px-5 pb-4">
            <div className="grid grid-cols-2 gap-4">
              {ALBUMS.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  isCurrentlyPlaying={currentSong?.albumId === album.id}
                  onPress={() => navigate(`/album/${album.id}`)}
                  onCertPress={() => setCertAlbum(album)}
                />
              ))}
            </div>
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />

        {certAlbum && (
          <GoodDeedCertificate
            album={certAlbum}
            ownerName={user?.displayName || "GoodTunes Fan"}
            certificateNumber={certAlbum.certificateNumber ?? 1}
            onClose={() => setCertAlbum(null)}
          />
        )}
      </section>
    </main>
  );
}

function AlbumCard({
  album,
  isCurrentlyPlaying,
  onPress,
  onCertPress,
}: {
  album: Album;
  isCurrentlyPlaying: boolean;
  onPress: () => void;
  onCertPress: () => void;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onPress}
        className="relative aspect-square rounded-2xl overflow-hidden active:scale-[0.97] transition-transform"
        style={{
          boxShadow: isCurrentlyPlaying
            ? "0 0 0 2px #319ED8, 0 4px 20px rgba(0,0,0,0.4)"
            : "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
        {isCurrentlyPlaying && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,6,43,0.45)" }}>
            <div className="flex gap-[3px] items-end h-5">
              {[0.6, 1, 0.75].map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    background: "white",
                    height: `${h * 100}%`,
                    animation: "equalizerBounce 0.8s ease-in-out infinite alternate",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)" }}
          >
            {album.type}
          </span>
        </div>
      </button>
      <div className="mt-2 px-0.5">
        <p className="text-white text-sm font-semibold leading-tight truncate">{album.title}</p>
        <p className="text-white/50 text-xs truncate mt-0.5">{album.artist}</p>
      </div>
    </div>
  );
}
