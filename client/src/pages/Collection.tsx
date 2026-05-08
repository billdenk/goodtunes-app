import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { ALBUMS, SONGS, type Album } from "@/data/musicData";

export function Collection() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { playSong, currentSong } = usePlayer();
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
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #319ED8, transparent)" }} />
          <div className="absolute top-1/2 -left-20 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        </div>

        <header className="relative z-10 flex items-center justify-between px-5 pt-14 pb-2">
          <div>
            <p className="text-white/40 text-xs font-medium uppercase tracking-widest">GoodTunes®</p>
            <h1 className="text-white text-2xl font-bold mt-0.5">My Collection</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/account")}
            className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {initials}
          </button>
        </header>

        <div className="relative z-10 flex gap-3 px-5 mt-4 mb-2">
          <button
            type="button"
            onClick={handlePlayAll}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/20 text-white text-sm font-semibold active:scale-[0.97] transition-transform"
            style={{ background: "rgba(255,255,255,0.06)" }}
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

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-5 pb-2 mt-2">
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
      >
        <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
        {isCurrentlyPlaying && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,6,43,0.5)" }}>
            <div className="flex gap-0.5 items-end h-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-pulse"
                  style={{
                    background: "#319ED8",
                    height: `${i * 33}%`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(0,6,43,0.7)", color: "#319ED8", border: "1px solid rgba(49,158,216,0.3)" }}
          >
            {album.type}
          </span>
        </div>
      </button>
      <div className="mt-2 px-0.5">
        <p className="text-white text-sm font-semibold leading-tight truncate">{album.title}</p>
        <p className="text-white/50 text-xs truncate mt-0.5">{album.artist}</p>
        <button
          type="button"
          onClick={onCertPress}
          className="mt-1.5 flex items-center gap-1 text-[#4AFFCA] text-[10px] font-medium"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          GoodDeed™ No. {(album.certificateNumber ?? 1).toString().padStart(2, "0")}
        </button>
      </div>
    </div>
  );
}
