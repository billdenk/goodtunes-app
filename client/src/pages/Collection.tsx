import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { ALBUMS, SONGS, type Album } from "@/data/musicData";
import certBgUrl from "@assets/Digital_GoodDeed_-_Nick_Carter_1778545442175.svg";

type LibraryTab = "albums" | "songs" | "artists";

export function Collection() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { playSong, currentSong, recentAlbums } = usePlayer();
  const [certAlbum, setCertAlbum] = useState<Album | null>(null);
  const [tab, setTab] = useState<LibraryTab>("albums");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const closeSearch = () => {
    setSearch("");
    setSearchOpen(false);
  };
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
      SONGS.map((s) => ({ ...s, album: ALBUMS.find((a) => a.id === s.albumId)! })).filter(
        (s) => s.album,
      ),
    [],
  );

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; albums: Album[] }>();
    ALBUMS.forEach((a) => {
      const cur = map.get(a.artist) ?? { name: a.artist, albums: [] };
      cur.albums.push(a);
      map.set(a.artist, cur);
    });
    return Array.from(map.values());
  }, []);

  const q = search.trim().toLowerCase();

  const filteredAlbums = useMemo(() => {
    const list = q
      ? ALBUMS.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
      : [...ALBUMS];
    return list.sort((a, b) =>
      sortBy === "artist" ? a.artist.localeCompare(b.artist) : a.title.localeCompare(b.title),
    );
  }, [q, sortBy]);

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

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <main className="h-screen w-full bg-[#00062B] flex justify-center overflow-hidden">
      <section
        className="relative w-full max-w-[390px] h-screen text-white flex flex-col"
        style={{
          backgroundColor: "#00062B",
          backgroundImage: `url(${certBgUrl})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
        }}
      >

        <header className="relative z-10 flex items-end px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Collection</h1>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
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

          <div className="px-5 mb-3 flex items-center justify-end gap-2 min-h-[32px]">
            {searchOpen ? (
              <div className="flex items-center gap-2 w-full animate-in fade-in duration-150">
                <div className="relative flex items-center flex-1" style={{ background: "rgba(255,255,255,0.09)", borderRadius: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.2" strokeLinecap="round" className="ml-3 flex-shrink-0">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${tab}`}
                    className="flex-1 bg-transparent border-0 px-2.5 py-2 text-white placeholder-white/35 text-sm focus:outline-none"
                    data-testid="input-library-search"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="mr-2 w-5 h-5 flex items-center justify-center rounded-full"
                      style={{ background: "rgba(255,255,255,0.18)" }}
                      data-testid="button-clear-search"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeSearch}
                  className="text-[#319ED8] text-sm font-medium px-1 active:opacity-60 transition-opacity"
                  data-testid="button-cancel-search"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search"
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                  data-testid="button-search-toggle"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSort((s) => !s)}
                    aria-label="Sort"
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform"
                    style={{ background: "rgba(255,255,255,0.10)" }}
                    data-testid="button-sort"
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M3 6h18M6 12h12M10 18h4" />
                    </svg>
                  </button>
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
              </>
            )}
          </div>

          <div className="px-5 mb-4">
            <div className="relative flex p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }}>
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
                <p className="text-white/35 text-sm text-center mt-8">No albums match "{search}"</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {filteredAlbums.map((album) => (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      isCurrentlyPlaying={currentSong?.albumId === album.id}
                      onPress={() => navigate(`/album/${album.id}`)}
                      onCertPress={() => setCertAlbum(album)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "songs" && (
            <div className="px-5 pb-4 flex flex-col">
              {filteredSongs.length === 0 && (
                <p className="text-white/35 text-sm text-center mt-8">No songs match "{search}"</p>
              )}
              {filteredSongs.map((song, idx) => {
                const isActive = currentSong?.id === song.id;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => playSong(song, filteredSongs)}
                    className="flex items-center gap-3 py-2.5 active:opacity-60 transition-opacity text-left"
                    style={{
                      borderBottom: idx < filteredSongs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                    data-testid={`row-song-${song.id}`}
                  >
                    <img src={song.album.artwork} alt={song.album.title} className="w-11 h-11 rounded-md object-cover flex-shrink-0" />
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
                );
              })}
            </div>
          )}

          {tab === "artists" && (
            <div className="px-5 pb-4 flex flex-col">
              {filteredArtists.length === 0 && (
                <p className="text-white/35 text-sm text-center mt-8">No artists match "{search}"</p>
              )}
              {filteredArtists.map((artist, idx) => (
                <button
                  key={artist.name}
                  type="button"
                  onClick={() => navigate(`/album/${artist.albums[0].id}`)}
                  className="flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left"
                  style={{
                    borderBottom: idx < filteredArtists.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}
                  data-testid={`row-artist-${artist.name}`}
                >
                  <img
                    src={artist.albums[0].artwork}
                    alt={artist.name}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                  />
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
              ))}
            </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />

        {certAlbum && (
          <GoodDeedCertificate
            album={certAlbum}
            ownerName={user?.displayName || "GoodTunes Fan"}
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
              <img src={album.artwork} alt="" className="w-full h-full object-cover opacity-85" />
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
                <img src={album.artwork} alt="" className="w-full h-full object-cover opacity-90" />
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
        <p className="text-white text-sm font-semibold leading-tight truncate">{album.title}</p>
        <p className="text-white/50 text-xs truncate mt-0.5">{album.artist}</p>
      </div>
    </div>
  );
}
