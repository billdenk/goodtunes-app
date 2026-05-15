import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { clearLocalAnalytics } from "@/lib/analytics";
import { INSTRUMENTS } from "@/data/musicData";

/** Profile photo is stored client-side as a data URL in localStorage (same
 *  pattern as favorites + chat). When the GT backend lands, swap for an
 *  uploaded URL on the user record. */
const profilePhotoKey = (userId: string) => `gt:profile-photo:${userId}`;

export function Account() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedToast, setClearedToast] = useState(false);

  const handleClearHistory = async () => {
    setClearing(true);
    try { await clearLocalAnalytics(); } catch {}
    setClearing(false);
    setConfirmClear(false);
    setClearedToast(true);
    setTimeout(() => setClearedToast(false), 2200);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  // Profile photo comes from the server (auth payload). Actual edit lives on
  // the dedicated /account/edit page.
  const photoUrl = user?.photoUrl ?? null;

  // Bookmarked instruments (synced with the same localStorage key used by
  // InstrumentSheet in AlbumDetail). Re-read on focus so newly-bookmarked
  // items show up when the user returns to this tab.
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("gt:bookmarked-instruments");
        setBookmarkIds(raw ? JSON.parse(raw) : []);
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
    try { localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(next)); } catch {}
  };
  const bookmarks = bookmarkIds.map((id) => INSTRUMENTS[id]).filter(Boolean);

  return (
    <main className="relative h-screen w-full bg-[#00062B] flex justify-center overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 130% 80% at 75% -10%, rgba(127,16,167,0.30) 0%, transparent 60%), radial-gradient(ellipse 110% 70% at 20% 110%, rgba(49,158,216,0.22) 0%, transparent 65%), linear-gradient(180deg, #0a0d4a 0%, #00062B 55%, #00041f 100%)",
        }}
      />
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">

        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-[170px]">
          {/* Title + profile header now live INSIDE the scroll container so
              the whole page scrolls as one — previously the avatar/name/Edit
              block was fixed above the scroll area and content slid under it. */}
          <header className="flex items-end justify-between px-5 pt-14 pb-3">
            <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Account</h1>
          </header>

          <div className="flex flex-col items-center pt-6 pb-4 px-5">
            <div
              className="relative w-20 h-20 rounded-full border-2 border-[#319ED8] overflow-hidden flex items-center justify-center text-2xl font-bold text-white mb-4"
              style={{ background: photoUrl ? "transparent" : "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
              aria-label="Profile photo"
              data-testid="profile-photo"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <p className="text-white text-xl font-bold">{user?.displayName}</p>
            <p className="text-white/50 text-sm mt-1">@{user?.username}</p>
            <button
              type="button"
              onClick={() => navigate("/account/edit")}
              className="mt-3 px-5 py-2 rounded-full border border-white/20 text-white/70 text-sm font-medium active:opacity-70"
              data-testid="button-edit-profile"
            >
              Edit Profile
            </button>
          </div>

          <div className="px-5">
          {bookmarks.length > 0 && (
            <>
              <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Bookmarks</p>
              <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
                {bookmarks.map((inst, i) => (
                  <div
                    key={inst.id}
                    className={`w-full flex items-center gap-3 px-3 py-3 ${i < bookmarks.length - 1 ? "border-b" : ""}`}
                    style={i < bookmarks.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                    data-testid={`bookmark-instrument-${inst.id}`}
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
                    <button
                      type="button"
                      onClick={() => removeBookmark(inst.id)}
                      aria-label={`Remove bookmark for ${inst.name}`}
                      className="flex-shrink-0 p-2 -mr-1 active:opacity-70"
                      data-testid={`button-remove-bookmark-${inst.id}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#4AFFCA" stroke="#4AFFCA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Listening History</p>
          <div className="rounded-2xl overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="px-4 pt-3 pb-2 text-white/55 text-[12px] leading-snug">
              We record what you listen to so artists can see which songs resonate. You can wipe your history any time.
            </p>
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w-full py-3.5 text-left px-4 text-white text-[15px] active:bg-white/[0.06] border-t"
                style={{ borderColor: "rgba(255,255,255,0.07)" }}
                data-testid="button-clear-history"
              >
                Delete My Listening History
              </button>
            ) : (
              <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <p className="text-white text-[14px] mb-3">Permanently delete every play, skip, and favorite event tied to this account?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 py-3 rounded-2xl border border-white/20 text-white/60 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={clearing}
                    className="flex-1 py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50"
                    style={{ background: "#FF5470" }}
                    data-testid="button-confirm-clear-history"
                  >
                    {clearing ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {clearedToast && (
            <div className="mb-3 flex items-center gap-2 text-[#4AFFCA] text-sm px-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" />
              </svg>
              Listening history deleted
            </div>
          )}

          {/* Settings rows — moved here from EditAccount so they sit on the
              Account page itself, not inside the Edit Profile flow. */}
          <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Settings</p>
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            {["Notifications", "Privacy", "About GoodTunes®"].map((label, i, arr) => (
              <button
                key={label}
                type="button"
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
                data-testid={`row-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <span className="text-white text-[15px]">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-3.5 text-center text-red-400 text-[15px] font-normal active:bg-white/[0.06]"
              data-testid="button-sign-out"
            >
              Sign Out
            </button>
          </div>

          <p className="text-center text-white/45 text-xs pb-4">Version 1.00</p>
          </div>
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
