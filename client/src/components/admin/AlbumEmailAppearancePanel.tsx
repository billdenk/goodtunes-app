// Task #3120 — per-album redemption-email branding. Artists/operators pick
// an optional CTA button color plus optional custom hero graphics (one
// album-wide default + per-format overrides keyed by the order's physical
// kind). The redemption email resolves format graphic → default graphic →
// cover art automatically, so an untouched panel means "send as today, with
// the cover art as the hero". Saves ride the standard album PUT
// (edit_metadata gate + post-sale lock) and uploads use the shared admin
// image-upload path (/api/admin/upload → Object Storage).
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Upload, X, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { uploadImageFile } from "@/lib/adminUpload";
import {
  EMAIL_HERO_FORMAT_KINDS,
  type AlbumEmailAppearance,
  type EmailHeroFormatKind,
} from "@shared/schema";

const KIND_LABEL: Record<EmailHeroFormatKind, string> = {
  vinyl: "Vinyl orders",
  cd: "CD orders",
  cassette: "Cassette orders",
};

const DEFAULT_BUTTON_COLOR = "#1D5E8F";

type HeroSlotKey = "default" | EmailHeroFormatKind;

export function AlbumEmailAppearancePanel({
  albumId,
  artworkUrl,
  emailAppearance,
  disabled,
  disabledReason,
}: {
  albumId: string;
  artworkUrl: string | null;
  emailAppearance: AlbumEmailAppearance | null | undefined;
  disabled: boolean;
  disabledReason?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const appearance = emailAppearance ?? {};
  const [uploadingSlot, setUploadingSlot] = useState<HeroSlotKey | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<EmailHeroFormatKind>("vinyl");

  const save = useMutation({
    mutationFn: async (next: AlbumEmailAppearance | null) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
        emailAppearance: next,
      });
      return r.json();
    },
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      // 202 = approval divert, not saved yet — mirror the standard copy.
      if (resp?.pendingChange) {
        toast({ title: "Sent for review", description: "Your email appearance change was sent to GoodTunes for review." });
      } else {
        toast({ title: "Email appearance saved" });
      }
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save email appearance",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const patch = (mut: (a: AlbumEmailAppearance) => AlbumEmailAppearance | null) => {
    const next = mut({ ...appearance, heroByFormat: { ...(appearance.heroByFormat ?? {}) } });
    save.mutate(next);
  };

  const setSlotUrl = (slot: HeroSlotKey, url: string | null) =>
    patch((a) => {
      if (slot === "default") {
        a.heroDefaultUrl = url;
      } else {
        const byFormat = { ...(a.heroByFormat ?? {}) };
        if (url) byFormat[slot] = url;
        else delete byFormat[slot];
        a.heroByFormat = byFormat;
      }
      return a;
    });

  const slotUrl = (slot: HeroSlotKey): string | null =>
    slot === "default"
      ? appearance.heroDefaultUrl ?? null
      : appearance.heroByFormat?.[slot] ?? null;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4"
      data-testid="panel-email-appearance"
    >
      <div className="flex items-center gap-1.5">
        <Mail className="w-4 h-4 text-[color:var(--brand-blue)]" />
        <span className="text-sm font-semibold text-slate-900">Email appearance</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs ml-auto"
          onClick={() => setPreviewOpen(true)}
          data-testid="button-email-preview"
        >
          <Eye className="w-3 h-3 mr-1" />
          Preview email
        </Button>
      </div>
      <EmailPreviewDialog
        albumId={albumId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        format={previewFormat}
        onFormatChange={setPreviewFormat}
      />
      <p className="text-xs text-slate-500 mt-1 leading-snug">
        Brand the "Your music is ready" email fans get after buying. Without
        custom graphics the album cover is used automatically; per-format
        graphics win for matching orders.
      </p>
      {disabled && disabledReason && (
        <p className="text-xs text-amber-700 mt-1">{disabledReason}</p>
      )}

      {/* Button color */}
      <div className="mt-4 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-700 w-40 shrink-0" htmlFor={`email-btn-color-${albumId}`}>
          "Get my music" button
        </label>
        <input
          id={`email-btn-color-${albumId}`}
          type="color"
          value={appearance.buttonColor ?? DEFAULT_BUTTON_COLOR}
          disabled={disabled || save.isPending}
          onChange={(e) => {
            const v = e.target.value;
            // Commit on change-end via blur is flaky across browsers; the
            // native picker fires change once on close in practice.
            patch((a) => ({ ...a, buttonColor: v }));
          }}
          className="h-8 w-12 rounded border border-slate-200 bg-white p-0.5 cursor-pointer disabled:cursor-not-allowed"
          data-testid="input-email-button-color"
        />
        <span className="text-xs text-slate-500 font-mono">
          {appearance.buttonColor ?? `${DEFAULT_BUTTON_COLOR} (default)`}
        </span>
        {appearance.buttonColor && (
          <button
            type="button"
            className="text-xs text-slate-500 underline disabled:opacity-50"
            disabled={disabled || save.isPending}
            onClick={() => patch((a) => ({ ...a, buttonColor: null }))}
            data-testid="button-email-color-reset"
          >
            Reset to default
          </button>
        )}
      </div>

      {/* Hero graphic slots */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HeroSlot
          label="Default graphic"
          hint="Used when no format graphic matches"
          url={slotUrl("default")}
          fallbackUrl={artworkUrl}
          uploading={uploadingSlot === "default"}
          disabled={disabled || save.isPending || uploadingSlot !== null}
          onUpload={async (file) => {
            setUploadingSlot("default");
            try {
              const url = await uploadImageFile(file);
              setSlotUrl("default", url);
            } catch (e: any) {
              toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
            } finally {
              setUploadingSlot(null);
            }
          }}
          onClear={() => setSlotUrl("default", null)}
          testId="hero-slot-default"
        />
        {EMAIL_HERO_FORMAT_KINDS.map((kind) => (
          <HeroSlot
            key={kind}
            label={KIND_LABEL[kind]}
            hint="Optional override"
            url={slotUrl(kind)}
            fallbackUrl={null}
            uploading={uploadingSlot === kind}
            disabled={disabled || save.isPending || uploadingSlot !== null}
            onUpload={async (file) => {
              setUploadingSlot(kind);
              try {
                const url = await uploadImageFile(file);
                setSlotUrl(kind, url);
              } catch (e: any) {
                toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
              } finally {
                setUploadingSlot(null);
              }
            }}
            onClear={() => setSlotUrl(kind, null)}
            testId={`hero-slot-${kind}`}
          />
        ))}
      </div>
    </div>
  );
}

// Renders the REAL email HTML from GET /api/admin/albums/:id/email-preview
// (same builder + hero ladder as the production send) inside a sandboxed
// iframe, with a format switcher matching the hero override slots.
function EmailPreviewDialog({
  albumId,
  open,
  onOpenChange,
  format,
  onFormatChange,
}: {
  albumId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  format: EmailHeroFormatKind;
  onFormatChange: (k: EmailHeroFormatKind) => void;
}) {
  const preview = useQuery<{ subject: string; html: string; format: string }>({
    queryKey: [`/api/admin/albums/${albumId}/email-preview?format=${format}`],
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-email-preview">
        <DialogHeader>
          <DialogTitle>Redemption email preview</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1.5">
          {EMAIL_HERO_FORMAT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => onFormatChange(kind)}
              className={`text-xs rounded-full px-2.5 py-1 border ${
                format === kind
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
              data-testid={`button-preview-format-${kind}`}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        {preview.data && (
          <div className="text-xs text-slate-500 truncate">
            Subject: <span className="text-slate-700">{preview.data.subject}</span>
          </div>
        )}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          {preview.isLoading ? (
            <div className="h-[480px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : preview.isError ? (
            <div className="h-[480px] flex items-center justify-center text-sm text-slate-500 px-6 text-center">
              Couldn't load the preview. Please try again.
            </div>
          ) : (
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.data?.html ?? ""}
              className="w-full h-[480px] border-0 bg-white"
              data-testid="iframe-email-preview"
            />
          )}
        </div>
        <p className="text-xs text-slate-400">
          The "Get my music" link in the real email is unique per order — the
          preview uses a placeholder.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function HeroSlot({
  label,
  hint,
  url,
  fallbackUrl,
  uploading,
  disabled,
  onUpload,
  onClear,
  testId,
}: {
  label: string;
  hint: string;
  url: string | null;
  fallbackUrl: string | null;
  uploading: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
  testId: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const shown = url ?? fallbackUrl;
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-xs font-medium text-slate-700">{label}</div>
      <div className="text-xs text-slate-400 leading-snug">{hint}</div>
      <div className="mt-1.5 relative rounded-lg border border-slate-200 bg-slate-50 aspect-square overflow-hidden flex items-center justify-center">
        {shown ? (
          <img
            src={shown}
            alt={label}
            className={`w-full h-full object-cover ${url ? "" : "opacity-40"}`}
          />
        ) : (
          <span className="text-xs text-slate-400 px-2 text-center">No graphic</span>
        )}
        {!url && shown && (
          <span className="absolute bottom-1 left-1 right-1 text-center text-xs text-slate-600 bg-white/80 rounded px-1 py-0.5">
            Cover art (auto)
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          data-testid={`${testId}-upload`}
        >
          <Upload className="w-3 h-3 mr-1" />
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs text-slate-500"
            disabled={disabled}
            onClick={onClear}
            data-testid={`${testId}-clear`}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onUpload(f);
          }}
        />
      </div>
    </div>
  );
}
