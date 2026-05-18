import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { INSTRUMENTS } from "@/data/musicData";
import { IconButton } from "@/components/ui/IconButton";

const BOOKMARK_KEY = "gt:bookmarked-instruments";

export function Bookmarks() {
  const [, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(BOOKMARK_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setBookmarkIds(Array.isArray(arr) ? arr : []);
      } catch { setBookmarkIds([]); }
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const removeBookmark = (id: string) => {
    const next = bookmarkIds.filter((x) => x !== id);
    setBookmarkIds(next);
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next)); } catch {}
  };

  const bookmarks = bookmarkIds.map((id) => INSTRUMENTS[id]).filter(Boolean);

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        <header className="flex items-center px-4 pt-12 pb-3 flex-shrink-0">
          <IconButton
            size="md"
            variant="glass"
            label="Back to Account"
            onClick={() => navigate("/account")}
            data-testid="button-back-bookmarks"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
          <h1 className="ml-3 text-white text-[22px] font-bold leading-none tracking-tight" data-testid="text-page-title">
            Bookmarks
          </h1>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-white/55 text-sm font-medium">No bookmarks yet</p>
              <p className="text-white/30 text-xs mt-1 leading-relaxed">
                Tap the bookmark on any instrument to save it for later.
              </p>
            </div>
          ) : (
            <div className="px-5">
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                {bookmarks.map((inst, i) => (
                  <div
                    key={inst.id}
                    className={`w-full flex items-center ${i < bookmarks.length - 1 ? "border-b" : ""}`}
                    style={i < bookmarks.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/instrument/${inst.id}`)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left active:bg-white/[0.04]"
                      data-testid={`bookmark-instrument-${inst.id}`}
                      aria-label={`Open ${inst.name}`}
                    >
                      {inst.photoUrl ? (
                        <img src={inst.photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg flex-shrink-0" style={{ background: "linear-gradient(135deg, #1D5E8F, #4A1E8F)" }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[14px] font-medium truncate">{inst.name}</p>
                        <p className="text-white/50 text-[12px] truncate">{inst.category}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeBookmark(inst.id); }}
                      aria-label={`Remove bookmark for ${inst.name}`}
                      className="flex-shrink-0 p-2 mr-2 active:opacity-70"
                      data-testid={`button-remove-bookmark-${inst.id}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#4AFFCA" stroke="#4AFFCA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
