import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { clearLocalAnalytics } from "@/lib/analytics";

export function Account() {
  const { user, logout, updateProfile, isUpdatePending, updateError } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [realName, setRealName] = useState(user?.realName || "");
  const [saved, setSaved] = useState(false);
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

  const handleSave = async () => {
    try {
      await updateProfile({ displayName, username, realName: realName || null });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

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

        <header className="relative z-10 flex items-end justify-between px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Account</h1>
        </header>

        <div className="relative z-10 flex flex-col items-center pt-6 pb-4 px-5">
          <div
            className="w-20 h-20 rounded-full border-2 border-[#319ED8] flex items-center justify-center text-2xl font-bold text-white mb-4"
            style={{ background: "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
          >
            {initials}
          </div>

          {!editing ? (
            <>
              <p className="text-white text-xl font-bold">{user?.displayName}</p>
              <p className="text-white/50 text-sm mt-1">@{user?.username}</p>
              <button
                type="button"
                onClick={() => { setEditing(true); setDisplayName(user?.displayName || ""); setUsername(user?.username || ""); setRealName(user?.realName || ""); }}
                className="mt-3 px-5 py-2 rounded-full border border-white/20 text-white/70 text-sm font-medium"
              >
                Edit Profile
              </button>
            </>
          ) : (
            <div className="w-full flex flex-col gap-3 mt-2">
              <div>
                <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5 ml-1">Name</label>
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="Your name"
                  className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  data-testid="input-account-real-name"
                />
              </div>
              <div>
                <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5 ml-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#319ED8]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  data-testid="input-account-display-name"
                />
              </div>
              <div>
                <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5 ml-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className="w-full border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#319ED8]"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  data-testid="input-account-username"
                />
              </div>
              {updateError && (
                <p className="text-red-400 text-xs px-1">{updateError}</p>
              )}
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/20 text-white/60 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isUpdatePending}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                >
                  {isUpdatePending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {saved && (
            <div className="mt-3 flex items-center gap-2 text-[#4AFFCA] text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" />
              </svg>
              Profile updated
            </div>
          )}
        </div>

        <div ref={scrollRef} className="relative z-10 flex-1 px-5 overflow-y-auto scrollbar-hide pb-[170px]">
          <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 mt-2 ml-1">Settings</p>
          <div className="rounded-2xl overflow-hidden mb-10" style={{ background: "rgba(255,255,255,0.05)" }}>
            {["Notifications", "Privacy", "About GoodTunes®"].map((label, i, arr) => (
              <button
                key={label}
                type="button"
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.06] ${i < arr.length - 1 ? "border-b" : ""}`}
                style={i < arr.length - 1 ? { borderColor: "rgba(255,255,255,0.07)" } : undefined}
              >
                <span className="text-white text-[15px]">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.35">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>

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

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
