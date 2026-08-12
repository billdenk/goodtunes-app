// Shared per-option "offered / template" plumbing for the packaging
// component pages (Jackets, Inner Sleeves, Inserts) — Task #3052.
// The ••• menu mirrors the vinyl page's OfferableOptionCards pattern
// (frosted trigger top-right, Offer/Don't-offer verb, explanatory footer)
// and adds an "Upload template…" item backed by uploadAdminDoc. Persistence
// follows the Stickers page: the page keeps a map in state, flips a dirty
// flag, and saves the WHOLE config on every change.
import { useRef, useState, forwardRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Eye, EyeOff, MoreHorizontal, Upload, ExternalLink } from "lucide-react";
import type { PackagingOfferOption } from "@shared/pressComponents";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import { useToast } from "@/hooks/use-toast";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ children, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content ref={ref} {...props}>
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PackagingOfferPopoverContent";

// ── Offer-state map <-> config ───────────────────────────────────────
export type OfferState = Record<string, { offered: boolean; templateUrl: string | null }>;

export function offerStateFromConfig(
  masterIds: readonly string[],
  options: PackagingOfferOption[] | undefined,
): OfferState {
  const byId = new Map((options ?? []).map((o) => [o.id, o] as const));
  const state: OfferState = {};
  for (const id of masterIds) {
    const row = byId.get(id);
    state[id] = { offered: row?.offered ?? true, templateUrl: row?.templateUrl ?? null };
  }
  return state;
}

export function offerConfigFromState(
  masterIds: readonly string[],
  state: OfferState,
): { options: PackagingOfferOption[] } {
  return {
    options: masterIds.map((id) => ({
      id,
      offered: state[id]?.offered ?? true,
      templateUrl: state[id]?.templateUrl ?? null,
    })),
  };
}

// ── ••• menu on an option tile ───────────────────────────────────────
export type OfferMenuTheme = {
  card: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  popShadow: string;
  hoverWash: string; // utility class for menu-row hover
};

export function OptionOfferMenu({
  name,
  offered,
  templateUrl,
  onToggleOffered,
  onTemplateUrl,
  t,
  testId,
}: {
  name: string;
  offered: boolean;
  templateUrl: string | null;
  onToggleOffered: () => void;
  onTemplateUrl: (url: string) => void;
  t: OfferMenuTheme;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      onTemplateUrl(url);
      toast({ title: "Template uploaded", description: `${name} template saved.` });
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e?.message ?? "Could not upload the template.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name} options`}
          data-testid={`${testId}-menu`}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover/offer:opacity-100"}`}
          style={{
            border: `1px solid ${t.hairline}`,
            color: t.subink,
            boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
            backgroundColor: t.card,
          }}
        >
          <MoreHorizontal style={{ width: 13, height: 13 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-auto p-0 rounded-2xl overflow-hidden z-50"
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink, boxShadow: t.popShadow }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1.5">
          <button
            type="button"
            onClick={onToggleOffered}
            data-testid={`${testId}-toggle`}
            className={`w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors whitespace-nowrap ${t.hoverWash}`}
            style={{ color: t.ink }}
          >
            {offered ? (
              <EyeOff className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
            ) : (
              <Eye className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
            )}
            <span>{offered ? `Don\u2019t offer ${name}` : `Offer ${name}`}</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid={`${testId}-upload`}
            className={`w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors whitespace-nowrap disabled:opacity-60 ${t.hoverWash}`}
            style={{ color: t.ink }}
          >
            <Upload className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
            <span>{uploading ? "Uploading\u2026" : templateUrl ? "Replace template\u2026" : "Upload template\u2026"}</span>
          </button>
          {/* Defensive: only render links for uploaded object paths (schema
              enforces this on write; legacy/invalid values never get an href). */}
          {templateUrl && templateUrl.startsWith("/objects/uploads/") && (
            <a
              href={templateUrl}
              target="_blank"
              rel="noreferrer"
              data-testid={`${testId}-view-template`}
              className={`w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors whitespace-nowrap ${t.hoverWash}`}
              style={{ color: t.ink }}
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              <span>View template</span>
            </a>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={DOC_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        <div className="px-3.5 py-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <p className="text-[11px]" style={{ color: t.subink, whiteSpace: "nowrap" }}>
            {offered
              ? "Stays visible here \u2014 artists never see it."
              : "Available to offer again anytime."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// "Not offered" chip shown inside a muted tile.
export function NotOfferedChip({ color }: { color: string }) {
  return (
    <div className="text-[11px] font-semibold inline-flex items-center gap-1" style={{ marginTop: 6, color }}>
      <EyeOff style={{ width: 11, height: 11 }} />
      Not offered
    </div>
  );
}
