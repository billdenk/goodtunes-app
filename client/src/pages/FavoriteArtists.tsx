import { useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { useFavoriteArtists } from "@/hooks/useFavorites";
import { ALBUMS, ARTIST_PHOTOS, type Album } from "@/data/musicData";
import { IconButton } from "@/components/ui/IconButton";

export function FavoriteArtists() {
  const [, navigate] = useLocation();
  const favArtists = useFavoriteArtists();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const artistsByName = useMemo(() => {
    const map = new Map<string, { name: string; albums: Album[] }>();
    ALBUMS.forEach((a) => {
      const cur = map.get(a.artist) ?? { name: a.artist, albums: [] };
      cur.albums.push(a);
      map.set(a.artist, cur);
    });
    return map;
  }, []);

  const ordered = useMemo(() => {
    return [...favArtists.ordered]
      .reverse()
      .map((name) => artistsByName.get(name) ?? { name, albums: [] as Album[] });
  }, [favArtists.ordered, artistsByName]);

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <header className="flex items-center px-4 pt-12 pb-3 flex-shrink-0">
          <IconButton
            size="md"
            variant="glass"
            label="Back to Account"
            onClick={() => navigate("/account")}
            data-testid="button-back-favorite-artists"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
          <h1 className="ml-3 text-white text-[22px] font-bold leading-none tracking-tight" data-testid="text-page-title">
            Favorite Artists
          </h1>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          {ordered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <p className="text-white/55 text-sm font-medium">No favorite artists yet</p>
              <p className="text-white/30 text-xs mt-1 leading-relaxed">
                Tap the star on an artist's page to add them here.
              </p>
            </div>
          ) : (
            <div className="px-5">
              {ordered.map((artist, idx) => {
                const photo = ARTIST_PHOTOS[artist.name];
                const fallback = artist.albums[0]?.artwork;
                return (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                    className="w-full flex items-center gap-3 py-3 active:opacity-60 transition-opacity text-left"
                    style={{
                      borderBottom: idx < ordered.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                    data-testid={`row-favorite-artist-${artist.name}`}
                  >
                    {photo || fallback ? (
                      <img
                        src={photo ?? fallback}
                        alt={artist.name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        style={{
                          border: "1px solid rgba(255,255,255,0.1)",
                          ...(photo ? { objectPosition: "50% 20%" } : {}),
                        }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white/70 font-bold"
                        style={{ background: "linear-gradient(135deg, #1D5E8F, #4A1E8F)", border: "1px solid rgba(255,255,255,0.1)" }}
                        aria-hidden="true"
                      >
                        {artist.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate leading-tight">{artist.name}</p>
                      <p className="text-white/45 text-xs truncate leading-tight mt-0.5">
                        {artist.albums.length === 0
                          ? "Artist"
                          : `${artist.albums.length} ${artist.albums.length === 1 ? "album" : "albums"}`}
                      </p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
