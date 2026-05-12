import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { ALBUMS, getSongsByAlbum, formatDuration, type Song, type Album, type AlbumVideo, type AlbumPhoto } from "@/data/musicData";

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay } = usePlayer();
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
  const [activePhoto, setActivePhoto] = useState<AlbumPhoto | null>(null);
  const [downloadStep, setDownloadStep] = useState<"off" | "warn" | "confirm">("off");
  const [isDownloaded, setIsDownloaded] = useState(false);

  const album = ALBUMS.find((a) => a.id === id);
  const songs = album ? getSongsByAlbum(id) : [];
  const ownedNums = album?.ownedCertificates ?? (album?.certificateNumber ? [album.certificateNumber] : []);
  const isMulti = ownedNums.length > 1;

  const moreByArtist = album
    ? ALBUMS.filter((a) => a.artist === album.artist && a.id !== album.id)
    : [];

  useEffect(() => {
    setActiveVideo(null);
    setActivePhoto(null);
    setShowOwnership(false);
    setProvenanceCertNum(null);
    setDownloadStep("off");
    if (album) {
      try { setIsDownloaded(localStorage.getItem(`gt:downloaded:${album.id}`) === "1"); }
      catch { setIsDownloaded(false); }
    }
  }, [id, album]);

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
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <button
          type="button"
          onClick={() => navigate("/collection")}
          aria-label="Back to collection"
          className="absolute top-12 left-4 z-50 w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"
          data-testid="button-back-album"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="absolute top-12 right-4 z-50">
          <button
            type="button"
            onClick={() => setShowMenu((s) => !s)}
            aria-label="Album options"
            aria-haspopup="menu"
            aria-expanded={showMenu}
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
                <div className="h-px bg-white/8" />
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setDownloadStep("warn"); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm active:bg-white/10"
                  style={{ color: isDownloaded ? "rgba(255,255,255,0.55)" : "#FF6B6B" }}
                  data-testid="menu-download-music"
                  disabled={isDownloaded}
                >
                  <span>{isDownloaded ? "Downloaded ✓" : "Download Music Files"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isDownloaded ? "#4AFFCA" : "#FF6B6B"} strokeWidth="2" strokeLinecap="round">
                    {isDownloaded ? (
                      <path d="M20 6L9 17l-5-5" />
                    ) : (
                      <>
                        <path d="M12 4v12M7 11l5 5 5-5" />
                        <path d="M5 20h14" />
                      </>
                    )}
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
                      if (navigator.share) await navigator.share(shareData);
                      else {
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

        <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }} data-testid="scroll-album">
          {/* Hero artwork — scrolls with content and fades into the dark bg */}
          <div className="relative w-full h-[300px] overflow-hidden">
            <img src={album.artwork} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,6,43,0.15) 0%, rgba(0,6,43,0.35) 35%, rgba(0,6,43,0.85) 75%, #00062B 100%)",
              }}
            />
          </div>

          {/* Title block — solid dark bg sits below hero */}
          <div className="relative pt-4 pb-3 px-5 bg-[#00062B]">
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 inline-block"
              style={{ background: "rgba(49,158,216,0.15)", color: "#319ED8", border: "1px solid rgba(49,158,216,0.3)" }}
            >
              {album.type}
            </span>
            <h1 className="text-white text-[28px] font-bold leading-tight tracking-tight" data-testid="text-album-title">{album.title}</h1>
            <button
              type="button"
              onClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
              className="mt-1 inline-flex items-center gap-0.5 text-[#319ED8] text-base font-medium active:opacity-70"
              data-testid="link-album-artist"
            >
              {album.artist}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <p className="text-white/40 text-xs mt-1.5">{album.year} · {songs.length} songs · {totalMin} min</p>
            {album.description && (
              <p className="text-white/55 text-sm mt-3 leading-relaxed">{album.description}</p>
            )}
          </div>

          {/* Play / Shuffle / Add bar */}
          <div className="flex items-center gap-4 px-5 mt-1 mb-3">
            <button
              type="button"
              onClick={handleShuffle}
              aria-label="Shuffle album"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-shuffle-album"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex-1 max-w-[210px] flex items-center justify-center gap-2 h-12 rounded-full font-semibold text-base active:scale-[0.98] transition-transform mx-auto"
              style={{ background: "#fff", color: "#00062B" }}
              data-testid="button-play-album"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
            <button
              type="button"
              onClick={() => setShowAlbumPlaylistPicker(true)}
              aria-label="Add album to a playlist"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-add-album-to-playlist"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {/* Tracks */}
          <div className="bg-[#00062B] px-3">
            {songs.map((song, i) => {
              const isActive = currentSong?.id === song.id;
              const isFav = favSongs.has(song.id);
              const stripe = i % 2 === 0;
              return (
                <div
                  key={song.id}
                  className="flex items-center px-2 py-3 gap-2 rounded-2xl transition-colors"
                  style={{ background: stripe ? "rgba(49,158,216,0.07)" : "transparent" }}
                  data-testid={`row-track-${song.id}`}
                >
                  <button
                    type="button"
                    onClick={() => handlePlaySong({ ...song, album })}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? "text-[#319ED8]" : "text-white"}`}>
                        {song.title}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => favSongs.toggle(song.id)}
                    aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFav}
                    className="w-8 h-8 flex items-center justify-center flex-shrink-0 active:scale-[0.9] transition-transform"
                    data-testid={`button-favorite-song-${song.id}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? "#FF5470" : "none"} stroke={isFav ? "#FF5470" : "rgba(255,255,255,0.4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPlaylistPicker(song)}
                    aria-label="Add to playlist"
                    className="w-7 h-7 flex items-center justify-center text-white/30 flex-shrink-0"
                    data-testid={`button-track-menu-${song.id}`}
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

          {/* Metadata block */}
          <div className="px-5 mt-7">
            <p className="text-white/35 text-[11px] leading-relaxed">
              <span className="block">{album.year} · GoodTunes® Records</span>
              <span className="block mt-0.5">{songs.length} {songs.length === 1 ? "song" : "songs"} · {runtime}</span>
              {ownedNums.length > 0 && (
                <span className="block mt-0.5">
                  You own {ownedNums.length === 1 ? `No. ${(ownedNums[0]).toString().padStart(2, "0")}` : `${ownedNums.length} certificates`} of this {album.type === "EP" ? "EP" : "album"}.
                </span>
              )}
            </p>
          </div>

          {/* Music Videos */}
          {hasVideos && (
            <div className="mt-9">
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
            <div className="mt-9">
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Photos</h2>
              <div className="px-5 grid grid-cols-3 gap-1.5" data-testid="section-photos">
                {album.photos!.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePhoto(p)}
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
            <div className="mt-9">
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

        {downloadStep === "warn" && (
          <DownloadWarningSheet
            stage="warn"
            albumType={album.type}
            onClose={() => setDownloadStep("off")}
            onProceed={() => setDownloadStep("confirm")}
          />
        )}

        {downloadStep === "confirm" && (
          <DownloadWarningSheet
            stage="confirm"
            albumType={album.type}
            onClose={() => setDownloadStep("off")}
            onProceed={() => {
              setDownloadStep("off");
              setIsDownloaded(true);
              try { localStorage.setItem(`gt:downloaded:${album.id}`, "1"); } catch {}
              setShareToast("Download started — Transfer Rights removed");
              setTimeout(() => setShareToast(""), 2400);
            }}
          />
        )}

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

        {activePhoto && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={activePhoto.caption ?? "Photo"}
            data-testid="modal-photo"
          >
            <div className="absolute inset-0 bg-black/90" style={{ backdropFilter: "blur(8px)" }} onClick={() => setActivePhoto(null)} />
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              aria-label="Close photo"
              className="absolute top-12 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center text-white active:opacity-70"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(20px)" }}
              data-testid="button-close-photo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="relative w-full max-w-[390px] z-10 px-4">
              <img src={activePhoto.url} alt={activePhoto.caption ?? ""} className="w-full rounded-2xl object-contain" />
              {activePhoto.caption && (
                <p className="text-white/80 text-sm mt-3 text-center">{activePhoto.caption}</p>
              )}
            </div>
          </div>
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

function DownloadWarningSheet({
  stage,
  albumType,
  onClose,
  onProceed,
}: {
  stage: "warn" | "confirm";
  albumType: "album" | "EP";
  onClose: () => void;
  onProceed: () => void;
}) {
  const isWarn = stage === "warn";
  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label={isWarn ? "Keep your Transfer Rights" : "Are you sure?"}
      data-testid={isWarn ? "modal-download-warn" : "modal-download-confirm"}
    >
      <div className="absolute inset-0 bg-black/80" style={{ backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-[340px] z-10 rounded-3xl px-6 pt-5 pb-7"
        style={{
          background: "rgba(20, 24, 48, 0.96)",
          backdropFilter: "blur(28px) saturate(180%)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white/80 active:opacity-70"
          data-testid="button-close-download"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-white text-2xl font-bold leading-tight mt-2">
          {isWarn ? "Keep your Transfer Rights." : "Are you sure?"}
        </h2>
        <p className="text-white/75 text-sm leading-relaxed mt-3">
          {isWarn ? (
            <>
              Downloading will <span className="font-semibold text-white">permanently remove</span> your ability to transfer ownership in the future. Soon, you'll be able to gift or resell your music — keeping it in the cloud ensures you don't lose the <span className="font-semibold text-white">Transfer Rights option.</span>
            </>
          ) : (
            <>
              Downloading music files will <span className="font-semibold text-white">permanently remove</span> your ability to transfer ownership of your limited edition {albumType === "EP" ? "EP" : "Album"} in the future. This cannot be undone.
            </>
          )}
        </p>

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            type="button"
            onClick={onProceed}
            className="w-full py-3 rounded-full text-sm font-semibold text-white active:scale-[0.97] transition-transform"
            style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.85)" }}
            data-testid="button-download-anyway"
          >
            Download Anyway
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-full text-sm font-semibold active:scale-[0.97] transition-transform"
            style={{ background: "#fff", color: "#00062B" }}
            data-testid="button-keep-transfer-rights"
          >
            Keep Transfer Rights
          </button>
        </div>
      </div>
    </div>
  );
}
