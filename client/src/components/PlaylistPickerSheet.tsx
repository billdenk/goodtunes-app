import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

interface PlaylistPickerSheetProps {
  songId: string;
  songTitle: string;
  onClose: () => void;
}

export function PlaylistPickerSheet({ songId, songTitle, onClose }: PlaylistPickerSheetProps) {
  const [added, setAdded] = useState<string | null>(null);

  const { data: playlists = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/playlists"],
  });

  const addMutation = useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, position: 0 }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: (_data, playlistId) => {
      setAdded(playlistId);
      setTimeout(onClose, 900);
    },
  });

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
        <h3 className="text-white font-semibold text-base mb-0.5">Add to Playlist</h3>
        <p className="text-white/40 text-sm mb-5 truncate">{songTitle}</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-5 h-5 text-white/40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 6h18M3 10h14M3 14h10M17 14v6M14 17h6" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">No playlists yet.</p>
            <p className="text-white/25 text-xs mt-1">Create one in the Playlists tab first.</p>
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
