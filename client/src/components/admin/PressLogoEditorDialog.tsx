import { useRef, useState, type ComponentType } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2, Upload, Factory } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { uploadImageFile } from "@/lib/adminUpload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shared admin logo editor dialog used by Presses, Fulfillment partners,
 * and anywhere else admin surfaces want a "pencil-on-thumbnail" upload
 * affordance. Drag-and-drop or click-to-pick, then PUTs `logoUrl` to
 * the supplied `apiPath` and invalidates relevant caches via the
 * caller-supplied `onInvalidate` callback.
 *
 * Originally local to AdminManufacturer (PressLogoEditorDialog); now
 * generic so the same primitive can serve every partner-shaped admin
 * page without forking a near-identical dialog per entity.
 */
export interface PressLogoEditorDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Display name used in the dialog copy + alt text. */
  name: string;
  /** Current logoUrl on the entity (null if unset). */
  logoUrl: string | null;
  /** PUT endpoint that accepts `{ logoUrl }`, e.g. `/api/admin/manufacturers/123`. */
  apiPath: string;
  /** Called after a successful upload or remove so the page can refetch. */
  onInvalidate: () => void;
  /** Icon shown when there's no logo. Defaults to Factory (presses). */
  FallbackIcon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Testid prefix for elements inside the dialog. Defaults to "press". */
  testIdPrefix?: string;
  /** One-liner under the drop zone. Defaults to the press copy. */
  hint?: string;
}

export function PressLogoEditorDialog({
  open,
  onOpenChange,
  name,
  logoUrl,
  apiPath,
  onInvalidate,
  FallbackIcon = Factory,
  testIdPrefix = "press",
  hint = "Square works best — used in the Presses list and anywhere this plant is credited.",
}: PressLogoEditorDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", apiPath, { logoUrl: url });
      return url;
    },
    onSuccess: () => {
      onInvalidate();
      setPreviewUrl(null);
      toast({ title: "Logo updated" });
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: "Couldn't update the logo",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", apiPath, { logoUrl: null });
    },
    onSuccess: () => {
      onInvalidate();
      toast({ title: "Logo removed" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't remove the logo",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({ title: "That's not an image", description: "Use a JPG, PNG, or WebP file.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Keep images under 8 MB.", variant: "destructive" });
      return;
    }
    upload.mutate(file);
  };

  const busy = upload.isPending || removeLogo.isPending;
  const shownUrl = previewUrl || logoUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent
        className="max-w-3xl bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid={`dialog-edit-${testIdPrefix}-logo`}
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-slate-900 text-sm font-bold">Logo</DialogTitle>
          <DialogDescription className="sr-only">
            Replace the logo for {name}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div
            className="rounded-2xl shadow-sm border border-slate-200 bg-white p-6"
            data-testid={`panel-${testIdPrefix}-logo-current`}
          >
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Current logo
            </div>
            <div className="relative rounded-xl overflow-hidden aspect-square">
              {shownUrl ? (
                <img
                  src={shownUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  data-testid={`img-${testIdPrefix}-logo-current`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                  <FallbackIcon className="w-12 h-12" strokeWidth={1.5} />
                </div>
              )}
              {busy && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-700 font-semibold">
                    {upload.isPending ? "Uploading…" : "Removing…"}
                  </span>
                </div>
              )}
            </div>
            {logoUrl && (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeLogo.mutate()}
                  disabled={busy}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2 text-xs"
                  data-testid={`button-remove-${testIdPrefix}-logo`}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remove
                </Button>
              </div>
            )}
          </div>

          <div
            className="rounded-2xl shadow-sm border border-slate-200 bg-white p-6 flex flex-col"
            data-testid={`panel-${testIdPrefix}-logo-upload`}
          >
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Replace logo
            </div>
            <button
              type="button"
              onClick={() => !busy && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (busy) return;
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              disabled={busy}
              data-testid={`dropzone-${testIdPrefix}-logo`}
              className={[
                "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
                dragging
                  ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                busy && "opacity-60 cursor-not-allowed",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Upload
                className={["w-7 h-7", dragging ? "text-[var(--brand-blue)]" : "text-slate-400"].join(" ")}
              />
              <div className="text-slate-700 text-sm font-semibold">
                {dragging ? "Drop to upload" : "Drag an image here, or click to pick"}
              </div>
              <div className="text-slate-400 text-xs">JPG, PNG, or WebP · up to 8 MB</div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              data-testid={`input-${testIdPrefix}-logo-file`}
            />
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">{hint}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
