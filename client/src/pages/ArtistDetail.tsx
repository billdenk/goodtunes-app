import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { ALBUMS, SONGS, ARTIST_PHOTOS, type Album } from "@/data/musicData";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import type { PersonDiscography } from "@shared/schema";
import { SiApplemusic, SiSpotify } from "react-icons/si";
import { ChevronRight, ChevronLeft } from "lucide-react";

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

  // Person record (for bio + future fields like coverUrl). The fan page
  // is keyed by display name today, so we resolve via the public
  // /api/people list (small) and match case-insensitively. When this
  // page migrates to a personId-based route we can swap for a direct
  // /api/people/:id fetch.
  type PublicPerson = { id: string; name: string; bio: string | null; photoUrl: string | null };
  const { data: allPeople = [] } = useQuery<PublicPerson[]>({
    queryKey: ["/api/people"],
  });
  const artistPerson = useMemo(
    () =>
      allPeople.find(
        (p) => p.name.trim().toLowerCase() === artistName.trim().toLowerCase(),
      ),
    [allPeople, artistName],
  );
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
  // Apple-style four-bucket layout: Albums / EPs / Singles / Appears On.
  // Singles are detected by trackCount === 1 since iTunes marks them as
  // collectionType "EP" with one track. "Appears On" is the slot for
  // releases where the artist is a feature/guest, not the primary — we
  // don't pull that data yet (needs an iTunes Lookup entity=song pass),
  // so the bucket renders empty today and is hidden by the length filter.
  // Schema slot is reserved for the follow-up pull.
  const streamingBuckets = useMemo(() => {
    const lps = streamingFiltered.filter(
      (r) => r.type === "album" && r.trackCount !== 1,
    );
    const eps = streamingFiltered.filter(
      (r) => r.type === "EP" && (r.trackCount ?? 0) > 1,
    );
    const singles = streamingFiltered.filter((r) => r.trackCount === 1);
    const appearsOn: PersonDiscography[] = [];
    // Per product: hide empty buckets entirely (including "Appears On"
    // until the iTunes Lookup entity=song pass populates guest credits).
    return [
      { label: "Albums", items: lps },
      { label: "EPs", items: eps },
      { label: "Singles", items: singles },
      { label: "Appears On", items: appearsOn },
    ].filter((g) => g.items.length > 0);
  }, [streamingFiltered]);
  // Open release for the How-to-Play sheet. Null = sheet closed.
  const [howToPlay, setHowToPlay] = useState<PersonDiscography | null>(null);
  // Open bucket for the full 2-up grid sheet (caret tap). Null = closed.
  const [openBucket, setOpenBucket] = useState<
    { label: string; items: PersonDiscography[] } | null
  >(null);
  // Apple shows up to ~10 tiles in the horizontal scroller; the caret
  // opens the rest in a full 2-up grid. We always cap the preview so the
  // surface stays scannable even with 200 releases.
  const PREVIEW_CAP = 10;

  const isFav = favArtists.has(artistName);
  const heroArt = artistAlbums[0]?.artwork ?? streamingAll[0]?.artworkUrl ?? undefined;
  const artistPhoto = ARTIST_PHOTOS[artistName];
  const avatarSrc = artistPhoto ?? heroArt;
  const blurSrc = artistPhoto ?? heroArt;
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  // "Artist not found" only when there's literally no data — no static
  // GoodTunes albums AND no streaming discography pulled for this name.
  // Streaming-only artists (no curated GT release yet) still get a full
  // page with their Music available on streaming buckets + About.
  if (artistAlbums.length === 0 && streamingAll.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-center">
          <p>Artist not found</p>
          <button onClick={() => navigate("/collection")} className="mt-4 text-[#319ED8]">Back to Collection</button>
        </div>
      </main>
    );
  }
  const releaseCount = artistAlbums.length;
  const songCount = allArtistSongs.length;
  const hasGtReleases = artistAlbums.length > 0;

  const handlePlayAll = () => {
    if (allArtistSongs.length > 0) playSong(allArtistSongs[0], allArtistSongs);
  };
  // Shuffle handler was removed alongside the Shuffle pill — Apple-Music's
  // artist hero is a single Play action; shuffle stays available from the
  // now-playing controls.

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden relative">
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
              <div className="relative flex-shrink-0">
                <div
                  className="w-[180px] h-[180px] rounded-full overflow-hidden"
                  style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <img
                    src={avatarSrc}
                    alt={artistName}
                    className="w-full h-full object-cover"
                    style={artistPhoto ? { objectPosition: "50% 20%" } : undefined}
                  />
                </div>
                {/* Apple-Music-style hero play FAB. Overlaps the avatar at
                    bottom-right; brand blue fill in place of Apple's red.
                    Replaces the previous side-by-side Play / Shuffle pills
                    — single primary action, consistent with Apple. Shuffle
                    is still available from the now-playing controls. */}
                {hasGtReleases && (
                  <button
                    type="button"
                    onClick={handlePlayAll}
                    disabled={songCount === 0}
                    aria-label="Play all songs"
                    className="absolute bottom-1 right-1 w-14 h-14 rounded-full flex items-center justify-center active:scale-[0.94] transition-transform disabled:opacity-40"
                    style={{ background: "#319ED8", boxShadow: "0 6px 20px rgba(0,0,0,0.45)" }}
                    data-testid="button-play-artist"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                      <path d="M8 5.14v14l11-7-11-7z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            {hasGtReleases ? (
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
            ) : (
              <h1 className="mt-5 text-white text-[28px] font-bold leading-tight tracking-tight text-center" data-testid="text-artist-name">
                {artistName}
              </h1>
            )}
            {hasGtReleases && (
              <p className="text-white/45 text-xs mt-1.5">
                {releaseCount} {releaseCount === 1 ? "release" : "releases"} · {songCount} songs
              </p>
            )}

            {/* Play / Shuffle pill row replaced by the circular FAB that
                overlaps the avatar above — Apple-Music-style. */}
          </div>

          {hasGtReleases && (
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
          )}

          {streamingBuckets.length > 0 && (
            <div className="mt-9" data-testid="section-streaming">
              <div className="px-5 mb-3">
                <p className="text-white/45 text-[11px] uppercase tracking-[0.14em] font-semibold">
                  Music available on streaming
                </p>
              </div>
              {streamingBuckets.map((bucket) => {
                const preview = bucket.items.slice(0, PREVIEW_CAP);
                const hasMore = bucket.items.length > PREVIEW_CAP;
                return (
                  <div key={bucket.label} className="mb-7 last:mb-0">
                    <button
                      type="button"
                      onClick={() => setOpenBucket(bucket)}
                      className="w-full flex items-center justify-between px-5 mb-3 text-left active:opacity-70"
                      data-testid={`button-bucket-${bucket.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <h2 className="text-white text-xl font-bold tracking-tight flex items-center gap-1.5">
                        {bucket.label}
                        <ChevronRight className="w-5 h-5 text-white/40" />
                      </h2>
                      <span className="text-white/40 text-[12px]">{bucket.items.length}</span>
                    </button>
                    <div className="flex gap-4 overflow-x-auto scrollbar-hide px-5 pb-1">
                      {preview.map((release) => (
                        <button
                          key={release.id}
                          type="button"
                          onClick={() => setHowToPlay(release)}
                          className="flex-shrink-0 flex flex-col text-left active:scale-[0.97] transition-transform"
                          style={{ width: 160 }}
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
                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => setOpenBucket(bucket)}
                          className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.97] transition-all"
                          style={{ width: 160, height: 160 }}
                          data-testid={`button-bucket-more-${bucket.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <ChevronRight className="w-6 h-6 text-white/60" />
                          <span className="text-white/60 text-[12px] font-semibold mt-1">
                            See all {bucket.items.length}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-5 mt-9">
            <h2 className="text-white text-xl font-bold tracking-tight mb-3">About</h2>
            <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">
              {artistPerson?.bio?.trim() ||
                artistAlbums[0]?.description ||
                `Music by ${artistName} on GoodTunes®.`}
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

      {openBucket && (
        <BucketGridSheet
          label={openBucket.label}
          items={openBucket.items}
          artistName={artistName}
          onClose={() => setOpenBucket(null)}
          onPick={(r) => {
            setOpenBucket(null);
            setHowToPlay(r);
          }}
        />
      )}
    </main>
  );
}

// Full-screen 2-up grid for a single bucket (Albums / EPs / Singles /
// Appears On). Opens when the fan taps the section header caret or the
// "See all N" tile in the horizontal scroller. Mirrors the Apple Music
// "See All" screen: back chevron + bucket label up top, scrollable
// 2-column grid below. Tapping a tile opens the existing HowToPlaySheet.
function BucketGridSheet({
  label,
  items,
  artistName,
  onClose,
  onPick,
}: {
  label: string;
  items: PersonDiscography[];
  artistName: string;
  onClose: () => void;
  onPick: (r: PersonDiscography) => void;
}) {
  // Accessibility: keep this surface modal-grade. Escape closes the
  // sheet, focus moves to the back button on open, and the previously
  // focused element is restored on close so screen-reader / keyboard
  // users land back on the bucket header they came from.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const headingId = `bucket-${label.toLowerCase().replace(/\s+/g, "-")}-title`;
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] bg-[#00062B] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid={`sheet-bucket-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-3 px-3 pt-3 pb-2 max-w-[440px] mx-auto w-full">
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/8 hover:bg-white/12 flex items-center justify-center active:scale-95 transition-transform"
          data-testid="button-bucket-close"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h2
          id={headingId}
          className="text-white text-[17px] font-semibold tracking-tight flex-1 text-center pr-10"
        >
          {label}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[440px] mx-auto w-full px-5 pb-10">
          <p className="text-white/45 text-[12px] mb-4">
            {artistName} · {items.length} {items.length === 1 ? "release" : "releases"}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {items.map((release) => (
              <button
                key={release.id}
                type="button"
                onClick={() => onPick(release)}
                className="flex flex-col text-left active:scale-[0.97] transition-transform"
                data-testid={`bucket-release-${release.id}`}
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
                  {[release.year, label === "Singles" ? "Single" : release.type === "album" ? "LP" : release.type]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
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
  // Official brand marks via react-icons/si. Per each service's identity
  // guidelines we render the full-color logo on a black tile.
  // - Apple Music identity: marketing.services.apple/apple-music-identity-guidelines
  // - Spotify design guidelines: developer.spotify.com/documentation/design
  const services: Array<{
    key: string;
    label: string;
    href: string | null;
    logo: JSX.Element;
  }> = [
    {
      key: "apple",
      label: "Apple Music",
      href: release.appleMusicUrl,
      // Apple Music brand pink/red gradient.
      logo: (
        <SiApplemusic size={52} style={{ color: "#FA243C" }} />
      ),
    },
    {
      key: "spotify",
      label: "Spotify",
      href: spotifyHref,
      // Spotify green (#1ED760 on black per their guidelines).
      logo: <SiSpotify size={52} style={{ color: "#1ED760" }} />,
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
        {/* Apple-style grabber handle — no X. Tap outside or drag to dismiss. */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-[5px] rounded-full bg-white/30" />
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
          <div className="flex items-center justify-center gap-6">
            {services.map((s) => {
              const isDisabled = !s.href;
              const tile = (
                <div
                  className="flex items-center justify-center rounded-[26px] transition-transform active:scale-[0.94]"
                  style={{
                    width: 104,
                    height: 104,
                    background: "#000",
                    opacity: isDisabled ? 0.35 : 1,
                    boxShadow: isDisabled
                      ? "none"
                      : "0 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {s.logo}
                </div>
              );
              if (isDisabled) {
                return (
                  <div
                    key={s.key}
                    role="button"
                    aria-disabled="true"
                    aria-label={`${s.label} not available for this release`}
                    className="cursor-not-allowed"
                    data-testid={`button-how-to-play-${s.key}-disabled`}
                  >
                    {tile}
                  </div>
                );
              }
              return (
                <a
                  key={s.key}
                  href={s.href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`button-how-to-play-${s.key}`}
                  aria-label={`Listen on ${s.label}`}
                >
                  {tile}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
