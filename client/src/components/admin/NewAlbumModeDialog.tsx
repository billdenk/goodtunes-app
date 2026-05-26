import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Check, ShoppingBag, Store } from "lucide-react";
import {
  ALBUM_PHYSICAL_FORMATS,
  ALBUM_PHYSICAL_FORMAT_LABEL,
  type AlbumPhysicalFormat,
  type AlbumSellMode,
} from "@shared/schema";

/**
 * Task #335 — Two-step "how is this album sold?" dialog.
 *
 * Stage 1: pick the SELL MODE.
 *   - **Direct** — GoodTunes runs the press, takes the order, handles
 *     fulfillment. Unlocks the Sell-tab quote flow + Path-to-press +
 *     Press tab. Most originals + new GoodTunes releases live here.
 *   - **Shopify** — label/artist already has a Shopify store and
 *     fulfills the physical product themselves. We only sell the
 *     digital album + optional GoodDeed addon. No press path; the
 *     Shopify tab handles the per-album product mapping.
 *
 * Stage 2 (Direct only): pick the PHYSICAL FORMAT up-front so the
 * Sell-tab quote flow can scope the Hellbender catalog (colors, color
 * tiers, vinyl preview) to just that format. Shopify mode skips this
 * step — the label picks SKUs in Shopify, not here.
 *
 * Returns `{ sellMode, physicalFormat | null }` to the opener, which
 * writes it back to the album via PUT /api/admin/albums/:id. The
 * dialog never POSTs itself; it's a pure picker.
 *
 * Non-dismissable when the album has no sellMode set yet — the rest of
 * the page is gated on this answer, so we don't let the operator
 * escape to a half-configured surface by hitting ✕.
 */
export function NewAlbumModeDialog({
  open,
  required,
  onSubmit,
  onClose,
  onRequestDelete,
  busy = false,
}: {
  open: boolean;
  /**
   * When true (album has no sellMode yet) ✕ / outside-click / Esc are
   * redirected to `onRequestDelete` instead of being silently swallowed,
   * so the operator has an escape hatch out of a half-created album.
   */
  required: boolean;
  onSubmit: (v: { sellMode: AlbumSellMode; physicalFormat: AlbumPhysicalFormat | null }) => void;
  onClose: () => void;
  /**
   * Fired when the operator dismisses while `required` is true. Parent
   * is expected to open the existing delete-album confirm. The mode
   * dialog stays mounted underneath so cancelling delete returns the
   * operator to whichever stage they were on.
   */
  onRequestDelete?: () => void;
  busy?: boolean;
}) {
  const [stage, setStage] = useState<"mode" | "format">("mode");
  const [pickedMode, setPickedMode] = useState<AlbumSellMode | null>(null);

  function reset() {
    setStage("mode");
    setPickedMode(null);
  }

  // Task #335 — reset to stage 1 every time the dialog opens. The
  // parent controls `open` externally (auto-open on no-sellMode + the
  // "Change" affordance), so onOpenChange doesn't fire when the
  // parent flips it back to true. Without this reset, reopening from
  // "Change" lands on whatever stage the operator last left it on.
  useEffect(() => {
    if (open) reset();
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          if (busy) return;
          if (required) {
            // Don't dismiss — bubble up so the parent can offer Delete
            // as the escape hatch. Stage state is preserved so the
            // operator lands back where they were if they cancel.
            onRequestDelete?.();
            return;
          }
          reset();
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-lg bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="dialog-album-mode"
        // Block ✕ button via aria-hidden trick when required — shadcn
        // renders a built-in close; pointer-events:none on the dialog
        // close is the cleanest way to suppress it without forking.
      >
        {stage === "mode" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[18px] font-semibold text-slate-900">
                How is this album being sold?
              </DialogTitle>
              <DialogDescription className="text-[13px] text-slate-500">
                Pick once. You can switch later from the Sell tab if the deal
                changes — nothing here is permanent until the run is at press.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModeCard
                icon={<Store className="w-5 h-5" />}
                title="GoodTunes Direct"
                blurb="We press it, sell it, fulfill it. Quote + Path-to-press unlocks."
                testId="card-mode-direct"
                onPick={() => {
                  setPickedMode("direct");
                  setStage("format");
                }}
              />
              <ModeCard
                icon={<ShoppingBag className="w-5 h-5" />}
                title="Shopify store"
                blurb="Label/artist fulfills. We sell digital + GoodDeed only."
                testId="card-mode-shopify"
                onPick={() => {
                  // Shopify mode has no format pick — submit immediately.
                  onSubmit({ sellMode: "shopify", physicalFormat: null });
                }}
              />
            </div>
          </>
        )}

        {stage === "format" && pickedMode === "direct" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStage("mode")}
                  className="text-slate-400 hover:text-slate-700"
                  data-testid="button-mode-back"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <DialogTitle className="text-[18px] font-semibold text-slate-900">
                  Pick the physical format
                </DialogTitle>
              </div>
              <DialogDescription className="text-[13px] text-slate-500 pl-6">
                Scopes the Sell-tab quote flow to this format's color catalog and
                preview art. You can change it later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2.5">
              {ALBUM_PHYSICAL_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={busy}
                  onClick={() => onSubmit({ sellMode: "direct", physicalFormat: f })}
                  data-testid={`card-format-${f}`}
                  className="group rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-[color:var(--brand-blue)] hover:shadow-sm transition-all disabled:opacity-60"
                >
                  <div className="text-[14px] font-semibold text-slate-900 group-hover:text-[color:var(--brand-blue)] flex items-center gap-1.5">
                    {ALBUM_PHYSICAL_FORMAT_LABEL[f]}
                  </div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">
                    {f === "single_lp" && "Standard 12″ vinyl."}
                    {f === "double_lp" && "Two-disc 12″ set."}
                    {f === "seven_inch" && "7″ single — fastest turn."}
                    {f === "cassette" && "Tape — short-run friendly."}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  icon,
  title,
  blurb,
  testId,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  testId: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={testId}
      className="group rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-[color:var(--brand-blue)] hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 text-slate-900 group-hover:text-[color:var(--brand-blue)]">
        {icon}
        <span className="text-[14px] font-semibold">{title}</span>
      </div>
      <div className="text-[12px] text-slate-500 mt-1.5 leading-snug">{blurb}</div>
    </button>
  );
}
