import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

/** Profile photo is stored client-side as a data URL in localStorage (same
 *  pattern as favorites + chat). When the GT backend lands, swap for an
 *  uploaded URL on the user record. */
const profilePhotoKey = (userId: string) => `gt:profile-photo:${userId}`;

export function EditAccount() {
  const { user, updateProfile, isUpdatePending, updateError } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [realName, setRealName] = useState(user?.realName || "");
  const [saved, setSaved] = useState(false);

  // Keep form in sync when the auth user finishes loading on a hard refresh.
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setUsername(user.username || "");
    setRealName(user.realName || "");
  }, [user?.id]);

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    try { setPhotoUrl(localStorage.getItem(profilePhotoKey(user.id))); } catch {}
  }, [user?.id]);

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      try { localStorage.setItem(profilePhotoKey(user.id), dataUrl); } catch {}
      setPhotoUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    if (!user?.id) return;
    try { localStorage.removeItem(profilePhotoKey(user.id)); } catch {}
    setPhotoUrl(null);
  };

  const handleSave = async () => {
    try {
      await updateProfile({ displayName, username, realName: realName || null });
      setSaved(true);
      setTimeout(() => { setSaved(false); navigate("/account"); }, 900);
    } catch {}
  };

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
        <header className="relative z-10 flex items-center justify-between px-4 pt-14 pb-3">
          <button
            type="button"
            onClick={() => navigate("/account")}
            aria-label="Back"
            className="w-10 h-10 -ml-2 flex items-center justify-center active:opacity-70"
            data-testid="button-back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-white text-[17px] font-semibold" data-testid="text-page-title">Edit Profile</h1>
          <button
            type="button"
            onClick={handleSave}
            disabled={isUpdatePending}
            className="text-[#319ED8] text-[15px] font-semibold disabled:opacity-50"
            data-testid="button-save"
          >
            {isUpdatePending ? "Saving…" : "Save"}
          </button>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-10">
          {/* Photo */}
          <div className="flex flex-col items-center pt-3 pb-5 px-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoPick}
              data-testid="input-profile-photo"
            />
            <div className="relative mb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full border-2 border-[#319ED8] overflow-hidden flex items-center justify-center text-3xl font-bold text-white active:opacity-80"
                style={{ background: photoUrl ? "transparent" : "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
                aria-label="Change profile photo"
                data-testid="button-profile-photo"
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change profile photo"
                className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full flex items-center justify-center active:opacity-80"
                style={{ background: "#319ED8", boxShadow: "0 0 0 2px #00062B" }}
                data-testid="button-profile-photo-edit"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </div>
            {photoUrl && (
              <button
                type="button"
                onClick={handlePhotoRemove}
                className="text-white/50 text-[12px] active:opacity-70"
                data-testid="button-profile-photo-remove"
              >
                Remove photo
              </button>
            )}
          </div>

          {/* Profile fields */}
          <div className="px-5">
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 ml-1">Profile</p>
            <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <label className="text-white/40 text-[11px] uppercase tracking-wider block mb-1">Name</label>
                <input
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-transparent text-white placeholder-white/30 text-[15px] focus:outline-none"
                  data-testid="input-real-name"
                />
              </div>
              <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <label className="text-white/40 text-[11px] uppercase tracking-wider block mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-transparent text-white text-[15px] focus:outline-none"
                  data-testid="input-display-name"
                />
              </div>
              <div className="px-4 py-3">
                <label className="text-white/40 text-[11px] uppercase tracking-wider block mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className="w-full bg-transparent text-white text-[15px] focus:outline-none"
                  data-testid="input-username"
                />
              </div>
            </div>
            {updateError && <p className="text-red-400 text-xs px-1 -mt-3 mb-3">{updateError}</p>}
            {saved && (
              <div className="mb-4 flex items-center gap-2 text-[#4AFFCA] text-sm px-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" />
                </svg>
                Profile updated
              </div>
            )}

            {/* Settings rows */}
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium mb-2 ml-1">Settings</p>
            <div className="rounded-2xl overflow-hidden mb-10" style={{ background: "rgba(255,255,255,0.05)" }}>
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
          </div>
        </div>
      </section>
    </main>
  );
}
