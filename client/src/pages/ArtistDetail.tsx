import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { ALBUMS, SONGS, ARTIST_PHOTOS, type Album } from "@/data/musicData";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import type { PersonDiscography, Album as DbAlbum } from "@shared/schema";
import appleMusicLogo from "@/assets/brand/apple-music.svg";
import spotifyLogo from "@/assets/brand/spotify.svg";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { track } from "@/lib/analytics";

export function ArtistDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { playSong } = usePlayer();
  const favArtists = useFavoriteArtists();

  const artistName = useMemo(() => {
    try { return decodeURIComponent(slug || ""); } catch { return slug || ""; }
  }, [slug]);

  // One artist_viewed per artist nav; tie to slug so back/forward emits again.
  useEffect(() => {
    if (artistName) track("artist_viewed", { artistName });
  }, [artistName]);

  // DB-backed albums. The fan ArtistDetail used to read only the
  // hardcoded `ALBUMS` from `@/data/musicData`, so anything Bill added
  // in admin (which writes to the `albums` table) never appeared on
  // the fan artist page. Now we union static + DB rows, matching the
  // artist by display name (case-insensitive), and dedupe by id so a
  // seeded static album that's also been imported into the DB doesn't
  // render twice.
  const { data: dbAlbums = [] } = useQuery<DbAlbum[]>({
    queryKey: ["/api/albums"],
  });
  const artistAlbums = useMemo<Album[]>(() => {
    const nameLc = artistName.trim().toLowerCase();
    const staticMatches = ALBUMS.filter(
      (a) => a.artist.trim().toLowerCase() === nameLc,
    );
    const seenIds = new Set(staticMatches.map((a) => a.id));
    // Convert DB Album → fan-side Album shape. The fan UI here only
    // touches { id, title, artist, artwork, year, type }; the rest of
    // the static Album fields (description / appleMusicUrl / etc.) are
    // not read on this page so we don't need to map them.
    const dbMatches = dbAlbums
      .filter(
        (a) =>
          !a.isHidden &&
          // Only actual GoodTunes-distributed releases. Streaming-imported
          // Apple/Spotify rows for the same artist are surfaced separately
          // via the discography section below and must not appear under
          // the "GoodTunes® Releases" header. See
          // docs/admin-conventions.md § "Streaming rows vs GoodTunes
          // releases".
          a.isGoodTunesRelease &&
          // Task #440 — Prepping shells (post-promote not yet flipped) are
          // admin-only; they must stay off the public artist page.
          !(a as any).isPrepping &&
          (a.artist ?? "").trim().toLowerCase() === nameLc &&
          !seenIds.has(a.id),
      )
      .map(
        (a) =>
          ({
            id: a.id,
            title: a.title,
            artist: a.artist ?? artistName,
            artwork: a.artwork ?? "",
            // `year` is non-optional on the fan-side Album shape but
            // DB rows can have it null (admin hasn't filled it in yet).
            // Use NaN as the "missing" sentinel — the album-tile meta
            // line below filters it back out so we never render "0".
            year: a.year ?? NaN,
            type: (a.type as Album["type"]) ?? "LP",
          }) as Album,
      );
    return [...staticMatches, ...dbMatches];
  }, [artistName, dbAlbums]);

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
  // `coverUrl` is the wide landscape banner uploaded from the admin
  // Person → Cover tab. Admin copy literally says "Used as the hero
  // banner on the fan-side artist page" — this surfaces it.
  type PublicPerson = {
    id: string;
    name: string;
    bio: string | null;
    photoUrl: string | null;
    coverUrl: string | null;
    // Task #190 — bands & members. When true we render the band's
    // current roster as an Apple-Music-style "Members" rail under About.
    isGroup?: boolean;
    groupKind?: string | null;
  };
  // Member row returned by /api/people/:id/members. Mirrors the shape
  // shared/schema.ts's BandMemberWithPerson exposes.
  type BandMemberRow = {
    id: string;
    bandId: string;
    memberId: string;
    roles: string[] | null;
    joinedYear: number | null;
    leftYear: number | null;
    displayOrder: number;
    memberName: string;
    memberPhotoUrl: string | null;
  };
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
  // Task #190 — when this artist is a band/duo/orchestra, fetch the
  // current roster so we can render a "Members" rail under About. The
  // endpoint already returns members ordered by displayOrder; we split
  // current (no leftYear) from former on the client.
  const isGroupArtist = !!artistPerson?.isGroup;
  const { data: bandMembers = [] } = useQuery<BandMemberRow[]>({
    queryKey: ["/api/people", artistPerson?.id, "members"],
    queryFn: async () => {
      if (!artistPerson?.id) return [];
      const r = await fetch(`/api/people/${artistPerson.id}/members`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!artistPerson?.id && isGroupArtist,
  });
  const currentMembers = useMemo(
    () => bandMembers.filter((m) => m.leftYear === null),
    [bandMembers],
  );
  const formerMembers = useMemo(
    () => bandMembers.filter((m) => m.leftYear !== null),
    [bandMembers],
  );

  // Task #191 — reverse direction: bands this person is a member of.
  // /api/people/:id/bands returns BandMemberWithPerson rows where the
  // joined Person fields describe the BAND (the other side of the
  // relation), so we can render "Member of: Steely Dan, Toto, …" on a
  // session player's page without a second fetch. Hidden entirely for
  // solo artists (no rows). Shape matches `BandMemberWithPerson` in
  // shared/schema.ts: flat memberName / memberPhotoUrl on the row.
  type MemberOfRow = {
    id: string;
    bandId: string;
    memberId: string;
    roles: string[] | null;
    joinedYear: number | null;
    leftYear: number | null;
    displayOrder: number;
    memberName: string;
    memberPhotoUrl: string | null;
    memberIsGroup: boolean;
  };
  const { data: memberOfBands = [] } = useQuery<MemberOfRow[]>({
    queryKey: ["/api/people", artistPerson?.id, "bands"],
    queryFn: async () => {
      if (!artistPerson?.id) return [];
      const r = await fetch(`/api/people/${artistPerson.id}/bands`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!artistPerson?.id,
  });
  const currentBands = useMemo(
    () => memberOfBands.filter((b) => b.leftYear === null),
    [memberOfBands],
  );
  const formerBands = useMemo(
    () => memberOfBands.filter((b) => b.leftYear !== null),
    [memberOfBands],
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
  // DB person fields win over the static asset map — once Bill uploads
  // a photo or cover in admin, the fan page picks it up immediately
  // without a code change. Cover is for the wide background banner
  // (treated less aggressively so it actually reads); photo is for
  // both the round avatar and the background fallback when no cover
  // has been uploaded yet.
  const artistPhoto = artistPerson?.photoUrl ?? ARTIST_PHOTOS[artistName];
  const avatarSrc = artistPhoto ?? heroArt;
  const coverBannerSrc = artistPerson?.coverUrl ?? null;
  const blurSrc = coverBannerSrc ?? artistPhoto ?? heroArt;
  // When the admin has uploaded a real wide cover, treat it as a hero
  // banner (taller, less aggressively dimmed) instead of just a blur
  // wash. Without a cover we keep the existing photo-blur behavior.
  const hasCoverBanner = Boolean(coverBannerSrc);
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
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <IconButton
          size="md"
          variant="dimmed"
          label="Back to collection"
          onClick={() => navigate("/collection")}
          className="absolute top-14 left-4 z-50"
          data-testid="button-back-artist"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </IconButton>

        <IconButton
          size="md"
          variant="dimmed"
          label={isFav ? "Unfavorite artist" : "Favorite artist"}
          aria-pressed={isFav}
          onClick={() => favArtists.toggle(artistName)}
          className="absolute top-14 right-4 z-50"
          data-testid="button-favorite-artist"
        >
          <svg viewBox="0 0 24 24" fill={isFav ? "#FF5470" : "none"} stroke={isFav ? "#FF5470" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </IconButton>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }}>
          {/* Hero banner. Sits INSIDE the scroll container so it scrolls
              with the page (matching the admin Cover preview). Uploaded
              wide-landscape covers render crisp — same gradient fade as
              the preview, no blur. The photo-only fallback (no cover
              uploaded yet) keeps its heavy blur because it's a wash,
              not a banner. */}
          {blurSrc && (
            <div
              className="relative w-full overflow-hidden pointer-events-none"
              style={{ aspectRatio: hasCoverBanner ? "1 / 1.05" : "1 / 0.82" }}
              aria-hidden
            >
              <img
                src={blurSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={
                  hasCoverBanner
                    ? undefined
                    : { filter: "blur(28px) saturate(160%)", transform: "scale(1.15)" }
                }
              />
              <div
                className="absolute inset-0"
                style={{
                  background: hasCoverBanner
                    ? "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, #00062B 70%, #00062B 100%)"
                    : "linear-gradient(to bottom, rgba(0,6,43,0.20) 0%, rgba(0,6,43,0.70) 60%, #00062B 100%)",
                }}
              />
            </div>
          )}
          <div
            className={`flex flex-col items-center px-5 relative ${
              blurSrc ? "-mt-28" : "pt-20"
            }`}
          >
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
              <h2 className="text-white text-xl font-bold tracking-tight mb-3">GoodTunes&reg; Releases</h2>
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
                    <p className="text-white/50 text-xs truncate mt-0.5">{[Number.isFinite(album.year) ? album.year : null, album.type].filter(Boolean).join(" · ")}</p>
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
                // Rule: only show the chevron + make the heading tappable
                // when the bucket has more than 5 items. With ≤5 the whole
                // bucket already fits on screen, so there's nothing to
                // "see all" and the chevron just adds noise.
                const showChevron = bucket.items.length > 5;
                return (
                  <div key={bucket.label} className="mb-7 last:mb-0">
                    {showChevron ? (
                      <button
                        type="button"
                        onClick={() => setOpenBucket(bucket)}
                        className="flex items-center px-5 mb-3 text-left active:opacity-70"
                        data-testid={`button-bucket-${bucket.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <h2 className="text-white text-xl font-bold tracking-tight flex items-center gap-1.5">
                          {bucket.label}
                          <ChevronRight className="w-5 h-5 text-white/40" />
                        </h2>
                      </button>
                    ) : (
                      <h2
                        className="text-white text-xl font-bold tracking-tight px-5 mb-3"
                        data-testid={`heading-bucket-${bucket.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {bucket.label}
                      </h2>
                    )}
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

          {/* Task #190 — Members rail. Only shown for groups. Tapping a
              member routes to their own ArtistDetail page (keyed by
              display name, same as everywhere else in the app). */}
          {isGroupArtist && currentMembers.length > 0 && (
            <div className="px-5 mt-9" data-testid="section-band-members">
              <h2 className="text-white text-xl font-bold tracking-tight mb-3">
                Members
              </h2>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                {currentMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => navigate(`/artist/${encodeURIComponent(m.memberName)}`)}
                    className="flex-shrink-0 flex flex-col items-center text-center w-[88px] active:opacity-80"
                    data-testid={`band-member-${m.memberId}`}
                  >
                    <div className="w-[72px] h-[72px] rounded-full overflow-hidden bg-white/5">
                      {m.memberPhotoUrl ? (
                        <img
                          src={m.memberPhotoUrl}
                          alt={m.memberName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <p className="text-white text-[12px] font-semibold mt-2 leading-tight line-clamp-2">
                      {m.memberName}
                    </p>
                    {m.roles && m.roles.length > 0 && (
                      <p className="text-white/55 text-[10.5px] leading-tight mt-0.5 line-clamp-2">
                        {m.roles.join(", ")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {formerMembers.length > 0 && (
                <details className="mt-3 text-white/55 text-[12px]">
                  <summary
                    className="cursor-pointer text-white/65 font-semibold"
                    data-testid="toggle-former-members"
                  >
                    Former members
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {formerMembers.map((m) => (
                      <li key={m.id} data-testid={`former-member-${m.memberId}`}>
                        <button
                          type="button"
                          onClick={() => navigate(`/artist/${encodeURIComponent(m.memberName)}`)}
                          className="text-left active:opacity-70"
                        >
                          <span className="text-white/85">{m.memberName}</span>
                          {m.roles && m.roles.length > 0 && (
                            <span className="text-white/45"> — {m.roles.join(", ")}</span>
                          )}
                          {(m.joinedYear || m.leftYear) && (
                            <span className="text-white/40">
                              {" "}({m.joinedYear ?? "?"}–{m.leftYear ?? ""})
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Task #191 — "Member of" rail (reverse direction of the
              Members rail above). Lists every band this person currently
              belongs to, with a "Formerly with" disclosure for past
              memberships. Hidden entirely for solo artists (no rows
              returned). Tapping a band routes to its ArtistDetail page. */}
          {memberOfBands.length > 0 && (
            <div className="px-5 mt-9" data-testid="section-member-of-bands">
              <h2 className="text-white text-xl font-bold tracking-tight mb-3">
                Member of
              </h2>
              {currentBands.length > 0 && (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
                {currentBands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => navigate(`/artist/${encodeURIComponent(b.memberName)}`)}
                    className="flex-shrink-0 flex flex-col items-center text-center w-[88px] active:opacity-80"
                    data-testid={`member-of-band-${b.bandId}`}
                  >
                    <div className="w-[72px] h-[72px] rounded-full overflow-hidden bg-white/5">
                      {b.memberPhotoUrl ? (
                        <img
                          src={b.memberPhotoUrl}
                          alt={b.memberName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <p className="text-white text-xs font-semibold mt-2 leading-tight line-clamp-2">
                      {b.memberName}
                    </p>
                    {b.roles && b.roles.length > 0 && (
                      <p className="text-white/55 text-xs leading-tight mt-0.5 line-clamp-2">
                        {b.roles.join(", ")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              )}
              {formerBands.length > 0 && (
                <details className="mt-3 text-white/55 text-xs">
                  <summary
                    className="cursor-pointer text-white/65 font-semibold"
                    data-testid="toggle-formerly-with"
                  >
                    Formerly with
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {formerBands.map((b) => (
                      <li key={b.id} data-testid={`formerly-with-band-${b.bandId}`}>
                        <button
                          type="button"
                          onClick={() => navigate(`/artist/${encodeURIComponent(b.memberName)}`)}
                          className="text-left active:opacity-70"
                        >
                          <span className="text-white/85">{b.memberName}</span>
                          {b.roles && b.roles.length > 0 && (
                            <span className="text-white/45"> — {b.roles.join(", ")}</span>
                          )}
                          {(b.joinedYear || b.leftYear) && (
                            <span className="text-white/40">
                              {" "}({b.joinedYear ?? "?"}–{b.leftYear ?? ""})
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

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
  // Apple Music + Spotify identity-compliant: official app icons used
  // as-supplied, never recolored, never re-wrapped in a brand-colored
  // container. Rendered as plain <img> from the SVGs we host locally.
  // - Apple Music identity: marketing.services.apple/apple-music-identity-guidelines
  // - Spotify design guidelines: developer.spotify.com/documentation/design
  const services: Array<{
    key: string;
    label: string;
    href: string | null;
    logoSrc: string;
  }> = [
    {
      key: "apple",
      label: "Apple Music",
      href: release.appleMusicUrl,
      logoSrc: appleMusicLogo,
    },
    {
      key: "spotify",
      label: "Spotify",
      href: spotifyHref,
      logoSrc: spotifyLogo,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 backdrop-blur-md"
      onClick={onClose}
      data-testid="sheet-how-to-play"
    >
      <div
        className="relative w-full max-w-[440px] bg-[#F4F5F8] text-[#0B0F2A] pb-9 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderTopLeftRadius: 38,
          borderTopRightRadius: 38,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Apple's sheet dismiss — circular glass chip inset from the
            corner (not hugging it). On a light sheet the scrim is a
            soft black/8% with a near-black X. */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          data-testid="button-how-to-play-close"
          className="absolute flex items-center justify-center rounded-full active:scale-[0.94] transition-transform"
          style={{
            right: 22,
            top: 26,
            width: 30,
            height: 30,
            background: "rgba(11,15,42,0.06)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={14} strokeWidth={2.4} style={{ color: "rgba(11,15,42,0.7)" }} />
        </button>

        {/* Centered hero: large rounded album art + title + meta */}
        <div className="flex flex-col items-center text-center px-6 pt-7 pb-6">
          {release.artworkUrl ? (
            <img
              src={release.artworkUrl}
              alt={release.name}
              className="w-44 h-44 rounded-2xl object-cover"
              style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}
            />
          ) : (
            <div
              className="w-44 h-44 rounded-2xl bg-[#0B0F2A]/5"
              style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.25)" }}
            />
          )}
          <h3 className="text-[20px] font-bold tracking-tight mt-5 leading-tight">
            {release.name}
          </h3>
          <p className="text-[13px] mt-1" style={{ color: "rgba(11,15,42,0.55)" }}>
            {artistName}
            {release.year ? ` · ${release.year}` : ""}
          </p>
        </div>

        {/* How to Play — two translucent rows, each carrying the
            service's official app icon at 44px + name + "Listen now"
            + a trailing chevron. Identity-compliant: no recolor,
            no extra brand container. */}
        <div className="px-5">
          <h4
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-center mb-4"
            style={{ color: "rgba(11,15,42,0.5)" }}
          >
            How to Play
          </h4>
          <div className="flex flex-col gap-2.5">
            {services.map((s) => {
              const isDisabled = !s.href;
              const rowInner = (
                <>
                  <img
                    src={s.logoSrc}
                    alt=""
                    width={44}
                    height={44}
                    className="flex-shrink-0 block"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-[16px] font-semibold leading-tight">
                      {s.label}
                    </div>
                    <div
                      className="text-[12px] font-normal leading-tight mt-0.5"
                      style={{ color: "rgba(11,15,42,0.55)" }}
                    >
                      {isDisabled ? "Not available for this release" : "Listen now"}
                    </div>
                  </div>
                  <ChevronRight
                    size={20}
                    style={{ color: "rgba(11,15,42,0.35)" }}
                    className="flex-shrink-0"
                  />
                </>
              );
              const rowStyle = {
                background: "rgba(11,15,42,0.05)",
                border: "1px solid rgba(11,15,42,0.08)",
                borderRadius: 18,
                opacity: isDisabled ? 0.5 : 1,
              } as const;
              if (isDisabled) {
                return (
                  <div
                    key={s.key}
                    role="button"
                    aria-disabled="true"
                    aria-label={`${s.label} not available for this release`}
                    className="flex items-center gap-3.5 px-4 py-3 cursor-not-allowed"
                    style={rowStyle}
                    data-testid={`button-how-to-play-${s.key}-disabled`}
                  >
                    {rowInner}
                  </div>
                );
              }
              return (
                <a
                  key={s.key}
                  href={s.href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3.5 px-4 py-3 active:scale-[0.99] transition-transform"
                  style={rowStyle}
                  data-testid={`button-how-to-play-${s.key}`}
                  aria-label={`Listen on ${s.label}`}
                >
                  {rowInner}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
