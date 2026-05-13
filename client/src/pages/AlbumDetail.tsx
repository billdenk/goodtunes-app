import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { toast } from "@/hooks/use-toast";
import { startVendorChatAboutInstrument } from "@/lib/chatStore";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { ALBUMS, getSongsByAlbum, getCreditsForSong, getTracksForPerformerOnAlbum, PEOPLE, INSTRUMENTS, type Song, type Album, type AlbumVideo, type AlbumPhoto, type Person, type Instrument, type TrackPerformer } from "@/data/musicData";

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay, playNext, playLast } = usePlayer();
  const { user } = useAuth();
  const favSongs = useFavoriteSongs();
  const [showCert, setShowCert] = useState(false);
  const [singleCertNum, setSingleCertNum] = useState<number | null>(null);
  const [provenanceCertNum, setProvenanceCertNum] = useState<number | null>(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<Song | null>(null);
  const [showAlbumPlaylistPicker, setShowAlbumPlaylistPicker] = useState(false);
  const [activeVideo, setActiveVideo] = useState<AlbumVideo | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [songMenuFor, setSongMenuFor] = useState<Song | null>(null);
  const [creditsForSong, setCreditsForSong] = useState<Song | null>(null);
  const [performerSheet, setPerformerSheet] = useState<{ person: Person; song: Song } | null>(null);
  const [instrumentSheet, setInstrumentSheet] = useState<{ instrument: Instrument; tuningNotes?: string; attribution?: { personId: string; songId: string } } | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<{ url: string; title: string; logoUrl?: string } | null>(null);
  const [bookmarkedInstruments, setBookmarkedInstruments] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkInstrument = (id: string) => {
    setBookmarkedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const [downloadedSongs, setDownloadedSongs] = useState<Set<string>>(new Set());

  const album = ALBUMS.find((a) => a.id === id);
  const songs = album ? getSongsByAlbum(id) : [];
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);
  const tint = "#00062B";
  const ownedNums = album?.ownedCertificates ?? (album?.certificateNumber ? [album.certificateNumber] : []);
  const isMulti = ownedNums.length > 1;

  const moreByArtist = album
    ? ALBUMS.filter((a) => a.artist === album.artist && a.id !== album.id)
    : [];

  useEffect(() => {
    setActiveVideo(null);
    setPhotoIndex(null);
    setShowOwnership(false);
    setProvenanceCertNum(null);
    setSongMenuFor(null);
    setCreditsForSong(null);
    setPerformerSheet(null);
    setInstrumentSheet(null);
    if (album) {
      try {
        const raw = localStorage.getItem(`gt:downloaded-songs:${album.id}`);
        setDownloadedSongs(new Set(raw ? (JSON.parse(raw) as string[]) : []));
      } catch { setDownloadedSongs(new Set()); }
    }
  }, [id, album]);

  const toggleSongDownload = (songId: string) => {
    if (!album) return;
    setDownloadedSongs((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      try { localStorage.setItem(`gt:downloaded-songs:${album.id}`, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

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
    if (isCurrentSong) togglePlay();
    else playSong(song, albumSongs);
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
  const totalSec = totalDuration % 60;
  const runtime = `${totalMin} min${totalSec > 0 ? ` ${totalSec} sec` : ""}`;
  const hasVideos = !!album.videos?.length;
  const hasPhotos = !!album.photos?.length;
  const hasMoreBy = moreByArtist.length > 0;

  return (
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden relative">
      <section className="relative w-full h-screen text-white flex flex-col">
        <button
          type="button"
          onClick={() => navigate("/collection")}
          aria-label="Back to collection"
          className="absolute top-11 left-4 z-50 w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
          style={{ background: "rgba(0,0,0,0.45)" }}
          data-testid="button-back-album"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="absolute top-11 right-4 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/album/${album.id}`;
              const shareData = { title: album.title, text: `${album.title} by ${album.artist}`, url };
              try {
                if (navigator.share) await navigator.share(shareData);
                else {
                  await navigator.clipboard.writeText(url);
                  setShareToast("Link copied");
                  setTimeout(() => setShareToast(""), 2000);
                }
              } catch {}
            }}
            aria-label="Share album"
            className="w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(0,0,0,0.45)" }}
            data-testid="button-share-album"
          >
            {/* iOS share glyph — square + up arrow */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((s) => !s)}
              aria-label="Album options"
              aria-haspopup="menu"
              aria-expanded={showMenu}
              className="w-12 h-12 rounded-full backdrop-blur flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(0,0,0,0.45)" }}
              data-testid="button-album-menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          </div>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
              <div
                role="menu"
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
                  <span>View GoodDeed®</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="2">
                    <path d="M9 12l2 2 4-4M7.8 4.7a3.4 3.4 0 001.95-.8 3.4 3.4 0 014.4 0 3.4 3.4 0 001.95.8 3.4 3.4 0 013.15 3.15 3.4 3.4 0 00.8 1.95 3.4 3.4 0 010 4.4 3.4 3.4 0 00-.8 1.95 3.4 3.4 0 01-3.15 3.15 3.4 3.4 0 00-1.95.8 3.4 3.4 0 01-4.4 0 3.4 3.4 0 00-1.95-.8 3.4 3.4 0 01-3.15-3.15 3.4 3.4 0 00-.8-1.95 3.4 3.4 0 010-4.4 3.4 3.4 0 00.8-1.95 3.4 3.4 0 013.15-3.15z" />
                  </svg>
                </button>
                <div className="h-px bg-white/8" />
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    if (isMulti) setShowOwnership(true);
                    else setProvenanceCertNum(ownedNums[0] ?? album.certificateNumber ?? 1);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
                  data-testid="menu-view-provenance"
                >
                  <span>{isMulti ? "Ownership" : "View Provenance"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }} data-testid="scroll-album">
          {/* Hero region — brand navy throughout */}
          <div style={{ background: tint }}>
            {/* Hero artwork — full square, edge-to-edge of the column, fading into the tint */}
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1 / 1" }}>
              <img src={album.artwork} alt="" className="absolute inset-0 w-full h-full object-cover block" />
              <div
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: "55%",
                  background: `linear-gradient(to bottom, transparent 0%, ${tint}73 55%, ${tint}eb 88%, ${tint} 100%)`,
                }}
              />
            </div>

            {/* Title block — sits on tint */}
            <div className="relative pt-4 pb-3 px-5">
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 inline-block"
                style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
              >
                {album.type}
              </span>
              <h1 className="text-white text-[28px] font-bold leading-tight tracking-tight" data-testid="text-album-title">{album.title}</h1>
              <button
                type="button"
                onClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
                className="mt-1 inline-flex items-center gap-0.5 text-white text-base font-medium active:opacity-70"
                data-testid="link-album-artist"
              >
                {album.artist}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              <p className="text-white/55 text-xs mt-1.5">{album.year} · {songs.length} songs · {totalMin} min</p>
              {album.description && (
                <p className="text-white/70 text-sm mt-3 leading-relaxed">{album.description}</p>
              )}
            </div>

          </div>

          {/* Play / Shuffle / Add bar */}
          <div className="flex items-center justify-center gap-3 px-5 mt-1 mb-3">
            <button
              type="button"
              onClick={handleShuffle}
              aria-label="Shuffle album"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-shuffle-album"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex items-center justify-center gap-2.5 h-12 px-10 rounded-full font-semibold text-[17px] active:scale-[0.98] transition-transform"
              style={{ background: "#fff", color: "#00062B" }}
              data-testid="button-play-album"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
            <button
              type="button"
              onClick={() => setShowAlbumPlaylistPicker(true)}
              aria-label="Add album to a playlist"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-add-album-to-playlist"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {/* Tracks */}
          <div className="bg-[#00062B] px-5 mt-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {songs.map((song, i) => {
              const isActive = currentSong?.id === song.id;
              return (
                <div
                  key={song.id}
                  className="flex items-center gap-3 h-16 active:bg-white/[0.03] transition-colors"
                  data-testid={`row-track-${song.id}`}
                >
                  <button
                    type="button"
                    onClick={() => handlePlaySong({ ...song, album })}
                    className="flex items-center gap-4 flex-1 min-w-0 h-full text-left"
                  >
                    <div className="w-6 flex-shrink-0 flex items-center justify-center">
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
                        <span className="text-[15px] tabular-nums" style={{ color: "rgba(255,255,255,0.32)" }}>{song.trackNumber}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 relative h-full flex items-center">
                      <p className={`text-[15px] font-medium truncate ${isActive ? "text-[#319ED8]" : "text-white"}`}>
                        {song.title}
                      </p>
                      {i > 0 && (
                        <span
                          className="absolute left-0 right-0 top-0 h-px pointer-events-none"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        />
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSongDownload(song.id)}
                    aria-label={downloadedSongs.has(song.id) ? "Remove download" : "Download to this device"}
                    aria-pressed={downloadedSongs.has(song.id)}
                    className="w-9 h-9 flex items-center justify-center flex-shrink-0 active:scale-[0.9] transition-transform"
                    data-testid={`button-download-song-${song.id}`}
                  >
                    {downloadedSongs.has(song.id) ? (
                      // Downloaded: filled circle with check (Apple's "in library / downloaded")
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.85)" />
                        <path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#00062B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    ) : (
                      // Not downloaded: Apple's outlined circle with down arrow
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 7v8" />
                        <path d="M8.5 11.5L12 15l3.5-3.5" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSongMenuFor(song)}
                    aria-label="Song options"
                    aria-haspopup="dialog"
                    aria-expanded={songMenuFor?.id === song.id}
                    className="w-7 h-9 flex items-center justify-center text-white/40 flex-shrink-0"
                    data-testid={`button-track-menu-${song.id}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Metadata block */}
          <div className="px-5 mt-7">
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.32)" }}>
              <span className="block">{album.year} · {album.artist}</span>
              <span className="block mt-0.5">{songs.length} {songs.length === 1 ? "song" : "songs"} · {runtime}</span>
              {ownedNums.length > 0 && (
                <span className="block mt-0.5">
                  You own {ownedNums.length === 1 ? `No. ${(ownedNums[0]).toString().padStart(2, "0")}` : `${ownedNums.length} certificates`} of this {album.type === "EP" ? "EP" : "album"}.
                </span>
              )}
            </p>
          </div>

          {/* Editorial panel — slightly lighter shelf for Music Videos / Photos / More By */}
          {(hasVideos || hasPhotos || hasMoreBy) && (
          <div
            className="mt-8 pt-7 pb-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderTop: "1px solid rgba(255,255,255,0.07)",
            }}
          >
          {/* Music Videos */}
          {hasVideos && (
            <div>
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Music Videos</h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2" data-testid="section-videos">
                {album.videos!.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVideo(v)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden text-left active:opacity-90"
                    style={{ width: 280, aspectRatio: "16 / 9" }}
                    data-testid={`video-${v.id}`}
                  >
                    <img src={v.thumbnail} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,6,43,0.85) 0%, rgba(0,6,43,0.05) 60%)" }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-13 h-13 w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                          <path d="M8 5.14v14l11-7-11-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                      <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{v.title}</p>
                      {v.duration && (
                        <span className="text-[10px] font-semibold text-white px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: "rgba(0,0,0,0.55)" }}>
                          {v.duration}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {hasPhotos && (
            <div className={hasVideos ? "mt-9" : ""}>
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Photos</h2>
              <div className="px-5 grid grid-cols-3 gap-1.5" data-testid="section-photos">
                {album.photos!.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhotoIndex(idx)}
                    className="relative rounded-xl overflow-hidden active:opacity-80"
                    style={{ aspectRatio: "1 / 1" }}
                    data-testid={`photo-${p.id}`}
                  >
                    <img src={p.url} alt={p.caption ?? ""} className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* More By Artist */}
          {hasMoreBy && (
            <div className={hasVideos || hasPhotos ? "mt-9" : ""}>
              <button
                type="button"
                onClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
                className="flex items-center gap-1 px-5 mb-3 active:opacity-70"
                data-testid="link-more-by-artist"
              >
                <h2 className="text-white text-xl font-bold tracking-tight">More By {album.artist}</h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-white/55">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2" data-testid="section-more-by">
                {moreByArtist.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/album/${a.id}`)}
                    className="flex-shrink-0 flex flex-col text-left active:scale-[0.97] transition-transform"
                    style={{ width: 130 }}
                    data-testid={`more-by-${a.id}`}
                  >
                    <div className="w-full aspect-square rounded-2xl overflow-hidden" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                      <img src={a.artwork} alt={a.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-xs font-semibold leading-tight truncate mt-2">{a.title}</p>
                    <p className="text-white/45 text-[11px] truncate mt-0.5">{a.year}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />

        {showCert && (
          <GoodDeedCertificate
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            identities={{
              realName: user?.realName ?? null,
              displayName: user?.displayName || "GoodTunes Fan",
              username: user?.username || "you",
            }}
            certificateNumber={singleCertNum ?? album.certificateNumber ?? 1}
            certificateNumbers={singleCertNum !== null ? [singleCertNum] : album.ownedCertificates}
            onClose={() => { setShowCert(false); setSingleCertNum(null); }}
          />
        )}

        {showPlaylistPicker && (
          <PlaylistPickerSheet
            songId={showPlaylistPicker.id}
            songTitle={showPlaylistPicker.title}
            onClose={() => setShowPlaylistPicker(null)}
          />
        )}

        {showAlbumPlaylistPicker && (
          <PlaylistPickerSheet
            songIds={songs.map((s) => s.id)}
            songTitle={`${album.title} · ${songs.length} song${songs.length === 1 ? "" : "s"}`}
            heading="Add Album to Playlist"
            onClose={() => setShowAlbumPlaylistPicker(false)}
          />
        )}

        {provenanceCertNum !== null && (
          <ProvenanceSheet
            onViewGoodDeed={(n) => { setProvenanceCertNum(null); setShowCert(true); setSingleCertNum(n); }}
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            certNum={provenanceCertNum}
            onClose={() => setProvenanceCertNum(null)}
          />
        )}

        {showOwnership && (
          <OwnershipSheet
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            onClose={() => setShowOwnership(false)}
            onSelectCert={(n) => { setShowOwnership(false); setProvenanceCertNum(n); }}
          />
        )}

        {songMenuFor && (
          <SongActionSheet
            song={songMenuFor}
            album={album}
            isFavorite={favSongs.has(songMenuFor.id)}
            onToggleFavorite={() => favSongs.toggle(songMenuFor.id)}
            onShare={async () => {
              const url = `${window.location.origin}/album/${album.id}`;
              try {
                if (navigator.share) await navigator.share({ title: songMenuFor.title, text: `${songMenuFor.title} — ${album.artist}`, url });
                else {
                  await navigator.clipboard.writeText(url);
                  setShareToast("Link copied");
                  setTimeout(() => setShareToast(""), 2000);
                }
              } catch {}
            }}
            onAddToPlaylist={() => { setSongMenuFor(null); setShowPlaylistPicker(songMenuFor); }}
            onPlayNext={() => { playNext({ ...songMenuFor, album }); setShareToast("Playing next"); setTimeout(() => setShareToast(""), 1600); }}
            onPlayLast={() => { playLast({ ...songMenuFor, album }); setShareToast("Added to queue"); setTimeout(() => setShareToast(""), 1600); }}
            onViewCredits={() => { setSongMenuFor(null); setCreditsForSong(songMenuFor); }}
            onClose={() => setSongMenuFor(null)}
          />
        )}

        {/* Only one SuperCredits sheet is mounted at a time (instrument > performer > credits)
            so we don't stack multiple aria-modal dialogs simultaneously. */}
        {inAppBrowser ? (
          <InAppBrowserSheet
            url={inAppBrowser.url}
            title={inAppBrowser.title}
            logoUrl={inAppBrowser.logoUrl}
            onClose={() => setInAppBrowser(null)}
          />
        ) : instrumentSheet ? (
          <InstrumentSheet
            instrument={instrumentSheet.instrument}
            tuningNotes={instrumentSheet.tuningNotes}
            attribution={instrumentSheet.attribution}
            isBookmarked={bookmarkedInstruments.has(instrumentSheet.instrument.id)}
            onToggleBookmark={() => toggleBookmarkInstrument(instrumentSheet.instrument.id)}
            onOpenInAppBrowser={(b) => setInAppBrowser(b)}
            onMessageVendor={(vendor) => {
              const inst = instrumentSheet.instrument;
              try {
                const domain = new URL(vendor.affiliateUrl).hostname.replace(/^www\./, "");
                const tid = startVendorChatAboutInstrument({
                  kind: "instrument",
                  instrumentId: inst.id,
                  instrumentName: inst.name,
                  instrumentCategory: inst.shortCategory ?? inst.category,
                  instrumentPhotoUrl: inst.photoUrl,
                  vendorName: vendor.name,
                  vendorLogoUrl: vendor.logoUrl,
                  vendorDomain: domain,
                  url: vendor.affiliateUrl,
                });
                setInstrumentSheet(null);
                navigate(`/chat/${encodeURIComponent(tid)}`);
              } catch {
                toast({ title: "Couldn't start chat", description: "Invalid vendor link." });
              }
            }}
            onClose={() => setInstrumentSheet(null)}
          />
        ) : performerSheet ? (
          <PerformerSheet
            person={performerSheet.person}
            song={performerSheet.song}
            album={album}
            onOpenInstrument={(instrument, tuningNotes, attribution) => setInstrumentSheet({ instrument, tuningNotes, attribution })}
            onClose={() => setPerformerSheet(null)}
          />
        ) : creditsForSong ? (
          <CreditsSheet
            song={creditsForSong}
            album={album}
            onOpenPerformer={(person) => setPerformerSheet({ person, song: creditsForSong })}
            onOpenInstrument={(instrument, tuningNotes, attribution) => setInstrumentSheet({ instrument, tuningNotes, attribution })}
            onClose={() => setCreditsForSong(null)}
          />
        ) : null}

        {activeVideo && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={activeVideo.title}
            data-testid="modal-video"
          >
            <div className="absolute inset-0 bg-black/85" style={{ backdropFilter: "blur(8px)" }} onClick={() => setActiveVideo(null)} />
            <div className="relative w-full max-w-[390px] z-10 px-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white text-sm font-semibold truncate pr-3">{activeVideo.title}</p>
                <button
                  type="button"
                  onClick={() => setActiveVideo(null)}
                  aria-label="Close video"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
                  data-testid="button-close-video"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <video
                src={activeVideo.url}
                poster={activeVideo.thumbnail}
                controls
                autoPlay
                playsInline
                className="w-full rounded-2xl bg-black"
                style={{ aspectRatio: "16 / 9" }}
              />
            </div>
          </div>
        )}

        {photoIndex !== null && album.photos && (
          <PhotoLightbox
            photos={album.photos}
            startIndex={photoIndex}
            onClose={() => setPhotoIndex(null)}
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

function ProvenanceSheet({ album, ownerName, certNum, onClose, onViewGoodDeed }: { album: Album; ownerName: string; certNum: number; onClose: () => void; onViewGoodDeed?: (n: number) => void }) {
  const events = [
    { date: "2025-11-21", actor: ownerName, action: "Acquired via secondary transfer", color: "#4AFFCA" },
    { date: "2024-08-04", actor: "Original Owner", action: `Purchased from ${album.artist}`, color: "#319ED8" },
    { date: "2024-03-12", actor: "GoodTunes® Created", action: "Certificate #" + certNum + " created", color: "#7F10A7" },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Provenance for ${album.title} certificate ${certNum}`}>
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

        <div className="px-5 mb-4 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "rgba(74,255,202,0.08)", border: "1px solid rgba(74,255,202,0.2)" }}>
            <img src={album.artwork} alt={album.title} className="w-12 h-12 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">Certificate #{certNum}</p>
              <p className="text-white/50 text-xs mt-0.5 truncate">Currently held by {ownerName}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "rgba(74,255,202,0.18)", color: "#4AFFCA" }}>VERIFIED</span>
          </div>
          {onViewGoodDeed && (
            <button
              type="button"
              onClick={() => onViewGoodDeed(certNum)}
              className="w-full mt-2.5 flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold text-white active:opacity-70 transition-opacity"
              style={{ background: "rgba(49,158,216,0.14)", border: "1px solid rgba(49,158,216,0.28)" }}
              data-testid="button-view-this-gooddeed"
            >
              <span>View GoodDeed® No. {certNum.toString().padStart(2, "0")}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2.2" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
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

function OwnershipSheet({
  album,
  ownerName,
  onClose,
  onSelectCert,
}: {
  album: Album;
  ownerName: string;
  onClose: () => void;
  onSelectCert: (n: number) => void;
}) {
  const owned = album.ownedCertificates ?? [];
  const purchasesByNum = new Map((album.purchases ?? []).map((p) => [p.num, p]));
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Ownership">
      <div className="absolute inset-0 bg-black/65" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-8 z-10 flex flex-col" style={{ maxHeight: "82vh" }}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 mb-1 flex-shrink-0">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Ownership</p>
            <h3 className="text-white font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#319ED8] text-sm font-semibold" data-testid="button-close-ownership">Done</button>
        </div>
        <p className="px-5 text-white/50 text-xs mb-4">Held by {ownerName} · {owned.length} cop{owned.length === 1 ? "y" : "ies"}</p>

        <div className="px-5 mb-2 flex items-center text-[10px] font-bold uppercase tracking-widest text-white/40">
          <div className="w-16">No.</div>
          <div className="flex-1">Price</div>
          <div className="w-24 text-right">Date</div>
          <div className="w-5" />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-3">
          {owned.map((num, i) => {
            const p = purchasesByNum.get(num);
            return (
              <button
                key={num}
                type="button"
                onClick={() => onSelectCert(num)}
                className="w-full flex items-center px-2 py-3.5 rounded-xl text-left active:bg-white/5 transition-colors"
                style={{ background: i % 2 === 0 ? "rgba(49,158,216,0.07)" : "transparent" }}
                data-testid={`row-cert-${num}`}
              >
                <div className="w-16 text-white text-sm font-semibold">#{num}</div>
                <div className="flex-1 text-white/80 text-sm">{p ? `$${p.price.toFixed(2)}` : "—"}</div>
                <div className="w-24 text-right text-white/55 text-xs">{p?.date ?? "—"}</div>
                <div className="w-5 flex justify-end text-white/35">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        <p className="px-5 mt-3 text-white/35 text-[11px] text-center">Tap a row to view that copy's provenance.</p>
      </div>
    </div>
  );
}

function SongActionSheet({
  song,
  album,
  isFavorite,
  onToggleFavorite,
  onShare,
  onAddToPlaylist,
  onPlayNext,
  onPlayLast,
  onViewCredits,
  onClose,
}: {
  song: Song;
  album: Album;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onPlayLast: () => void;
  onViewCredits: () => void;
  onClose: () => void;
}) {
  const close = (run?: () => void) => () => { run?.(); onClose(); };

  // Esc-to-close for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Row = ({ label, sublabel, icon, onClick, testId }: { label: string; sublabel?: string; icon: ReactNode; onClick: () => void; testId: string }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-white/10"
      data-testid={testId}
    >
      <span className="w-6 flex items-center justify-center text-white">{icon}</span>
      <span className="flex-1 text-left">
        <span className="block text-white text-[15px]">{label}</span>
        {sublabel && <span className="block text-white/50 text-[12px] mt-0.5">{sublabel}</span>}
      </span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Options for ${song.title}`}
      data-testid="sheet-song-actions"
    >
      <div className="absolute inset-0 bg-black/55" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-[390px] z-10 rounded-t-3xl pt-3 pb-8"
        style={{ background: "rgba(20, 24, 48, 0.98)", backdropFilter: "blur(28px) saturate(180%)", boxShadow: "0 -16px 40px rgba(0,0,0,0.6)" }}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

        {/* Header: artwork + title/artist */}
        <div className="flex items-center gap-3 px-5 pb-4">
          <img src={album.artwork} alt="" className="w-12 h-12 rounded-lg object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-[15px] font-semibold truncate">{song.title}</p>
            <p className="text-white/55 text-[13px] truncate">{album.artist} · {album.title}</p>
          </div>
        </div>

        {/* Top row: Favorite + Share — Apple's two-up layout */}
        <div className="px-5 grid grid-cols-2 gap-2 pb-2">
          <button
            type="button"
            onClick={() => { onToggleFavorite(); }}
            aria-pressed={isFavorite}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:scale-[0.97] transition-transform"
            style={{ background: "rgba(255,255,255,0.08)" }}
            data-testid="button-sheet-favorite"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isFavorite ? "#FF5470" : "none"} stroke={isFavorite ? "#FF5470" : "rgba(255,255,255,0.85)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-white text-[12px] font-medium">{isFavorite ? "Favorited" : "Favorite"}</span>
          </button>
          <button
            type="button"
            onClick={close(onShare)}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl active:scale-[0.97] transition-transform"
            style={{ background: "rgba(255,255,255,0.08)" }}
            data-testid="button-sheet-share"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span className="text-white text-[12px] font-medium">Share</span>
          </button>
        </div>

        <div className="h-px bg-white/8 my-2" />

        <Row
          label="Add to Playlist"
          testId="row-sheet-add-playlist"
          onClick={close(onAddToPlaylist)}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="10" y2="18" />
              <line x1="18" y1="9" x2="18" y2="21" />
              <line x1="12" y1="15" x2="24" y2="15" />
            </svg>
          }
        />
        <Row
          label="Play Next"
          testId="row-sheet-play-next"
          onClick={close(onPlayNext)}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,7 22,12 18,17" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        <Row
          label="Play Last"
          sublabel={album.title}
          testId="row-sheet-play-last"
          onClick={close(onPlayLast)}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,15 22,18 18,21" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        <div className="h-px bg-white/8 my-2" />
        <Row
          label="View SuperCredits™"
          testId="row-sheet-credits"
          onClick={close(onViewCredits)}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v.01M11 12h1v4h1" />
            </svg>
          }
        />

        <button
          type="button"
          onClick={onClose}
          className="mx-5 mt-4 w-[calc(100%-40px)] py-3 rounded-full text-white text-[15px] font-semibold active:scale-[0.98] transition-transform"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-sheet-close"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────── SuperCredits™ ────────────────────────────

function PersonAvatar({ person, size = 44 }: { person: Person; size?: number }) {
  const initials = person.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{
        width: size,
        height: size,
        background: "#319ED8",
        fontSize: Math.round(size * 0.38),
      }}
      aria-hidden="true"
    >
      {initials || "•"}
    </div>
  );
}

function SheetShell({
  ariaLabel,
  testId,
  onClose,
  variant = "bottom",
  children,
}: {
  ariaLabel: string;
  testId: string;
  onClose: () => void;
  variant?: "bottom" | "full";
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isFull = variant === "full";

  return (
    <div
      className={`fixed inset-0 z-[78] flex justify-center ${isFull ? "items-stretch" : "items-end"}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="absolute inset-0 bg-black/55" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div
        className={
          isFull
            ? "relative w-full max-w-[390px] z-10 h-full flex flex-col overflow-hidden"
            : "relative w-full max-w-[390px] z-10 rounded-t-3xl pt-3 pb-8 max-h-[88vh] overflow-y-auto scrollbar-hide"
        }
        style={{ background: "rgba(20, 24, 48, 0.98)", backdropFilter: "blur(28px) saturate(180%)", boxShadow: isFull ? "none" : "0 -16px 40px rgba(0,0,0,0.6)" }}
      >
        {!isFull && <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />}
        {children}
      </div>
    </div>
  );
}

function SheetHeader({ eyebrow, title, subtitle, onClose }: { eyebrow?: string; title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-5 pb-4">
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[#319ED8] text-[11px] font-semibold uppercase tracking-wider mb-1">{eyebrow}</p>}
        <h2 className="text-white text-[20px] font-bold leading-tight">{title}</h2>
        {subtitle && <p className="text-white/55 text-[13px] mt-1">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 active:opacity-70 flex-shrink-0"
        style={{ background: "rgba(255,255,255,0.08)" }}
        data-testid="button-sheet-close-x"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function CreditsSheet({
  song,
  album,
  onOpenPerformer,
  onOpenInstrument,
  onClose,
}: {
  song: Song;
  album: Album;
  onOpenPerformer: (person: Person) => void;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  onClose: () => void;
}) {
  const credits = getCreditsForSong(song.id);

  return (
    <SheetShell ariaLabel={`Credits for ${song.title}`} testId="sheet-credits" onClose={onClose}>
      <SheetHeader
        eyebrow="SuperCredits™"
        title={song.title}
        subtitle={`${album.artist} · ${album.title}`}
        onClose={onClose}
      />

      {!credits ? (
        <div className="px-5 pb-4 text-white/55 text-sm">
          Detailed credits for this track haven't been published yet. Check back soon — every song will eventually show writers, performers, and the exact instruments they used.
        </div>
      ) : (
        <>
          {/* Writers — tappable rows with avatars (same pattern as performers below) */}
          <div className="px-5 mt-2 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">Written by</div>
          <div className="pb-2">
            {credits.writers.map((w, i) => {
              // If this writer is also in our PEOPLE roster, make the row tappable
              // and route to their PerformerSheet (so writers can be explored too).
              const person = w.personId ? PEOPLE[w.personId] : undefined;
              if (person) {
                return (
                  <button
                    key={`${w.name}-${i}`}
                    type="button"
                    onClick={() => onOpenPerformer(person)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-white/5"
                    data-testid={`button-writer-${i}`}
                  >
                    <PersonAvatar person={person} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[15px] font-medium truncate">{w.name}</p>
                    </div>
                    <span className="text-white/45 text-[12px]">{w.role}</span>
                  </button>
                );
              }
              // Fall-back: writer not in the people roster yet — show name + role only.
              return (
                <div
                  key={`${w.name}-${i}`}
                  className="flex items-center gap-3 px-5 py-2.5"
                  data-testid={`row-writer-${i}`}
                >
                  <PersonAvatar person={{ id: `w-${i}`, name: w.name }} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-medium truncate">{w.name}</p>
                  </div>
                  <span className="text-white/45 text-[12px]">{w.role}</span>
                </div>
              );
            })}
          </div>

          <div className="h-px bg-white/8 mx-5 my-2" />

          {/* Performers — Apple-style: name + role on left, instrument category text on right with chevron.
              Tap left → performer sheet. Tap right → instrument sheet. */}
          <div className="px-5 mt-2 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">Performed by</div>
          <div className="pb-2">
            {credits.performers.map((perf) => {
              const person = PEOPLE[perf.personId];
              const instrument = perf.instrumentId ? INSTRUMENTS[perf.instrumentId] : undefined;
              if (!person) return null;
              const shortLabel = instrument?.shortCategory ?? instrument?.category ?? "";
              return (
                <div key={perf.personId} className="flex items-center px-5 py-2.5 active:bg-white/5">
                  <button
                    type="button"
                    onClick={() => onOpenPerformer(person)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80"
                    data-testid={`button-performer-${perf.personId}`}
                  >
                    <PersonAvatar person={person} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[15px] font-semibold truncate">{person.name}</p>
                      <p className="text-white/55 text-[12px] truncate">{perf.role}</p>
                    </div>
                  </button>
                  {instrument && (
                    <button
                      type="button"
                      onClick={() => onOpenInstrument(instrument, perf.tuningNotes, { personId: perf.personId, songId: song.id })}
                      className="flex items-center gap-1 pl-3 -mr-1 active:opacity-70"
                      data-testid={`button-instrument-${perf.instrumentId}`}
                      aria-label={`Instrument: ${instrument.name}`}
                    >
                      <span className="text-white/70 text-[14px]">{shortLabel}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="px-5 pt-2 pb-1 text-white/35 text-[11px] text-center">Tap a name or an instrument for details.</p>
        </>
      )}
    </SheetShell>
  );
}

function PerformerSheet({
  person,
  song,
  album,
  onOpenInstrument,
  onClose,
}: {
  person: Person;
  song: Song;                  // The song we're focused on — drives "instruments on this song"
  album: Album;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  onClose: () => void;
}) {
  const allTracks = getTracksForPerformerOnAlbum(person.id, album.id);

  // What this performer played on the CURRENT song (could be 0, 1, or many entries)
  const currentSongCredits = getCreditsForSong(song.id);
  const onThisSong = (currentSongCredits?.performers ?? []).filter((p) => p.personId === person.id);

  // Other tracks on this album they played on (excluding the current song)
  const otherTracks = allTracks.filter(({ song: s }) => s.id !== song.id);

  return (
    <SheetShell ariaLabel={`${person.name} on ${song.title}`} testId="sheet-performer" onClose={onClose}>
      {/* Apple-style header: close button floats top-right, hero is a centered large avatar + name */}
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-0 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/70 active:opacity-70"
          style={{ background: "rgba(255,255,255,0.08)" }}
          data-testid="button-performer-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-col items-center text-center px-5 pt-2 pb-5">
          <PersonAvatar person={person} size={112} />
          <h2 className="text-white text-[24px] font-bold leading-tight mt-3">{person.name}</h2>
          <p className="text-white/55 text-[13px] mt-1 truncate max-w-full">On "{song.title}"</p>
        </div>
      </div>

      {/* Instrument(s) used on THIS song */}
      {onThisSong.length > 0 && (
        <>
          <div className="px-5 mt-1 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">Played on this song</div>
          <div className="pb-1">
            {onThisSong.map((perf, i) => {
              const inst = perf.instrumentId ? INSTRUMENTS[perf.instrumentId] : undefined;
              if (!inst) {
                return (
                  <div key={`role-${i}`} className="px-5 py-2.5 text-white/80 text-[14px]">{perf.role}</div>
                );
              }
              return (
                <button
                  key={`inst-${i}`}
                  type="button"
                  onClick={() => onOpenInstrument(inst, perf.tuningNotes, { personId: person.id, songId: song.id })}
                  className="w-full flex items-center gap-3 px-5 py-2.5 text-left active:bg-white/5"
                  data-testid={`button-performer-song-instrument-${perf.instrumentId}`}
                >
                  <div
                    className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}
                  >
                    {inst.photoUrl ? (
                      <img src={inst.photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-medium truncate">{inst.name}</p>
                    <p className="text-white/55 text-[12px] truncate">
                      {perf.role}{perf.tuningNotes ? ` · ${perf.tuningNotes}` : ""}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Other tracks on this album */}
      {otherTracks.length > 0 && (
        <>
          <div className="h-px bg-white/8 mx-5 my-2" />
          <div className="px-5 mt-1 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">
            Also on {album.title}
          </div>
          <div className="pb-2">
            {otherTracks.map(({ song: s, performer }) => {
              const instrument = performer.instrumentId ? INSTRUMENTS[performer.instrumentId] : undefined;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3 active:bg-white/5"
                  data-testid={`row-performer-track-${s.id}`}
                >
                  {/* Track number color matches the album track-list (rgba(255,255,255,0.32)) */}
                  <span className="w-6 text-[15px] tabular-nums text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>{s.trackNumber}</span>
                  <p className="flex-1 min-w-0 text-white text-[15px] truncate">{s.title}</p>
                  {instrument && (
                    <button
                      type="button"
                      onClick={() => onOpenInstrument(instrument, performer.tuningNotes, { personId: performer.personId, songId: s.id })}
                      className="flex items-center gap-1 pl-2 -mr-1 active:opacity-70 flex-shrink-0"
                      data-testid={`button-performer-track-instrument-${s.id}`}
                    >
                      <span className="text-white/65 text-[14px]">{instrument.shortCategory ?? instrument.category}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/35" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {onThisSong.length === 0 && otherTracks.length === 0 && (
        <p className="px-5 py-6 text-white/55 text-sm">No detailed credits yet for this performer on this album.</p>
      )}

      {/* Artist Profile link — placeholder for the future cross-album / streaming-handoff flow.
          See replit.md → "Streaming-service handoff" for the planned UX. */}
      <div className="h-px bg-white/8 mx-5 mt-2 mb-3" />
      <div className="px-5 pb-2">
        <button
          type="button"
          onClick={() => {
            // Placeholder: future flow opens an Artist Profile page with cross-album
            // work + streaming-handoff. See replit.md → "Streaming-service handoff".
            toast({ title: `Artist profile for ${person.name}`, description: "Coming soon" });
          }}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl active:opacity-80"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          data-testid="button-artist-profile"
        >
          <span className="text-white text-[14px] font-medium">View artist profile</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/45" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </SheetShell>
  );
}

function InstrumentSheet({
  instrument,
  tuningNotes,
  attribution,
  isBookmarked,
  onToggleBookmark,
  onOpenInAppBrowser,
  onMessageVendor,
  onClose,
}: {
  instrument: Instrument;
  tuningNotes?: string;
  attribution?: { personId: string; songId: string };
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenInAppBrowser: (b: { url: string; title: string; logoUrl?: string }) => void;
  onMessageVendor: (vendor: { name: string; logoUrl?: string; affiliateUrl: string }) => void;
  onClose: () => void;
}) {
  // Resolve attribution → who wrote the note + which song it's about.
  // Used so a bookmarked instrument still tells you "this note was from X on Y".
  const noteFromPerson = attribution ? PEOPLE[attribution.personId] : undefined;
  const noteFromSong = attribution
    ? ALBUMS.flatMap((a) => getSongsByAlbum(a.id)).find((s) => s.id === attribution.songId)
    : undefined;

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareText = `${instrument.name} — featured on GoodTunes SuperCredits™`;
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: instrument.name,
          text: shareText,
          url: shareUrl,
        });
        return;
      }
    } catch { /* user cancelled or share unavailable */ }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
      toast({ title: "Link copied", description: instrument.name });
    } catch {
      toast({ title: "Share unavailable", description: "Couldn't copy link in this browser." });
    }
  };

  return (
    <SheetShell ariaLabel={instrument.name} testId="sheet-instrument" variant="full" onClose={onClose}>
      {/* Apple-style top bar: X on left, Share + Bookmark on right. shrink-0 so it stays pinned. */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2"
        style={{ background: "rgba(20,24,48,0.85)", backdropFilter: "blur(20px) saturate(180%)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-instrument-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-instrument-share"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="M7 8l5-5 5 5" />
              <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            aria-pressed={isBookmarked}
            className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-instrument-bookmark"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={isBookmarked ? "#4AFFCA" : "none"}
              stroke={isBookmarked ? "#4AFFCA" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content area (header above is shrink-0) */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
      {/* Hero photo (no overlay X — that's in the sticky bar above) */}
      <div className="mx-5 mt-2 rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "16 / 10", background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}>
        {instrument.photoUrl ? (
          <img src={instrument.photoUrl} alt={instrument.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/35">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
      </div>

      {/* Title block */}
      <div className="px-5 pb-3">
        <p className="text-[#319ED8] text-[11px] font-semibold uppercase tracking-wider">{instrument.category}</p>
        <h2 className="text-white text-[24px] font-bold leading-tight">{instrument.name}</h2>
        {tuningNotes && (
          <p className="text-white/55 text-[13px] mt-1">Tuning · {tuningNotes}</p>
        )}
      </div>

      {/* About */}
      {instrument.about && (
        <>
          <div className="px-5 mt-1 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">About</div>
          <p className="px-5 pb-4 text-white/80 text-[14px] leading-relaxed">{instrument.about}</p>
        </>
      )}

      {/* Notes from the artist — attributed (so the note still makes sense after bookmarking) */}
      {instrument.artistNote && (
        <>
          <div className="px-5 mt-1 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">Notes from the artist</div>
          <p className="px-5 pb-3 text-white/85 text-[15px] leading-relaxed italic">"{instrument.artistNote}"</p>
          {noteFromPerson && (
            <div className="flex items-center gap-2.5 px-5 pb-4">
              <PersonAvatar person={noteFromPerson} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-white text-[13px] font-medium truncate">{noteFromPerson.name}</p>
                {noteFromSong && (
                  <p className="text-white/50 text-[12px] truncate">on "{noteFromSong.title}"</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Where to buy — vendor list. Tap row → direct buy link. Tap logo → vendor about page. */}
      {instrument.vendors && instrument.vendors.length > 0 && (
        <>
          <div className="h-px bg-white/8 mx-5 mt-2 mb-1" />
          <div className="px-5 mt-2 mb-1 text-white/45 text-[11px] font-semibold uppercase tracking-wider">Where to buy</div>
          <div className="pb-1">
            {instrument.vendors.map((v, i) => (
              <div
                key={`${v.name}-${i}`}
                className="flex items-center px-5 py-2.5 active:bg-white/5"
                data-testid={`row-vendor-${i}`}
              >
                {/* Tap the logo → vendor about page (opens in in-app browser sheet) */}
                <button
                  type="button"
                  onClick={() => onOpenInAppBrowser({ url: v.aboutUrl ?? v.affiliateUrl, title: v.name, logoUrl: v.logoUrl })}
                  aria-label={`About ${v.name}`}
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 active:opacity-70 overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.92)" }}
                  data-testid={`button-vendor-about-${i}`}
                >
                  {v.logoUrl ? (
                    <img src={v.logoUrl} alt="" className="w-7 h-7 object-contain" />
                  ) : (
                    <span className="text-[#00062B] text-[13px] font-bold">{v.name.charAt(0)}</span>
                  )}
                </button>
                {/* Tap the row → direct product / buy link (opens in in-app browser sheet) */}
                <button
                  type="button"
                  onClick={() => onOpenInAppBrowser({ url: v.affiliateUrl, title: v.name, logoUrl: v.logoUrl })}
                  className="flex-1 flex items-center min-w-0 ml-3 active:opacity-80 text-left"
                  data-testid={`button-vendor-buy-${i}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-medium truncate">{v.name}</p>
                  </div>
                </button>
                {/* Chat bubble — opens a chat with this vendor seeded with the current instrument as an OG-style preview card. */}
                <button
                  type="button"
                  onClick={() => onMessageVendor({ name: v.name, logoUrl: v.logoUrl, affiliateUrl: v.affiliateUrl })}
                  aria-label={`Message ${v.name}`}
                  className="w-9 h-9 ml-1 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
                  style={{ background: "rgba(49,158,216,0.16)" }}
                  data-testid={`button-vendor-message-${i}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 ml-1" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </div>
            ))}
          </div>

          <p className="px-5 pt-3 pb-3 text-white/35 text-[10px] text-center leading-relaxed">
            Outbound links support the artist via SuperCredits™ Micro-Sponsorships. Artist receives the lion's share; GoodTunes receives a small connection fee.
          </p>
        </>
      )}
      </div>
    </SheetShell>
  );
}

/**
 * Instagram-style in-app browser. Loads `url` in an iframe so users stay inside GoodTunes;
 * the top bar shows the vendor logo + domain, with an "open in system browser" arrow on
 * the right. Many vendor sites block iframing via X-Frame-Options/CSP — when that happens
 * the iframe stays blank, so we surface a fallback CTA after a short delay so the user can
 * still escape to their browser.
 */
function InAppBrowserSheet({
  url,
  title,
  logoUrl,
  onClose,
}: {
  url: string;
  title: string;
  logoUrl?: string;
  onClose: () => void;
}) {
  // Validate https. We refuse to render anything we can't safely embed/open.
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      return u;
    } catch { return null; }
  })();

  const domain = safeUrl ? safeUrl.hostname.replace(/^www\./, "") : url;

  const openExternal = () => {
    if (!safeUrl) return;
    window.open(safeUrl.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <SheetShell ariaLabel={`${title} — in-app browser`} testId="sheet-inapp-browser" variant="full" onClose={onClose}>
      {/* Top bar — close on left, vendor logo + domain center, "open in browser" on right */}
      <div
        className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 border-b border-white/8"
        style={{ background: "rgba(20,24,48,0.92)", backdropFilter: "blur(20px) saturate(180%)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-inapp-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          {logoUrl && (
            <div className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.92)" }}>
              <img src={logoUrl} alt="" className="w-4 h-4 object-contain" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-[14px] font-semibold truncate leading-tight">{title}</p>
            <p className="text-white/50 text-[11px] truncate leading-tight">{domain}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={openExternal}
          aria-label="Open in browser"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.10)" }}
          data-testid="button-inapp-open-external"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
          </svg>
        </button>
      </div>

      {/* Iframe area. Many vendor sites send X-Frame-Options/CSP frame-ancestors
          to block embedding, so the iframe paints blank — the parent has no JS
          way to detect that. We render a styled "preview" placeholder behind
          the iframe; if the site is embeddable, the iframe paints over it; if
          it's blocked, the placeholder shows through and looks intentional
          rather than broken. Background is dark to match the app chrome. */}
      <div className="flex-1 min-h-0 relative" style={{ background: "#00062B" }}>
        {safeUrl ? (
          <>
            {/* Blocked-state placeholder (sits behind the iframe). */}
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center pointer-events-none">
              {logoUrl ? (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(255,255,255,0.92)" }}>
                  <img src={logoUrl} alt="" className="w-10 h-10 object-contain" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(49,158,216,0.16)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
              )}
              <p className="text-white text-[16px] font-semibold mb-1">{title}</p>
              <p className="text-white/55 text-[13px] mb-5">{domain}</p>
              <p className="text-white/45 text-[12px] leading-relaxed max-w-[260px]">
                Many vendor sites don't allow being shown inside another app. Tap <span className="text-white/80 font-semibold">Open</span> below to view in your browser.
              </p>
            </div>
            <iframe
              src={safeUrl.toString()}
              title={title}
              className="w-full h-full border-0 relative"
              referrerPolicy="no-referrer-when-downgrade"
              // Intentionally NOT setting allow-same-origin: combined with allow-scripts it
              // would weaken sandbox isolation against arbitrary 3rd-party vendor URLs.
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              data-testid="iframe-inapp-browser"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-white text-[15px] font-semibold mb-1">Can't open this link</p>
            <p className="text-white/55 text-[13px] break-all">{url}</p>
          </div>
        )}
      </div>

      {/* Persistent bottom Open bar — always available so users have an
          escape hatch even when the iframe renders blank. */}
      {safeUrl && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-t border-white/8" style={{ background: "rgba(0,6,43,0.96)" }}>
          <p className="flex-1 text-white/65 text-[12px] leading-snug">
            View {domain} in your browser
          </p>
          <button
            type="button"
            onClick={openExternal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white text-[13px] font-semibold active:opacity-80 flex-shrink-0"
            style={{ background: "#319ED8" }}
            data-testid="button-inapp-bottom-open"
          >
            <span>Open</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
            </svg>
          </button>
        </div>
      )}
    </SheetShell>
  );
}

function PhotoLightbox({ photos, startIndex, onClose }: { photos: AlbumPhoto[]; startIndex: number; onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoom, setZoom] = useState(false);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: startIndex * el.clientWidth, behavior: "auto" });
  }, [startIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && scrollerRef.current) {
        scrollerRef.current.scrollBy({ left: scrollerRef.current.clientWidth, behavior: "smooth" });
      }
      if (e.key === "ArrowLeft" && scrollerRef.current) {
        scrollerRef.current.scrollBy({ left: -scrollerRef.current.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) {
      setIndex(i);
      setZoom(false);
    }
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      setZoom((z) => !z);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current && Date.now() - lastTapRef.current >= 280) {
          setChromeVisible((v) => !v);
          lastTapRef.current = 0;
        }
      }, 290);
    }
  };

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black select-none"
      role="dialog"
      aria-modal="true"
      aria-label={current?.caption ?? "Photo viewer"}
      data-testid="modal-photo"
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: zoom ? "none" : "x mandatory", overflowX: zoom ? "hidden" : "auto" }}
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            className="relative w-full h-full flex-shrink-0 snap-center flex items-center justify-center"
            style={{ minWidth: "100%" }}
          >
            <button
              type="button"
              onClick={i === index ? handleTap : undefined}
              onDoubleClick={i === index ? () => setZoom((z) => !z) : undefined}
              aria-label={zoom ? "Zoom out" : "Zoom in"}
              className="w-full h-full flex items-center justify-center bg-transparent border-0 p-0 focus:outline-none"
              style={{ cursor: i === index ? (zoom ? "zoom-out" : "zoom-in") : "default" }}
              tabIndex={i === index ? 0 : -1}
            >
              <img
                src={p.url}
                alt={p.caption ?? `Photo ${i + 1} of ${photos.length}`}
                className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out pointer-events-none"
                style={{
                  transform: i === index && zoom ? "scale(2)" : "scale(1)",
                  transformOrigin: "center center",
                  touchAction: "pinch-zoom",
                }}
                draggable={false}
                data-testid={`lightbox-photo-${p.id}`}
              />
            </button>
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => {
              const el = scrollerRef.current;
              if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
            }}
            disabled={index === 0}
            aria-label="Previous photo"
            className={`hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-white transition-opacity ${chromeVisible && index > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-prev-photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              const el = scrollerRef.current;
              if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
            }}
            disabled={index === photos.length - 1}
            aria-label="Next photo"
            className={`hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-white transition-opacity ${chromeVisible && index < photos.length - 1 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
            data-testid="button-next-photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </>
      )}

      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-12 pb-4 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
      >
        <span className="text-white/80 text-sm font-medium tabular-nums" data-testid="text-photo-counter">
          {index + 1} of {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-10 h-10 rounded-full flex items-center justify-center text-white active:opacity-70"
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)" }}
          data-testid="button-close-photo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 px-6 pb-10 pt-6 transition-opacity duration-200 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
      >
        {current?.caption && (
          <p className="text-white text-center text-[15px] mb-4" data-testid="text-photo-caption">{current.caption}</p>
        )}
        {photos.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  background: i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
