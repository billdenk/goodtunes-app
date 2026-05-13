import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlaylistPickerSheetProps {
  songId?: string;
  songIds?: string[];
  songTitle: string;
  heading?: string;
  onClose: () => void;
}

export function PlaylistPickerSheet({ songId, songIds, songTitle, heading, onClose }: PlaylistPickerSheetProps) {
  const [added, setAdded] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { setShowPlayer, isFavorite, toggleFavorite } = usePlayer();

  const { data: playlistsRaw, isLoading } = useQuery<any[] | null>({
    queryKey: ["/api/playlists"],
  });
  const playlists = playlistsRaw ?? [];

  // Favorites is a client-side virtual playlist. Show it pinned at the top.
  const targetSongIds = songIds && songIds.length > 0 ? songIds : songId ? [songId] : [];
  const allInFavorites = targetSongIds.length > 0 && targetSongIds.every((id) => isFavorite(id));
  const handleToggleFavorites = () => {
    // If every target is already favorited, treat the tap as "remove from Favorites".
    // Otherwise, add any that aren't already favorited.
    if (allInFavorites) {
      targetSongIds.forEach((id) => toggleFavorite(id));
    } else {
      targetSongIds.forEach((id) => {
        if (!isFavorite(id)) toggleFavorite(id);
      });
    }
    setAdded("__favorites__");
    setTimeout(onClose, 700);
  };

  const addMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const ids = songIds && songIds.length > 0 ? songIds : songId ? [songId] : [];
      const results = [];
      for (let i = 0; i < ids.length; i++) {
        const res = await apiRequest("POST", `/api/playlists/${playlistId}/songs`, { songId: ids[i], position: i });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: (_data, playlistId) => {
      setAdded(playlistId);
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", playlistId, "songs"] });
      setTimeout(onClose, 900);
    },
  });

  const handleGoToPlaylists = () => {
    onClose();
    setShowPlayer(false);
    navigate("/playlists?create=1");
  };

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 80 }}>
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-[390px] rounded-t-3xl p-5 pb-10"
        style={{ background: "#0D1B4B", zIndex: 81, boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.2)" }} />
        <h3 className="text-white font-semibold text-base mb-0.5">{heading ?? "Add to Playlist"}</h3>
        <p className="text-white/40 text-sm mb-5 truncate">{songTitle}</p>

        {/* Pinned: Favorites virtual playlist */}
        {targetSongIds.length > 0 && (
          <button
            type="button"
            onClick={handleToggleFavorites}
            disabled={addMutation.isPending || (!!added && added !== "__favorites__")}
            className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl text-left transition-all active:scale-[0.98] mb-2"
            style={{
              background: allInFavorites ? "rgba(255,84,112,0.10)" : "rgba(255,255,255,0.06)",
              border: allInFavorites ? "1px solid rgba(255,84,112,0.35)" : "1px solid rgba(255,255,255,0.06)",
            }}
            data-testid="row-favorites-playlist"
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: allInFavorites ? "rgba(255,84,112,0.18)" : "rgba(255,255,255,0.08)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={allInFavorites ? "#FF5470" : "none"} stroke={allInFavorites ? "#FF5470" : "rgba(255,255,255,0.6)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium leading-tight">Favorites</p>
              <p className="text-white/40 text-xs leading-tight mt-0.5">
                {allInFavorites ? "Already in Favorites — tap to remove" : "Your loved songs & artists"}
              </p>
            </div>
            {allInFavorites && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5470" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-white/40 text-xs mb-4">No custom playlists yet.</p>
            <button
              type="button"
              onClick={handleGoToPlaylists}
              className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 rounded-2xl font-semibold text-sm text-white active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
              data-testid="button-create-playlist"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Playlist
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto scrollbar-hide">
            {playlists.map((pl: any) => {
              const isAdded = added === pl.id;
              const isPending = addMutation.isPending && addMutation.variables === pl.id;
              return (
                <button
                  key={pl.id}
                  type="button"
                  disabled={addMutation.isPending || !!added}
                  onClick={() => addMutation.mutate(pl.id)}
                  className="flex items-center gap-3 py-3.5 px-4 rounded-2xl text-white text-sm font-medium text-left transition-all active:scale-[0.98]"
                  style={{
                    background: isAdded
                      ? "rgba(74,255,202,0.12)"
                      : "rgba(255,255,255,0.06)",
                    border: isAdded
                      ? "1px solid rgba(74,255,202,0.3)"
                      : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    {isAdded ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4AFFCA" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" />
                      </svg>
                    )}
                  </div>
                  <span className={isAdded ? "text-[#4AFFCA]" : "text-white"}>
                    {isAdded ? "Added!" : pl.name}
                  </span>
                  {isPending && (
                    <svg className="animate-spin w-4 h-4 text-white/40 ml-auto" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
