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
import { type AlbumFormat } from "@shared/schema";

type FormatFamily = "vinyl" | "cassette" | "cd";

const FORMAT_FAMILIES: Array<{
  id: FormatFamily;
  label: string;
  blurb: string;
}> = [
  { id: "vinyl", label: "Vinyl", blurb: "Choose size and disc count in the builder." },
  { id: "cassette", label: "Cassette", blurb: "Tape — short-run friendly." },
  { id: "cd", label: "CD", blurb: "Compact disc." },
];

function formatFamily(format: AlbumFormat): FormatFamily {
  return format === "cassette" || format === "cd" ? format : "vinyl";
}

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
  // Collapse the legacy vinyl SKUs into one family while threading an
  // available backend AlbumFormat value through to the existing adapter.
  const availableFamilies = new Set<FormatFamily>(
    [current, ...options].map(formatFamily),
  );
  const currentFamily = formatFamily(current);
  const formats = FORMAT_FAMILIES
    .filter(({ id }) => availableFamilies.has(id))
    .map((family) => {
      if (family.id === currentFamily) return { ...family, target: current };
      const target = options.find((option) => formatFamily(option) === family.id);
      return target ? { ...family, target } : null;
    })
    .filter((format): format is (typeof FORMAT_FAMILIES)[number] & { target: AlbumFormat } => format !== null);
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
          {formats.map((format) => {
            const isCurrent = format.id === currentFamily;
            const target = format.target;
            return (
              <button
                key={format.id}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => onPick(target)}
                data-testid={`card-change-format-${target}`}
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
                  {format.label}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {format.blurb}
                </div>
                {isCurrent && (
                  <span
                    className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-blue)] text-white text-xs font-semibold uppercase tracking-wider px-2 py-0.5"
                    data-testid={`pill-current-format-${target}`}
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
