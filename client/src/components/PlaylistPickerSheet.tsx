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
  const { setShowPlayer } = usePlayer();

  const { data: playlistsRaw, isLoading } = useQuery<any[] | null>({
    queryKey: ["/api/playlists"],
  });
  const playlists = playlistsRaw ?? [];

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

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" />
              </svg>
            </div>
            <p className="text-white/60 text-sm font-medium mb-1">No playlists yet</p>
            <p className="text-white/30 text-xs mb-5">Create your first playlist to start adding songs.</p>
            <button
              type="button"
              onClick={handleGoToPlaylists}
              className="flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-2xl font-semibold text-sm text-white active:scale-[0.97] transition-transform"
              style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create a Playlist
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
