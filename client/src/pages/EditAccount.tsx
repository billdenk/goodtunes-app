import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Camera, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/ui/IconButton";

export function EditAccount() {
  const { user, updateProfile, updatePhoto, removePhoto, isUpdatePending, updateError } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [realName, setRealName] = useState(user?.realName || "");
  const [saved, setSaved] = useState(false);
  // Local error string for photo upload failures. We need this in addition
  // to `updateError` (which only covers profile-field saves) so a rejected
  // HEIC / oversized image / server validation error doesn't silently
  // disappear into an empty avatar.
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Keep form in sync when the auth user finishes loading on a hard refresh.
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setUsername(user.username || "");
    setRealName(user.realName || "");
  }, [user?.id]);

  // Dirty check — the checkmark stays dimmed until at least one editable
  // text field differs from the canonical user record. (Photo edits go
  // through their own `updatePhoto` / `removePhoto` calls and don't need
  // a Save press, so we deliberately don't watch the photo here.)
  const isDirty =
    displayName !== (user?.displayName || "") ||
    username !== (user?.username || "") ||
    realName !== (user?.realName || "");

  const initials = user?.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Photo lives on the server now (DB-backed, survives restarts + device switches).
  // `user.photoUrl` is the source of truth.
  const photoUrl = user?.photoUrl ?? null;

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPhotoError(null);
    if (!file || !user?.id) return;
    // The server allowlist is PNG/JPEG/WEBP/GIF only — anything else (notably
    // HEIC straight from iOS Photos) will 400. iPhone Safari normally
    // auto-converts when `accept` lists explicit MIME types, but Files /
    // share sheets can still hand us a HEIC. Reject up front with a clear
    // message instead of letting the silent server reject bury the bug.
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowedMimes.includes(file.type.toLowerCase())) {
      setPhotoError(`That format isn't supported (${file.type || "unknown"}). Use a JPEG or PNG.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("That image is over 5MB. Pick a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError("Couldn't read that file. Try a different photo.");
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        setPhotoError("Couldn't read that file. Try a different photo.");
        return;
      }
      updatePhoto(dataUrl).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err ?? "");
        setPhotoError(msg || "Upload failed. Please try again.");
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    if (!user?.id) return;
    setPhotoError(null);
    removePhoto().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      setPhotoError(msg || "Couldn't remove photo.");
    });
  };

  const handleSave = async () => {
    try {
      await updateProfile({ displayName, username, realName: realName || null });
      setSaved(true);
      setTimeout(() => { setSaved(false); navigate("/account"); }, 900);
    } catch {}
  };

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden">
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        {/* Header — Apple iOS-photo-picker dismiss/confirm pair. Glass X on
            the left (cancel, returns to Account without saving) and a
            solid brand-blue checkmark on the right (save). Both come from
            the shared IconButton primitive so size, press feedback, and
            disabled treatment stay consistent with every other circular
            chip across the player. Replaces the off-styleguide back caret
            and "Save" text the page used to ship with. */}
        <header className="relative z-10 flex items-center justify-between px-4 pt-14 pb-3">
          <IconButton
            label="Cancel"
            variant="glass"
            onClick={() => navigate("/account")}
            data-testid="button-cancel"
          >
            <X strokeWidth={2.4} />
          </IconButton>
          <h1 className="text-white text-[17px] font-semibold" data-testid="text-page-title">Edit Profile</h1>
          <IconButton
            label="Save"
            variant="solid"
            onClick={handleSave}
            disabled={isUpdatePending || !isDirty}
            data-testid="button-save"
          >
            <Check strokeWidth={2.8} />
          </IconButton>
        </header>

        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide pb-10">
          {/* Photo */}
          <div className="flex flex-col items-center pt-3 pb-5 px-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handlePhotoPick}
              data-testid="input-profile-photo"
            />
            {/* Photo well — single tappable surface. The camera glyph sits
                CENTERED inside the circle (not as a bottom-right badge)
                because this page already announces itself as "edit photo"
                — the badge was redundant chrome. When a photo is present
                the camera floats over a dark scrim so it stays legible
                on bright images; with just initials the glyph sits over
                the gradient and we hide the initials so the camera reads
                as the primary affordance. */}
            <div className="relative mb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full border-2 border-[#319ED8] overflow-hidden flex items-center justify-center text-3xl font-bold text-white active:scale-[0.97] transition-transform"
                style={{ background: photoUrl ? "transparent" : "linear-gradient(135deg, #0D2060, #1a0a5e)" }}
                aria-label="Change profile photo"
                data-testid="button-profile-photo"
              >
                {photoUrl ? (
                  <>
                    <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.38)" }}
                    >
                      <Camera className="w-7 h-7 text-white drop-shadow" strokeWidth={2} />
                    </span>
                  </>
                ) : (
                  <Camera className="w-8 h-8 text-white/90" strokeWidth={1.8} aria-hidden="true" />
                )}
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
            {photoError && (
              <p
                className="text-red-400 text-[12px] mt-2 max-w-[280px] text-center"
                data-testid="text-photo-error"
              >
                {photoError}
              </p>
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

          </div>
        </div>
      </section>
    </main>
  );
}
