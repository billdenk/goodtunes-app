import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useScrollHideNav } from "@/hooks/useNavVisibility";

export function Account() {
  const { user, logout, updateProfile, isUpdatePending, updateError } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [realName, setRealName] = useState(user?.realName || "");
  const [saved, setSaved] = useState(false);

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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 right-0 w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #7F10A7, transparent)" }} />
        <div className="absolute bottom-40 -left-20 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #319ED8, transparent)" }} />
      </div>
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">

        <header className="relative z-10 flex items-end justify-between px-5 pt-14 pb-3">
          <h1 className="text-white text-[34px] font-bold leading-none tracking-tight" data-testid="text-page-title">Account</h1>
          <button
            type="button"
            onClick={() => navigate("/collection")}
            className="text-[#319ED8] text-base font-medium active:opacity-60"
            data-testid="button-account-done"
          >
            Done
          </button>
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
          <div className="mb-6 mt-2">
            <p className="text-white/40 text-xs uppercase tracking-widest font-medium mb-3">Settings</p>
            <div className="flex flex-col gap-1">
              {[
                { label: "Notifications", icon: "🔔" },
                { label: "Privacy", icon: "🔒" },
                { label: "About GoodTunes®", icon: "ℹ️" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/4 active:bg-white/8 text-left"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-white/70 text-sm">{item.label}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3.5 rounded-2xl border border-red-500/20 text-red-400 text-sm font-semibold mb-4"
          >
            Sign Out
          </button>

          <p className="text-center text-white/20 text-xs pb-4">Version 1.00</p>
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
