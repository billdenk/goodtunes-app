import { useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { ALBUMS, SONGS, ARTIST_PHOTOS, type Album } from "@/data/musicData";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import type { PersonDiscography } from "@shared/schema";

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

  // Streaming discography — the rest of the artist's catalog from Apple
  // Music that isn't in GoodTunes. Admin pulls this via iTunes Lookup
  // and persists it; here we just read + bucket. Empty array when the
  // artist hasn't been pulled yet or doesn't exist in our `people` table.
  // NOTE on the join: fan ArtistDetail is keyed by display name (no
  // personId in this route), so resolution is `lower(people.name) = lower(name)`.
  // Brittle for aliases / typos / "feat." text — fine for the current
  // hand-curated static catalog (small, exact-match artist names). When
  // we migrate this page off `@/data/musicData` to a DB-backed artist
  // route, switch this to a personId-based fetch.
  const { data: streamingAll = [] } = useQuery<PersonDiscography[]>({
    queryKey: ["/api/discography/by-artist-name", { name: artistName }],
    queryFn: async () => {
      const res = await fetch(
        `/api/discography/by-artist-name?name=${encodeURIComponent(artistName)}`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!artistName,
  });
  // Dedupe vs GoodTunes Releases by title (case-insensitive). Anything
  // already in the catalog renders above as a full GT tile — we don't
  // want it to appear twice with a streaming handoff fan can use to
  // leave the app.
  const goodTunesTitles = useMemo(
    () => new Set(artistAlbums.map((a) => a.title.toLowerCase())),
    [artistAlbums],
  );
  const streamingFiltered = useMemo(
    () => streamingAll.filter((r) => !goodTunesTitles.has(r.name.toLowerCase())),
    [streamingAll, goodTunesTitles],
  );
  // Three buckets, matching the admin Discography panel exactly so the
  // admin sees what the fan sees. Singles are detected by trackCount === 1
  // since iTunes marks them as collectionType "EP" with one track.
  const streamingBuckets = useMemo(() => {
    const lps = streamingFiltered.filter(
      (r) => r.type === "album" && r.trackCount !== 1,
    );
    const eps = streamingFiltered.filter(
      (r) => r.type === "EP" && (r.trackCount ?? 0) > 1,
    );
    const singles = streamingFiltered.filter((r) => r.trackCount === 1);
    return [
      { label: "Albums", items: lps },
      { label: "EPs", items: eps },
      { label: "Singles", items: singles },
    ].filter((g) => g.items.length > 0);
  }, [streamingFiltered]);
  // Open release for the How-to-Play sheet. Null = sheet closed.
  const [howToPlay, setHowToPlay] = useState<PersonDiscography | null>(null);

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
            <h2 className="text-white text-xl font-bold tracking-tight mb-3">GoodTunes Releases</h2>
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

          {streamingBuckets.length > 0 && (
            <div className="px-5 mt-9" data-testid="section-streaming">
              <h2 className="text-white text-xl font-bold tracking-tight mb-1">Streaming</h2>
              <p className="text-white/45 text-xs mb-4">
                The rest of {artistName}'s catalog on Apple Music & Spotify.
              </p>
              {streamingBuckets.map((bucket) => (
                <div key={bucket.label} className="mb-6 last:mb-0">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-white/80 text-[11px] font-semibold uppercase tracking-wider">
                      {bucket.label}
                    </h3>
                    <span className="text-white/40 text-[11px]">{bucket.items.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {bucket.items.map((release) => (
                      <button
                        key={release.id}
                        type="button"
                        onClick={() => setHowToPlay(release)}
                        className="flex flex-col text-left active:scale-[0.97] transition-transform"
                        data-testid={`streaming-release-${release.id}`}
                      >
                        <div
                          className="aspect-square rounded-2xl overflow-hidden bg-white/5"
                          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                        >
                          {release.artworkUrl && (
                            <img
                              src={release.artworkUrl}
                              alt={release.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p className="text-white text-sm font-semibold leading-tight truncate mt-2">
                          {release.name}
                        </p>
                        <p className="text-white/50 text-xs truncate mt-0.5">
                          {[release.year, bucket.label === "Singles" ? "Single" : release.type === "album" ? "LP" : release.type]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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

      {howToPlay && (
        <HowToPlaySheet
          release={howToPlay}
          artistName={artistName}
          onClose={() => setHowToPlay(null)}
        />
      )}
    </main>
  );
}

// Apple-TV-style "How to Watch" sheet, adapted to streaming-only (no
// Buy / Rent — every option is a subscription handoff). Two big rounded
// rows: Apple Music (deep-link to the exact album via the iTunes Lookup
// URL we cached) + Spotify (search fallback today, since we don't yet
// store per-release Spotify URLs).
function HowToPlaySheet({
  release,
  artistName,
  onClose,
}: {
  release: PersonDiscography;
  artistName: string;
  onClose: () => void;
}) {
  const spotifyHref =
    release.spotifyUrl ??
    `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${release.name}`)}`;
  const services: Array<{
    key: string;
    label: string;
    href: string | null;
    // Inline SVG keeps this self-contained — no new icon dependency.
    logo: JSX.Element;
    accent: string;
  }> = [
    {
      key: "apple",
      label: "Apple Music",
      href: release.appleMusicUrl,
      accent: "#FA243C",
      logo: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M19.5 4.5c0-1.4-1.1-2.5-2.5-2.5h-10C5.6 2 4.5 3.1 4.5 4.5v15c0 1.4 1.1 2.5 2.5 2.5h10c1.4 0 2.5-1.1 2.5-2.5v-15zm-4.4 12.2c-.2.5-.5 1-.9 1.4-.6.6-1.4.9-2.2.9-.3 0-.5 0-.8-.1-.7-.2-1.3-.5-1.7-1.1-.5-.7-.7-1.5-.6-2.3.1-.8.5-1.5 1.1-2 .5-.4 1.1-.6 1.7-.7l1.3-.2V8.4c0-.1 0-.2-.1-.3-.1 0-.1-.1-.2-.1l-3.6.5c-.2 0-.4.2-.4.4v6.8c0 .1 0 .2-.1.2 0 0-.1.1-.2.1l-1.3.2c-.6.1-1.2.5-1.5 1.1-.3.5-.4 1.1-.2 1.7.2.7.7 1.2 1.3 1.5.4.2.8.3 1.3.2.4 0 .8-.2 1.1-.4.6-.4 1-1.1 1.1-1.9V9.4l3.3-.5c.1 0 .2 0 .3.1.1.1.1.2.1.3v6.5c0 .3-.1.6-.2.9z"/>
        </svg>
      ),
    },
    {
      key: "spotify",
      label: "Spotify",
      href: spotifyHref,
      accent: "#1DB954",
      logo: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.6 14.4c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1-.4.1-.7-.1-.8-.5-.1-.4.1-.7.5-.8 4-.9 7.5-.5 10.3 1.2.4.2.4.6.2.9zm1.2-2.7c-.2.4-.7.5-1.1.3-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.8-1.1 8.6-.6 11.8 1.4.4.2.5.7.2 1zm.1-2.8c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.7-1.1 9.9-.9 13.8 1.4.5.3.7.9.4 1.4-.3.5-.9.7-1.4.2z"/>
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 backdrop-blur-md"
      onClick={onClose}
      data-testid="sheet-how-to-play"
    >
      <div
        className="w-full max-w-[440px] bg-[#0E1334] rounded-t-[28px] text-white pb-10"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}
      >
        {/* Drag handle + floating close button */}
        <div className="relative">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
            data-testid="button-close-how-to-play"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Centered hero: large rounded album art + title + meta */}
        <div className="flex flex-col items-center text-center px-6 pt-4 pb-7">
          {release.artworkUrl ? (
            <img
              src={release.artworkUrl}
              alt={release.name}
              className="w-44 h-44 rounded-2xl object-cover"
              style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.55)" }}
            />
          ) : (
            <div
              className="w-44 h-44 rounded-2xl bg-white/8"
              style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.55)" }}
            />
          )}
          <h3 className="text-white text-[20px] font-bold tracking-tight mt-5 leading-tight">
            {release.name}
          </h3>
          <p className="text-white/55 text-[13px] mt-1">
            {artistName}
            {release.year ? ` · ${release.year}` : ""}
          </p>
        </div>

        {/* How to Play — two big app-icon-style tap targets, centered.
            Logo tile gets the brand color; service name sits underneath. */}
        <div className="px-6">
          <h4 className="text-white/55 text-[11px] font-semibold uppercase tracking-[0.14em] text-center mb-4">
            How to Play
          </h4>
          <div className="flex items-start justify-center gap-7">
            {services.map((s) => {
              const isDisabled = !s.href;
              const tile = (
                <div
                  className="flex items-center justify-center rounded-[22px] transition-transform active:scale-[0.94]"
                  style={{
                    width: 88,
                    height: 88,
                    background: s.accent,
                    opacity: isDisabled ? 0.4 : 1,
                    boxShadow: isDisabled
                      ? "none"
                      : `0 10px 24px ${s.accent}55, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  }}
                >
                  {/* Bump the logo larger inside the bigger tile */}
                  <div style={{ transform: "scale(1.7)" }}>{s.logo}</div>
                </div>
              );
              const caption = (
                <p className="text-white text-[13px] font-semibold mt-2.5">{s.label}</p>
              );
              const subcaption = isDisabled ? (
                <p className="text-white/40 text-[11px] mt-0.5">Not available</p>
              ) : null;
              if (isDisabled) {
                return (
                  <div
                    key={s.key}
                    role="button"
                    aria-disabled="true"
                    className="flex flex-col items-center cursor-not-allowed"
                    data-testid={`button-how-to-play-${s.key}-disabled`}
                  >
                    {tile}
                    {caption}
                    {subcaption}
                  </div>
                );
              }
              return (
                <a
                  key={s.key}
                  href={s.href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center"
                  data-testid={`button-how-to-play-${s.key}`}
                  aria-label={`Listen on ${s.label}`}
                >
                  {tile}
                  {caption}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
