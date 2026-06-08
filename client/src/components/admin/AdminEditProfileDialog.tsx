import { useState, useRef, useEffect } from "react";
import { Camera, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fileToUploadDataUrl, friendlyPhotoError } from "@/lib/photoUpload";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Same allowlist + size cap the fan player editor enforces (the server
// allowlist is PNG/JPEG/WEBP/GIF only — anything else, notably HEIC from
// iOS, 400s). Reject up front with a clear message instead of letting the
// silent server reject bury the bug.
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

function initialsFor(name: string | undefined, email: string | undefined): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

/**
 * AdminEditProfileDialog — the operator-facing Edit Profile editor.
 *
 * The account menu used to navigate to `/account/edit`, which is the fan
 * player's profile editor (built for the dark navy player chrome). Rendered
 * on the admin's light surface its white-on-light text was nearly invisible
 * and the player's left nav showed behind it. This dialog edits the same
 * fields (photo + Name + Display Name + Username) through the SAME
 * `useAuth` update/photo/remove methods, but styled to the GoodTunes admin
 * style guide (light surface, dark high-contrast text). The fan editor is
 * untouched for customers.
 */
export function AdminEditProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    user,
    updateProfile,
    updatePhoto,
    removePhoto,
    isUpdatePending,
    isPhotoPending,
    updateError,
  } = useAuth();

  const [realName, setRealName] = useState(user?.realName || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUrl = user?.photoUrl ?? null;
  const initials = initialsFor(user?.displayName, user?.email);

  // Reset the text fields to the canonical record whenever the dialog opens
  // (or the user finishes loading). Canceling = closing without saving, so
  // re-seeding on open is what discards unsaved text edits.
  useEffect(() => {
    if (!open) return;
    setRealName(user?.realName || "");
    setDisplayName(user?.displayName || "");
    setUsername(user?.username || "");
    setPhotoError(null);
  }, [open, user?.id]);

  // Save is only meaningful when a text field actually changed — photo
  // add/remove apply immediately through their own mutations.
  const isDirty =
    realName !== (user?.realName || "") ||
    displayName !== (user?.displayName || "") ||
    username !== (user?.username || "");

  const acceptFile = (file: File | undefined | null) => {
    setPhotoError(null);
    if (!file || !user?.id) return;
    if (!ALLOWED_MIMES.includes(file.type.toLowerCase())) {
      setPhotoError(`That format isn't supported (${file.type || "unknown"}). Use a JPEG, PNG, WEBP, or GIF.`);
      return;
    }
    if (file.size > MAX_BYTES) {
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
      onOpenChange(false);
    } catch {
      // updateError surfaces inline; keep the dialog open so the operator
      // can fix the field and retry.
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-6 text-slate-900"
        data-testid="dialog-admin-edit-profile"
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-slate-900 text-lg font-bold tracking-tight" data-testid="text-admin-edit-profile-title">
            Edit profile
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-sm">
            Update your name and photo. Photo changes save immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Photo — circular dropzone that doubles as the picker. Drag an
            image over it or click to choose; shows the current photo, or
            initials on a brand-blue fill when empty. */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => !isPhotoPending && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isPhotoPending) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (isPhotoPending) return;
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            disabled={isPhotoPending}
            aria-label="Change profile photo"
            data-testid="button-admin-profile-photo"
            className={[
              "group relative w-20 h-20 shrink-0 rounded-full overflow-hidden flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2",
              photoUrl ? "ring-1 ring-slate-200" : "bg-[var(--brand-blue)]",
              dragging ? "ring-2 ring-[var(--brand-blue)]" : "",
            ].join(" ")}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="w-full h-full object-cover"
                data-testid="img-admin-profile-photo"
              />
            ) : (
              <span className="text-white text-2xl font-bold tracking-wide" data-testid="text-admin-profile-initials">
                {initials}
              </span>
            )}
            {/* Hover/drag scrim with a camera glyph so the tap-to-change
                affordance is obvious over any photo. */}
            <span
              aria-hidden="true"
              className={[
                "absolute inset-0 flex items-center justify-center transition-opacity bg-black/40",
                dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              ].join(" ")}
            >
              <Camera className="w-6 h-6 text-white" strokeWidth={2} />
            </span>
            {isPhotoPending && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
              </span>
            )}
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => !isPhotoPending && fileInputRef.current?.click()}
                disabled={isPhotoPending}
                className="h-8 text-xs text-slate-700 border-slate-200"
                data-testid="button-admin-profile-photo-upload"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {photoUrl ? "Replace" : "Upload"}
              </Button>
              {photoUrl && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={isPhotoPending}
                  className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-xs font-medium text-slate-500 hover:text-[color:var(--brand-pink)] hover:bg-slate-100 disabled:opacity-40"
                  data-testid="button-admin-profile-photo-remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Drag an image onto the photo, or click to pick. JPEG, PNG, WEBP, or GIF · up to 5 MB.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            data-testid="input-admin-profile-photo"
          />
        </div>

        {photoError && (
          <p
            className="-mt-2 text-xs text-[color:var(--brand-pink)]"
            data-testid="text-admin-photo-error"
          >
            {photoError}
          </p>
        )}

        {/* Profile fields */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-edit-real-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Name
            </label>
            <input
              id="admin-edit-real-name"
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="Your name"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 focus:border-[var(--brand-blue)]"
              data-testid="input-admin-real-name"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="admin-edit-display-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Display Name
            </label>
            <input
              id="admin-edit-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your name shows"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 focus:border-[var(--brand-blue)]"
              data-testid="input-admin-display-name"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="admin-edit-username"
              className="block text-xs font-semibold text-slate-700"
            >
              Username
            </label>
            <input
              id="admin-edit-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="username"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 focus:border-[var(--brand-blue)]"
              data-testid="input-admin-username"
            />
            <p className="text-xs text-slate-400">
              Lowercase letters, numbers, and underscores only.
            </p>
          </div>
        </div>

        {updateError && (
          <p className="-mt-2 text-xs text-[color:var(--brand-pink)]" data-testid="text-admin-update-error">
            {updateError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isUpdatePending}
            className="text-slate-600 hover:text-slate-900"
            data-testid="button-admin-edit-profile-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isUpdatePending || !isDirty}
            className="bg-[color:var(--brand-blue)] text-white hover:bg-[color:var(--brand-blue)]/90"
            data-testid="button-admin-edit-profile-save"
          >
            {isUpdatePending ? "Saving\u2026" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
