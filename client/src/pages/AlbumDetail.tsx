import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { ALBUMS, SONGS, getSongsByAlbum, formatDuration, type Song, type Album } from "@/data/musicData";

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCert, setShowCert] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<Song | null>(null);

  const album = ALBUMS.find((a) => a.id === id);
  const songs = album ? getSongsByAlbum(id) : [];

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
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden relative">
      {/* Full-bleed album artwork hero */}
      <div className="absolute top-0 left-0 right-0 h-[340px] overflow-hidden pointer-events-none">
        <img
          src={album.artwork}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.3) 0%, rgba(0,6,43,0.7) 60%, #00062B 100%)" }} />
      </div>
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <div className="relative flex-shrink-0">
          <div className="relative h-[340px] overflow-hidden">

            <button
              type="button"
              onClick={() => navigate("/collection")}
              className="absolute top-12 left-4 w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="absolute top-12 right-4 z-20">
              <button
                type="button"
                onClick={() => setShowMenu((s) => !s)}
                className="w-8 h-8 rounded-full bg-black/35 backdrop-blur flex items-center justify-center text-white active:opacity-70"
                data-testid="button-album-menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 z-40 rounded-2xl py-1 min-w-[230px] overflow-hidden"
                    style={{
                      background: "rgba(28, 30, 38, 0.96)",
                      backdropFilter: "blur(28px) saturate(180%)",
                      WebkitBackdropFilter: "blur(28px) saturate(180%)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowCert(true); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                      data-testid="menu-view-certificate"
                    >
                      <span>View GoodDeed® Certificate</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="2">
                        <path d="M9 12l2 2 4-4M7.8 4.7a3.4 3.4 0 001.95-.8 3.4 3.4 0 014.4 0 3.4 3.4 0 001.95.8 3.4 3.4 0 013.15 3.15 3.4 3.4 0 00.8 1.95 3.4 3.4 0 010 4.4 3.4 3.4 0 00-.8 1.95 3.4 3.4 0 01-3.15 3.15 3.4 3.4 0 00-1.95.8 3.4 3.4 0 01-4.4 0 3.4 3.4 0 00-1.95-.8 3.4 3.4 0 01-3.15-3.15 3.4 3.4 0 00-.8-1.95 3.4 3.4 0 010-4.4 3.4 3.4 0 00.8-1.95 3.4 3.4 0 013.15-3.15z" />
                      </svg>
                    </button>
                    <div className="h-px bg-white/8" />
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); setShowProvenance(true); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                      data-testid="menu-view-provenance"
                    >
                      <span>View Provenance</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    <div className="h-px bg-white/8" />
                    <button
                      type="button"
                      onClick={async () => {
                        setShowMenu(false);
                        const url = `${window.location.origin}/album/${album.id}`;
                        const shareData = { title: album.title, text: `${album.title} by ${album.artist}`, url };
                        try {
                          if (navigator.share) {
                            await navigator.share(shareData);
                          } else {
                            await navigator.clipboard.writeText(url);
                            setShareToast("Link copied");
                            setTimeout(() => setShareToast(""), 2000);
                          }
                        } catch {}
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                      data-testid="menu-share-album"
                    >
                      <span>Share Album</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F10A7" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
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
          <PlaylistPickerSheet
            songId={showPlaylistPicker.id}
            songTitle={showPlaylistPicker.title}
            onClose={() => setShowPlaylistPicker(null)}
          />
        )}

        {showProvenance && (
          <ProvenanceSheet
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            onClose={() => setShowProvenance(false)}
          />
        )}

        {shareToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-white text-sm font-medium" style={{ background: "rgba(20,22,30,0.95)", backdropFilter: "blur(20px)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            {shareToast}
          </div>
        )}
      </section>
    </main>
  );
}

function ProvenanceSheet({ album, ownerName, onClose }: { album: Album; ownerName: string; onClose: () => void }) {
  const certNum = album.certificateNumber ?? 1;
  const events = [
    { date: "2024-03-12", actor: "GoodTunes® Mint", action: "Certificate #" + certNum + " minted", color: "#7F10A7" },
    { date: "2024-08-04", actor: "Original Owner", action: `Purchased from ${album.artist}`, color: "#319ED8" },
    { date: "2025-11-21", actor: ownerName, action: "Acquired via secondary transfer", color: "#4AFFCA" },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/65" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-8 z-10 flex flex-col" style={{ maxHeight: "82vh" }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-4 flex-shrink-0">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Digital Provenance</p>
            <h3 className="text-white font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#319ED8] text-sm font-semibold" data-testid="button-close-provenance">Done</button>
        </div>

        <div className="px-5 mb-5 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "rgba(74,255,202,0.08)", border: "1px solid rgba(74,255,202,0.2)" }}>
            <img src={album.artwork} alt={album.title} className="w-12 h-12 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">Certificate #{certNum}</p>
              <p className="text-white/50 text-xs mt-0.5 truncate">Currently held by {ownerName}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "rgba(74,255,202,0.18)", color: "#4AFFCA" }}>VERIFIED</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">Ownership chain</p>
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
            {events.map((e, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className="absolute -left-[18px] top-1 w-3 h-3 rounded-full" style={{ background: e.color, boxShadow: `0 0 0 3px rgba(0,6,43,1), 0 0 12px ${e.color}55` }} />
                <p className="text-white/40 text-[11px]">{e.date}</p>
                <p className="text-white text-sm font-semibold mt-0.5">{e.actor}</p>
                <p className="text-white/55 text-xs mt-0.5">{e.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
