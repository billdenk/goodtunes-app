// Task #661 — Fan-facing label page. Reached by tapping the
// "Signed to {Label}" subhead on an artist page, or any other
// future deep-link into a label. v1 shows: back chevron, hero
// (logo + name), and a grid of the label's GoodTunes releases.
// Hidden / soft-deleted albums are excluded server-side (soft) and
// filtered client-side (`isHidden`).

import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { IconButton } from "@/components/ui/IconButton";
import type { Album as DbAlbum, Label } from "@shared/schema";
import { useOwnedAlbumIds } from "@/hooks/useOwnedAlbumIds";

export function FanLabel() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  // Task #1292 — fan-only owned-album gate. Admins see all label releases;
  // fans see only albums they own.
  const { ownedAlbumIds, shouldFilter: ownershipFilter } = useOwnedAlbumIds();

  const { data: label, isLoading: labelLoading, isError: labelError } = useQuery<Label>({
    queryKey: ["/api/labels", id],
    enabled: !!id,
  });

  const { data: allAlbums = [] } = useQuery<DbAlbum[]>({
    queryKey: ["/api/albums"],
  });

  const labelAlbums = (allAlbums ?? []).filter(
    (a) =>
      a.labelId === id &&
      !a.isHidden &&
      // Streaming-only rows aren't actual GoodTunes releases — keep
      // them off the label page. Same rule the artist page uses.
      (a as any).isGoodTunesRelease &&
      // Pre-launch prepping shells stay admin-only.
      !(a as any).isPrepping &&
      // Task #1292 — fans only see albums they own; admins see all.
      (!ownershipFilter || ownedAlbumIds.has(a.id)),
  );

  if (!labelLoading && (labelError || !label)) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-center">
          <p>Label not found</p>
          <button
            onClick={() => navigate("/collection")}
            className="mt-4 text-[var(--brand-blue)]"
          >
            Back to Collection
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden relative">
      <section className="relative w-full max-w-[390px] md:max-w-[820px] lg:max-w-[1200px] lg:mx-auto h-screen text-white flex flex-col">
        <IconButton
          size="md"
          variant="dimmed"
          label="Back"
          onClick={() => window.history.length > 1 ? window.history.back() : navigate("/collection")}
          className="absolute top-14 left-4 z-50"
          data-testid="button-back-label"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </IconButton>

        <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingBottom: 160 }}>
          <div className="flex flex-col items-center px-5 pt-24">
            {label?.logoUrl && (
              <div
                className="w-[140px] h-[140px] rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center"
                style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <img
                  src={label.logoUrl}
                  alt={label.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <h1
              className="mt-5 text-white text-3xl font-bold leading-tight tracking-tight text-center"
              data-testid={`text-label-name-${label?.id ?? ""}`}
            >
              {label?.name ?? ""}
            </h1>
            {label?.location && (
              <p className="text-white/45 text-xs mt-1.5">{label.location}</p>
            )}
          </div>

          <div className="px-5 mt-9">
            <h2 className="text-white text-xl font-bold tracking-tight mb-3">Releases</h2>
            {labelAlbums.length === 0 ? (
              <p className="text-white/45 text-sm" data-testid="text-label-no-releases">
                No releases yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {labelAlbums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => navigate(`/album/${album.id}`)}
                    className="flex flex-col text-left active:scale-[0.97] transition-transform"
                    data-testid={`label-album-${album.id}`}
                  >
                    <div
                      className="aspect-square rounded-2xl overflow-hidden"
                      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                    >
                      {album.artwork && (
                        <img
                          src={album.artwork}
                          alt={album.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <p className="text-white text-sm font-semibold leading-tight truncate mt-2">
                      {album.title}
                    </p>
                    <p className="text-white/50 text-xs truncate mt-0.5">
                      {[album.artist, album.year ?? null].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
