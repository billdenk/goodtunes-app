// Task #654 — "Change the physical format" modal launched from the
// album-jacket overlay on each Sell-card. Reuses the visual language
// from NewAlbumModeDialog stage 2 (format card grid) but marks the
// CURRENT format with a blue ring + "Current" pill and disables it
// (clicking does nothing). Picking a different format calls
// `onPick(target)` and lets the SellPanel run the adapter + persist.

import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";

const FORMAT_BLURB: Record<AlbumFormat, string> = {
  "7_inch": "7″ single — fastest turn.",
  "12_lp": "Standard 12″ vinyl.",
  "12_double": "Two-disc 12″ set.",
  cassette: "Tape — short-run friendly.",
  cd: "Compact disc.",
};

export function ChangeFormatDialog({
  open,
  onOpenChange,
  current,
  options,
  onPick,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: AlbumFormat;
  options: AlbumFormat[];
  onPick: (target: AlbumFormat) => void;
  busy?: boolean;
}) {
  // Always include the current format in the grid so the "Current"
  // pill is visible — even if the parent forgot to thread it through.
  const formats = Array.from(new Set<AlbumFormat>([current, ...options]));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="dialog-change-format"
      >
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Change the physical format
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Your color, jacket, quantity, and price carry over where the new
            format supports them — anything else snaps to the closest default.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          {formats.map((f) => {
            const isCurrent = f === current;
            return (
              <button
                key={f}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => onPick(f)}
                data-testid={`card-change-format-${f}`}
                aria-current={isCurrent || undefined}
                className={[
                  "group relative rounded-lg border p-4 text-left transition-all",
                  isCurrent
                    ? "border-[color:var(--brand-blue)] ring-2 ring-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/5 cursor-default"
                    : "border-slate-200 bg-white hover:border-[color:var(--brand-blue)] hover:shadow-sm",
                  busy && !isCurrent ? "opacity-60" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "text-sm font-semibold flex items-center gap-1.5",
                    isCurrent
                      ? "text-[color:var(--brand-blue)]"
                      : "text-slate-900 group-hover:text-[color:var(--brand-blue)]",
                  ].join(" ")}
                >
                  {ALBUM_FORMAT_LABEL[f]}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {FORMAT_BLURB[f] ?? ""}
                </div>
                {isCurrent && (
                  <span
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-blue)] text-white text-xs font-semibold uppercase tracking-wider px-2 py-0.5"
                    data-testid={`pill-current-format-${f}`}
                  >
                    <Check className="w-3 h-3" />
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
