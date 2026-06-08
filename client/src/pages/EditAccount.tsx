import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Camera, Check, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useAuthKind } from "@/hooks/useAuthKind";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { scrimFade } from "@/lib/motion";
import { IconButton } from "@/components/ui/IconButton";
import { fileToUploadDataUrl, friendlyPhotoError } from "@/lib/photoUpload";

export function EditAccount() {
  const { user, updateProfile, updatePhoto, removePhoto, isUpdatePending, updateError } = useAuth();
  const [, navigate] = useLocation();
  // Phone reads as a full-screen view; tablet/desktop reads as a centered
  // Apple-style dialog card floating over a dimmed backdrop (the ~390px
  // mobile strip looked mis-sized in the large dark area). Same form body
  // and header controls drive both — only the framing changes.
  const isCard = useMediaQuery("(min-width: 768px)");
  const reduceMotion = useReducedMotion();
  // The editor is shared by the customer profile and the admin account menu.
  // Admins came from the admin shell (and the customer /account hub is blocked
  // on the admin host), so send them back to /admin rather than /account.
  const kind = useAuthKind();
  const backTo = kind === "admin" ? "/admin" : "/account";
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
    // Downscale/re-encode before upload so the base64 PUT body stays well under
    // the edge proxy's body limit (a too-large body comes back as a raw 403
    // HTML page), then map any failure to short, friendly copy.
    fileToUploadDataUrl(file)
      .then((dataUrl) => {
        if (!dataUrl) {
          setPhotoError("Couldn't read that file. Try a different photo.");
          return;
        }
        return updatePhoto(dataUrl);
      })
      .catch((err: unknown) => {
        setPhotoError(friendlyPhotoError(err, "upload"));
      });
  };

  const handlePhotoRemove = () => {
    if (!user?.id) return;
    setPhotoError(null);
    removePhoto().catch((err: unknown) => {
      setPhotoError(friendlyPhotoError(err, "remove"));
    });
  };

  const handleSave = async () => {
    try {
      await updateProfile({ displayName, username, realName: realName || null });
      setSaved(true);
      setTimeout(() => { setSaved(false); navigate(backTo); }, 900);
    } catch {}
  };

  // Header — Apple iOS-photo-picker dismiss/confirm pair. Glass X on the
  // left (cancel, returns to origin without saving) and a solid brand-blue
  // checkmark on the right (save). Both come from the shared IconButton
  // primitive so size, press feedback, and disabled treatment stay
  // consistent with every other circular chip across the player. On phone
  // the header carries the device safe-area top inset (pt-14); inside the
  // card it sits on the card's own header (pt-4) balanced to the card width.
  const header = (
    <header
      className={`relative z-10 flex items-center justify-between ${isCard ? "px-5 pt-4 pb-3" : "px-4 pt-14 pb-3"}`}
    >
      <IconButton
        label="Cancel"
        variant="glass"
        onClick={() => navigate(backTo)}
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
  );

  const body = (
    <div
      className={`relative z-10 overflow-y-auto scrollbar-hide ${isCard ? "flex-1 min-h-0 pb-6" : "flex-1 pb-10"}`}
    >
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
  );

  // Phone — keep the full-screen view exactly as it shipped.
  if (!isCard) {
    return (
      <main className="relative h-screen w-full flex justify-center overflow-hidden">
        <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
          {header}
          {body}
        </section>
      </main>
    );
  }

  // Tablet / desktop — centered Apple-style dialog card floating over a
  // dimmed, lightly blurred backdrop. Tapping the backdrop (or the X)
  // dismisses back to the origin without saving. Only one blur surface
  // here (the scrim) — the card itself is opaque, so we stay clear of the
  // iOS-WebKit stacked-backdrop-blur hazard.
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <motion.div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(6px)" }}
        onClick={() => navigate(backTo)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={scrimFade(!!reduceMotion)}
        data-testid="backdrop-edit-profile"
      />
      <motion.section
        className="relative z-[81] w-full max-w-[440px] max-h-[88vh] text-white flex flex-col rounded-3xl overflow-hidden"
        style={{ background: "#0D1B4B", boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0.14 } : { type: "spring", stiffness: 440, damping: 34, mass: 0.9 }}
        data-testid="card-edit-profile"
      >
        {header}
        {body}
      </motion.section>
    </div>
  );
}
