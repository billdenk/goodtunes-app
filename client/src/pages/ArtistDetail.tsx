import { useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { ALBUMS, SONGS, ARTIST_PHOTOS, type Album } from "@/data/musicData";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";

export function ArtistDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { playSong } = usePlayer();
  const favArtists = useFavoriteArtists();

  const artistName = useMemo(() => {
    try { return decodeURIComponent(slug || ""); } catch { return slug || ""; }
  }, [slug]);

  const artistAlbums = useMemo(
    () => ALBUMS.filter((a) => a.artist === artistName),
    [artistName],
  );

  const allArtistSongs = useMemo(
    () =>
      SONGS.filter((s) => artistAlbums.some((a) => a.id === s.albumId)).map((s) => ({
        ...s,
        album: artistAlbums.find((a) => a.id === s.albumId)!,
      })),
    [artistAlbums],
  );

  const allVideos = useMemo(
    () => artistAlbums.flatMap((a) => (a.videos ?? []).map((v) => ({ ...v, album: a }))),
    [artistAlbums],
  );

  const isFav = favArtists.has(artistName);
  const heroArt = artistAlbums[0]?.artwork;
  const artistPhoto = ARTIST_PHOTOS[artistName];
  const avatarSrc = artistPhoto ?? heroArt;
  const blurSrc = artistPhoto ?? heroArt;
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  if (artistAlbums.length === 0) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center">
        <div className="text-white text-center">
          <p>Artist not found</p>
          <button onClick={() => navigate("/collection")} className="mt-4 text-[#319ED8]">Back to Collection</button>
        </div>
      </main>
    );
  }

  const handlePlayAll = () => {
    if (allArtistSongs.length > 0) playSong(allArtistSongs[0], allArtistSongs);
  };

  const handleShuffle = () => {
    if (allArtistSongs.length === 0) return;
    const shuffled = [...allArtistSongs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  return (
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden relative">
      {blurSrc && (
        <div className="absolute top-0 left-0 right-0 h-[280px] overflow-hidden pointer-events-none">
          <img src={blurSrc} alt="" className="w-full h-full object-cover" style={{ filter: "blur(40px) saturate(140%)", transform: "scale(1.2)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.4) 0%, rgba(0,6,43,0.85) 70%, #00062B 100%)" }} />
        </div>
      )}

      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <button
          type="button"
          onClick={() => navigate("/collection")}
          aria-label="Back to collection"
          className="absolute top-12 left-4 z-50 w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center text-white"
          data-testid="button-back-artist"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => favArtists.toggle(artistName)}
          aria-label={isFav ? "Unfavorite artist" : "Favorite artist"}
          aria-pressed={isFav}
          className="absolute top-12 right-4 z-50 w-9 h-9 rounded-full bg-black/35 backdrop-blur flex items-center justify-center active:scale-[0.92] transition-transform"
          data-testid="button-favorite-artist"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? "#FF5470" : "none"} stroke={isFav ? "#FF5470" : "white"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }}>
          <div className="flex flex-col items-center pt-20 px-5">
            {avatarSrc && (
              <div
                className="w-[180px] h-[180px] rounded-full overflow-hidden flex-shrink-0"
                style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <img
                  src={avatarSrc}
                  alt={artistName}
                  className="w-full h-full object-cover"
                  style={artistPhoto ? { objectPosition: "50% 20%" } : undefined}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => artistAlbums[0] && navigate(`/album/${artistAlbums[0].id}`)}
              className="mt-5 flex items-center gap-1 active:opacity-70"
              data-testid="button-artist-name"
            >
              <h1 className="text-white text-[28px] font-bold leading-tight tracking-tight text-center" data-testid="text-artist-name">{artistName}</h1>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-white/55 mt-1">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <p className="text-white/45 text-xs mt-1.5">
              {artistAlbums.length} {artistAlbums.length === 1 ? "release" : "releases"} · {allArtistSongs.length} songs
            </p>

            <div className="flex items-center gap-3 mt-5 w-full max-w-[300px]">
              <button
                type="button"
                onClick={handlePlayAll}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-full font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.10)", color: "#319ED8" }}
                data-testid="button-play-artist"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
                Play
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-full font-semibold text-sm active:scale-[0.98] transition-transform"
                style={{ background: "rgba(255,255,255,0.10)", color: "#319ED8" }}
                data-testid="button-shuffle-artist"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
                Shuffle
              </button>
            </div>
          </div>

          <div className="px-5 mt-9">
            <h2 className="text-white text-xl font-bold tracking-tight mb-3">Albums</h2>
            <div className="grid grid-cols-2 gap-4">
              {artistAlbums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => navigate(`/album/${album.id}`)}
                  className="flex flex-col text-left active:scale-[0.97] transition-transform"
                  data-testid={`artist-album-${album.id}`}
                >
                  <div className="aspect-square rounded-2xl overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
                    <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-white text-sm font-semibold leading-tight truncate mt-2">{album.title}</p>
                  <p className="text-white/50 text-xs truncate mt-0.5">{album.year} · {album.type}</p>
                </button>
              ))}
            </div>
          </div>

          {allVideos.length > 0 && (
            <div className="mt-9">
              <h2 className="text-white text-xl font-bold tracking-tight mb-3 px-5">Music Videos</h2>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2">
                {allVideos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => navigate(`/album/${v.album.id}`)}
                    className="relative flex-shrink-0 rounded-2xl overflow-hidden text-left active:opacity-90"
                    style={{ width: 240, aspectRatio: "16 / 9" }}
                    data-testid={`artist-video-${v.id}`}
                  >
                    <img src={v.thumbnail} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,6,43,0.85) 0%, rgba(0,6,43,0.05) 60%)" }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                          <path d="M8 5.14v14l11-7-11-7z" />
                        </svg>
                      </div>
                    </div>
                    <p className="absolute bottom-2.5 left-3 right-3 text-white text-xs font-semibold leading-tight line-clamp-2">{v.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 mt-9">
            <h2 className="text-white text-xl font-bold tracking-tight mb-3">About</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              {artistAlbums[0]?.description || `Music by ${artistName} on GoodTunes®.`}
            </p>
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
