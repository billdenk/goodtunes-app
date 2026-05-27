import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { BottomNav } from "@/components/BottomNav";
import { IconButton } from "@/components/ui/IconButton";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { track } from "@/lib/analytics";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { useRecordRecent } from "@/hooks/useRecents";
import { chatEnabled } from "@/lib/platform";
import { subscribeChats, totalUnread } from "@/lib/chatStore";
import { ARTIST_PHOTOS, type Album, type Song } from "@/data/musicData";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { Disc3, Music2, Mic2 } from "lucide-react";
import certBgUrl from "@assets/Digital_GoodDeed_-_Nick_Carter_1778545442175.svg";

interface UserPlaylist {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  artworks?: string[];
  songCount?: number;
}

type SongWithAlbum = Song & { album: Album };

type LibraryTab = "albums" | "songs" | "artists";

export function Collection() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const favArtists = useFavoriteArtists();
  const { playSong, currentSong, recentAlbums, setShowPlayer } = usePlayer();
  const [certAlbum, setCertAlbum] = useState<Album | null>(null);
  const [tab, setTab] = useState<LibraryTab>("albums");
  // Task #530 — inline library search retired in favour of the global
  // /search destination on the right of the bottom nav. We keep the
  // `search` constant as an empty string so the existing filter
  // pipeline below stays a no-op transform and we don't have to rewrite
  // every memo at once.
  const search = "";
  const [showSort, setShowSort] = useState(false);
  const recordRecent = useRecordRecent();
  // Chat tab is gone from the bottom nav (Task #530); the unread count
  // now lives as a red dot on the account avatar in the header. Force
  // a re-render whenever the chat store changes so the dot stays
  // honest.
  const [, setUnreadTick] = useState(0);
  useEffect(() => subscribeChats(() => setUnreadTick((n) => n + 1)), []);
  const unread = chatEnabled ? totalUnread() : 0;
  const avatarInitials = (user?.displayName || user?.username || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SongWithAlbum | null>(null);
  // iOS Safari renderer-OOM mitigation: cap the rendered list so we never
  // paint hundreds of song/album/artist rows at once (each pulls album
  // artwork + animation state). User taps "Show more" to extend in 60-row
  // chunks. Resets when the tab or search query changes.
  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => { setVisibleCount(60); }, [tab, search]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: playlistsRaw } = useQuery<UserPlaylist[] | null>({
    queryKey: ["/api/playlists"],
  });
  const userPlaylists = playlistsRaw ?? [];

  // Catalog albums + songs come from the DB so anything added through
  // the admin CMS (e.g. Visionary Apothecary) shows up immediately. The
  // shared queryClient default has staleTime: Infinity, so this fetches
  // once per session and is reused by every other surface that calls the
  // same queryKey (AlbumDetail's /api/albums/:id, PlayerContext's
  // /api/songs hydrate map, etc.).
  const { data: albumsRaw } = useQuery<Album[]>({
    queryKey: ["/api/albums"],
  });
  const { data: songsRaw } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });
  // The /api/albums endpoint returns BOTH GoodTunes-curated releases and
  // the streaming-only discography rows we ingest from Apple Music (used
  // to power the artist sheet's "How to Play" links). The main Collection
  // is the curated catalog only — hide every row where `isGoodTunesRelease`
  // is false. Songs + artists derive from this filtered list so the
  // Songs tab and Artists tab also stay catalog-only.
  const dbAlbums = useMemo(
    // Task #440 — "Prepping" GT shells (created by + Add Album but not yet
    // promoted to Released) must stay off the fan-side Collection. Once the
    // admin flips isPrepping=false on the album page, the row appears here.
    () => (albumsRaw ?? []).filter((a) => a.isGoodTunesRelease && !(a as any).isPrepping),
    [albumsRaw],
  );
  const dbAlbumIds = useMemo(
    () => new Set(dbAlbums.map((a) => a.id)),
    [dbAlbums],
  );
  const dbSongs = useMemo(
    () => (songsRaw ?? []).filter((s) => dbAlbumIds.has(s.albumId)),
    [songsRaw, dbAlbumIds],
  );

  // Stamp a fan-recent every time we open an album from Collection (the
  // grid card, the carousel rail, or the song row's parent-album link).
  const openAlbum = (album: Album) => {
    recordRecent({
      entityKind: "album",
      entityId: album.id,
      title: album.title,
      subtitle: album.artist,
      thumbUrl: album.artwork ?? null,
      href: `/album/${album.id}`,
    });
    navigate(`/album/${album.id}`);
  };
  const openArtist = (name: string, photo?: string | null) => {
    recordRecent({
      entityKind: "artist",
      entityId: name,
      title: name,
      subtitle: "Artist",
      thumbUrl: photo ?? null,
      href: `/artist/${encodeURIComponent(name)}`,
    });
    navigate(`/artist/${encodeURIComponent(name)}`);
  };

  const addSongMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: string; songId: string }) => {
      const res = await apiRequest("POST", `/api/playlists/${playlistId}/songs`, { songId });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", vars.playlistId, "songs"] });
      const pl = userPlaylists.find((p) => p.id === vars.playlistId);
      toast({
        title: pl ? `Added to ${pl.name}` : "Added to Playlist",
        action: (
          <ToastAction
            altText="Go to Playlist"
            onClick={() => {
              setShowPlayer(false);
              navigate(`/playlists?playlist=${encodeURIComponent(vars.playlistId)}`);
            }}
          >
            Go to Playlist
          </ToastAction>
        ),
      });
      setAddToPlaylistSong(null);
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't add song",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const [sortByMap, setSortByMap] = useState<Record<LibraryTab, string>>({
    albums: "title",
    songs: "title",
    artists: "name-asc",
  });

  const sortOptions: Record<LibraryTab, { value: string; label: string }[]> = {
    albums: [
      { value: "title", label: "Title" },
      { value: "artist", label: "Artist" },
    ],
    songs: [
      { value: "title", label: "Title" },
      { value: "artist", label: "Artist" },
    ],
    artists: [
      { value: "name-asc", label: "A–Z" },
      { value: "name-desc", label: "Z–A" },
    ],
  };

  const sortBy = sortByMap[tab];
  const setSortBy = (v: string) => setSortByMap((m) => ({ ...m, [tab]: v }));

  const allSongsWithAlbum = useMemo(
    () =>
      dbSongs.map((s) => ({ ...s, album: dbAlbums.find((a) => a.id === s.albumId)! })).filter(
        (s) => s.album,
      ),
    [dbAlbums, dbSongs],
  );

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; albums: Album[] }>();
    dbAlbums.forEach((a) => {
      const cur = map.get(a.artist) ?? { name: a.artist, albums: [] };
      cur.albums.push(a);
      map.set(a.artist, cur);
    });
    return Array.from(map.values());
  }, [dbAlbums]);

  const q = search.trim().toLowerCase();

  const filteredAlbums = useMemo(() => {
    const list = q
      ? dbAlbums.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
      : [...dbAlbums];
    return list.sort((a, b) =>
      sortBy === "artist" ? a.artist.localeCompare(b.artist) : a.title.localeCompare(b.title),
    );
  }, [q, sortBy, dbAlbums]);

  const filteredSongs = useMemo(() => {
    const list = q
      ? allSongsWithAlbum.filter(
          (s) => s.title.toLowerCase().includes(q) || s.album.artist.toLowerCase().includes(q),
        )
      : [...allSongsWithAlbum];
    return list.sort((a, b) =>
      sortBy === "artist" ? a.album.artist.localeCompare(b.album.artist) : a.title.localeCompare(b.title),
    );
  }, [q, sortBy, allSongsWithAlbum]);

  const artistsSort = sortByMap.artists;
  const filteredArtists = useMemo(() => {
    const list = q ? artists.filter((ar) => ar.name.toLowerCase().includes(q)) : [...artists];
    return list.sort((a, b) =>
      artistsSort === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );
  }, [q, artists, artistsSort]);

  const sortLabel = sortOptions[tab].find((o) => o.value === sortBy)?.label ?? "";

  // Fire search_performed once the user pauses typing for 500ms. Debounce
  // keeps the analytics_events table from being spammed on every keystroke
  // and matches the moment we'd want a "what's in the result set" snapshot
  // (i.e. once the list has settled).
  useEffect(() => {
    if (!q) return;
    const t = setTimeout(() => {
      const counts: Record<string, number> = {
        albums: filteredAlbums.length,
        songs: filteredSongs.length,
        artists: filteredArtists.length,
      };
      track("search_performed", { query: q, tab, resultCount: counts[tab] ?? 0 });
    }, 500);
    return () => clearTimeout(t);
  }, [q, tab, filteredAlbums.length, filteredSongs.length, filteredArtists.length]);

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden lg:justify-start lg:pl-[260px]">
      <section className="relative w-full max-w-[390px] md:max-w-[760px] lg:max-w-[1200px] lg:mx-auto h-screen text-white flex flex-col">

        <header className="relative z-10 flex items-end justify-between px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Collection</h1>
          {/* Task #530 — account avatar lives top-right. Unread chat
              count (Chat tab was retired from the bottom nav) shows as
              a small red dot on the avatar so the inbox stays
              discoverable without a dedicated tab. */}
          <button
            type="button"
            onClick={() => navigate("/account")}
            aria-label="Account"
            className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center active:opacity-70"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)" }}
            data-testid="button-open-account"
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-semibold">{avatarInitials}</span>
            )}
            {unread > 0 && (
              <span
                aria-label={`${unread} unread messages`}
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: "#FF5470", border: "1.5px solid #00062B" }}
                data-testid="badge-account-unread"
              />
            )}
          </button>
        </header>

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
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
                    onClick={() => openAlbum(album)}
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
                      <img src={album.artwork} alt={album.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-[11px] font-semibold truncate leading-tight text-left">{album.title}</p>
                    <p className="text-white/45 text-[10px] truncate leading-tight text-left mt-0.5">{album.artist}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Task #530 — segmented tabs sit inline with the sort
              ("filter") IconButton on the right. The standalone library
              search row is gone — fans tap the search circle in the
              bottom nav to land on /search instead. */}
          <div className="px-5 mb-4 flex items-center gap-2">
            {/* Task #530 — Filter sits to the LEFT of the segmented
                control, matching Apple Music's "filter then category"
                reading order on the library screen. */}
            <div className="relative flex-shrink-0">
              <IconButton
                onClick={() => setShowSort((s) => !s)}
                label="Filter"
                data-testid="button-sort"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M3 6h18M6 12h12M10 18h4" />
                </svg>
              </IconButton>
              {showSort && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSort(false)} />
                  <div
                    className="absolute right-0 top-full mt-1.5 z-40 rounded-xl py-1 min-w-[180px]"
                    style={{
                      background: "rgba(36, 36, 40, 0.96)",
                      backdropFilter: "blur(24px) saturate(180%)",
                      WebkitBackdropFilter: "blur(24px) saturate(180%)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      Sort by
                    </div>
                    {sortOptions[tab].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setSortBy(opt.value); setShowSort(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-white active:bg-white/10"
                        data-testid={`sort-${opt.value}`}
                      >
                        <span className="w-4 flex-shrink-0 flex items-center justify-center">
                          {sortBy === opt.value && (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="relative flex flex-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="absolute top-1 bottom-1 rounded-lg transition-all duration-200"
                style={{
                  width: "calc(33.333% - 3px)",
                  left: tab === "albums" ? "4px" : tab === "songs" ? "calc(33.333% + 1px)" : "calc(66.666% - 2px)",
                  background: "rgba(49,158,216,0.22)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              />
              {(["albums", "songs", "artists"] as LibraryTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`relative flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-colors duration-150 ${tab === t ? "text-[#319ED8]" : "text-white/45"}`}
                  data-testid={`tab-${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tab === "albums" && (
            <div className="px-5 pb-4">
              {filteredAlbums.length === 0 ? (
                search ? (
                  <p className="text-white/35 text-sm text-center mt-8" data-testid="text-empty-albums-search">No albums match "{search}"</p>
                ) : (
                  <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-albums">
                    <Disc3 className="w-10 h-10 text-white/25" strokeWidth={1.5} />
                    <p className="text-white/55 text-sm">No Albums yet</p>
                  </div>
                )
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {filteredAlbums.slice(0, visibleCount).map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={album}
                        isCurrentlyPlaying={currentSong?.albumId === album.id}
                        onPress={() => openAlbum(album)}
                        onCertPress={() => setCertAlbum(album)}
                      />
                    ))}
                  </div>
                  {filteredAlbums.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + 60)}
                      className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-[#319ED8] active:opacity-60 transition-opacity"
                      style={{ background: "rgba(49,158,216,0.12)" }}
                      data-testid="button-show-more-albums"
                    >
                      Show more ({filteredAlbums.length - visibleCount} left)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "songs" && (
            <div className="px-5 pb-4 flex flex-col">
              {filteredSongs.length === 0 && (
                search ? (
                  <p className="text-white/35 text-sm text-center mt-8" data-testid="text-empty-songs-search">No songs match "{search}"</p>
                ) : (
                  <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-songs">
                    <Music2 className="w-10 h-10 text-white/25" strokeWidth={1.5} />
                    <p className="text-white/55 text-sm">No Songs yet</p>
                  </div>
                )
              )}
              {filteredSongs.slice(0, visibleCount).map((song, idx, visibleSongs) => {
                const isActive = currentSong?.id === song.id;
                return (
                  <div
                    key={song.id}
                    className="flex items-center gap-3 py-2.5"
                    style={{
                      borderBottom: idx < visibleSongs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                    data-testid={`row-song-${song.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (q) track("search_result_clicked", { kind: "song", songId: song.id, albumId: song.album.id, query: q });
                        playSong(song, filteredSongs);
                      }}
                      className="flex items-center gap-3 flex-1 min-w-0 active:opacity-60 transition-opacity text-left"
                      data-testid={`button-play-song-${song.id}`}
                    >
                      <img src={song.album.artwork} alt={song.album.title} loading="lazy" decoding="async" className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate leading-tight ${isActive ? "text-[#319ED8]" : "text-white"}`}>{song.title}</p>
                        <p className="text-white/45 text-xs truncate leading-tight mt-0.5">{song.album.artist}</p>
                      </div>
                      {isActive && (
                        <div className="flex gap-[2px] items-end h-3.5 mr-1">
                          {[0.6, 1, 0.75].map((h, i) => (
                            <div
                              key={i}
                              className="w-[2px] rounded-full"
                              style={{
                                background: "#319ED8",
                                height: `${h * 100}%`,
                                animation: "equalizerBounce 0.8s ease-in-out infinite alternate",
                                animationDelay: `${i * 0.2}s`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAddToPlaylistSong(song); }}
                      aria-label={`Add ${song.title} to a playlist`}
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 active:scale-[0.94] transition-transform"
                      style={{ background: "rgba(49,158,216,0.22)" }}
                      data-testid={`button-add-to-playlist-${song.id}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              {filteredSongs.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 60)}
                  className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-[#319ED8] active:opacity-60 transition-opacity"
                  style={{ background: "rgba(49,158,216,0.12)" }}
                  data-testid="button-show-more-songs"
                >
                  Show more ({filteredSongs.length - visibleCount} left)
                </button>
              )}
            </div>
          )}

          {tab === "artists" && (() => {
            const anyFavorited = filteredArtists.some((a) => favArtists.has(a.name));
            return (
            <div className="px-5 pb-4 flex flex-col">
              {filteredArtists.length === 0 && (
                search ? (
                  <p className="text-white/35 text-sm text-center mt-8" data-testid="text-empty-artists-search">No artists match "{search}"</p>
                ) : (
                  <div className="text-center mt-16 px-6 flex flex-col items-center gap-3" data-testid="text-empty-artists">
                    <Mic2 className="w-10 h-10 text-white/25" strokeWidth={1.5} />
                    <p className="text-white/55 text-sm">No Artists yet</p>
                  </div>
                )
              )}
              {filteredArtists.slice(0, visibleCount).map((artist, idx, visibleArtists) => {
                const isFav = favArtists.has(artist.name);
                return (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => openArtist(artist.name, ARTIST_PHOTOS[artist.name] ?? artist.albums[0]?.artwork ?? null)}
                    className="flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left"
                    style={{
                      borderBottom: idx < visibleArtists.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                    data-testid={`row-artist-${artist.name}`}
                  >
                    {anyFavorited && (
                      <div className="w-4 flex-shrink-0 flex items-center justify-center">
                        {isFav && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#FF5470" aria-label="Favorited">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        )}
                      </div>
                    )}
                    {(() => {
                      const photo = ARTIST_PHOTOS[artist.name];
                      return (
                        <img
                          src={photo ?? artist.albums[0].artwork}
                          alt={artist.name}
                          loading="lazy"
                          decoding="async"
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                          style={{
                            border: "1px solid rgba(255,255,255,0.1)",
                            ...(photo ? { objectPosition: "50% 20%" } : {}),
                          }}
                        />
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate leading-tight">{artist.name}</p>
                      <p className="text-white/45 text-xs truncate leading-tight mt-0.5">
                        {artist.albums.length} {artist.albums.length === 1 ? "album" : "albums"}
                      </p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" />
                    </svg>
                  </button>
                );
              })}
              {filteredArtists.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 60)}
                  className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-[#319ED8] active:opacity-60 transition-opacity"
                  style={{ background: "rgba(49,158,216,0.12)" }}
                  data-testid="button-show-more-artists"
                >
                  Show more ({filteredArtists.length - visibleCount} left)
                </button>
              )}
            </div>
            );
          })()}
        </div>

        <MiniPlayer />
        <BottomNav />

        {addToPlaylistSong && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              style={{ backdropFilter: "blur(4px)" }}
              onClick={() => setAddToPlaylistSong(null)}
            />
            <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-6 z-10 flex flex-col" style={{ maxHeight: "78vh" }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
              <div className="flex items-center justify-between px-5 mb-3 flex-shrink-0">
                <h3 className="text-white font-semibold text-base">Add to Playlist</h3>
                <button
                  type="button"
                  onClick={() => setAddToPlaylistSong(null)}
                  className="text-[#319ED8] text-sm font-semibold"
                  data-testid="button-close-add-to-playlist"
                >
                  Cancel
                </button>
              </div>
              <div className="flex items-center gap-3 px-5 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <img src={addToPlaylistSong.album.artwork} alt={addToPlaylistSong.album.title} loading="lazy" decoding="async" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate leading-tight">{addToPlaylistSong.title}</p>
                  <p className="text-white/45 text-xs truncate leading-tight mt-0.5">{addToPlaylistSong.album.artist}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
                {userPlaylists.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-white/45 text-sm">No playlists yet</p>
                    <button
                      type="button"
                      onClick={() => { setAddToPlaylistSong(null); navigate("/playlists"); }}
                      className="text-[#319ED8] text-sm font-semibold mt-3"
                      data-testid="button-go-create-playlist"
                    >
                      Create one
                    </button>
                  </div>
                ) : (
                  userPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      disabled={addSongMutation.isPending}
                      onClick={() => addSongMutation.mutate({ playlistId: pl.id, songId: addToPlaylistSong.id })}
                      className="w-full flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left disabled:opacity-50"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                      data-testid={`button-pick-playlist-${pl.id}`}
                    >
                      <div className="w-11 h-11 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                        {pl.artworks && pl.artworks[0] ? (
                          <img src={pl.artworks[0]} alt={pl.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round">
                            <path d="M9 17V5l12-2v12M9 17a3 3 0 11-3-3 3 3 0 013 3zM21 15a3 3 0 11-3-3 3 3 0 013 3z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate leading-tight">{pl.name}</p>
                        <p className="text-white/45 text-xs truncate leading-tight mt-0.5">
                          {pl.songCount ?? 0} {(pl.songCount ?? 0) === 1 ? "song" : "songs"}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {certAlbum && (
          <GoodDeedCertificate
            album={certAlbum}
            ownerName={user?.displayName || "GoodTunes Fan"}
            identities={{
              realName: user?.realName ?? null,
              displayName: user?.displayName || "GoodTunes Fan",
              username: user?.username || "you",
            }}
            certificateNumber={certAlbum.certificateNumber ?? 1}
            certificateNumbers={certAlbum.ownedCertificates}
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
  const ownedCount = album.ownedCertificates?.length ?? 1;
  const isMulti = ownedCount > 1;
  return (
    <div className="flex flex-col">
      <div className="relative aspect-square">
        {isMulti && (
          <>
            <div
              aria-hidden
              className="absolute inset-0 rounded-2xl overflow-hidden"
              style={{
                transform: "rotate(-6deg) translate(-6px, -4px) scale(0.94)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
                zIndex: 0,
              }}
            >
              <img src={album.artwork} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-85" />
            </div>
            {ownedCount > 2 && (
              <div
                aria-hidden
                className="absolute inset-0 rounded-2xl overflow-hidden"
                style={{
                  transform: "rotate(5deg) translate(6px, -3px) scale(0.96)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  zIndex: 1,
                }}
              >
                <img src={album.artwork} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-90" />
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onPress}
          className="relative z-10 w-full h-full rounded-2xl overflow-hidden active:scale-[0.97] transition-transform"
          style={{
            boxShadow: isCurrentlyPlaying
              ? "0 0 0 2px #319ED8, 0 4px 20px rgba(0,0,0,0.4)"
              : "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
        <img src={album.artwork} alt={album.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
          {/* LP/EP/Single chip hidden for now — the format wasn't earning
              its place in the corner of the artwork (Bill: "we can hide
              all of the LP/EP on the album covers for now"). Type still
              lives on the album record and on the admin preview's
              metadata line; we can bring it back to the cover later if
              we ever need format-as-filter on the consumer surface. */}
          {isMulti && (
            <div className="absolute top-2 right-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: "rgba(74,255,202,0.2)", color: "#4AFFCA", border: "1px solid rgba(74,255,202,0.35)", backdropFilter: "blur(4px)" }}
                data-testid={`badge-owned-${album.id}`}
              >
                ×{ownedCount}
              </span>
            </div>
          )}
        </button>
      </div>
      <div className="mt-2 px-0.5">
        {/* Apple Music album-card typography. Two-tier contrast:
            - Title: 15px / semibold / 100% white
            - Artist: 13px / regular / ~55% white so the secondary line
              clearly reads as metadata. Earlier 65% looked nearly
              identical to the title on the dark `#00062B` background
              — Apple's secondary label color sits around 55–60% white
              on dark, and the title's bold weight + size already does
              part of the lifting, so we can go a bit dimmer here.
            The "E" pill sits inline with the title; the title gets
            `flex-1 min-w-0` so long titles ellipsize cleanly without
            pushing the badge off the row. */}
        <div className="flex items-center gap-2.5 min-w-0">
          <p
            className="flex-1 min-w-0 text-white text-[15px] font-semibold leading-tight truncate"
            data-testid={`text-album-title-${album.id}`}
          >
            {album.title}
          </p>
          {album.isExplicit && <ExplicitBadge />}
        </div>
        <p
          className="text-[13px] font-normal truncate mt-0.5"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          {album.artist}
        </p>
      </div>
    </div>
  );
}
