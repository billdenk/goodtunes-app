import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Task #468 — "Name this album" step.
 *
 * Sits between the artist gate (or the Person-page "+ Add Album"
 * shortcut, which already knows the artist) and the actual
 * `POST /api/admin/albums` call. Before this dialog existed the
 * create flow hardcoded `title: "New album"`, so every shell shipped
 * unnamed and the operator had to discover the Metadata panel to fix
 * it. Now the title is required up-front; submission is blocked on
 * empty/whitespace.
 *
 * Kept deliberately small — no streaming lookups, no avatar, just a
 * single labelled input + a primary Create button. The artist line is
 * echoed back as helper copy so the operator can confirm they're
 * naming the album for the right person.
 */
export interface NewAlbumTitleDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Artist name to echo back as helper copy. `null` for "Unknown artist" skips. */
  artistName: string | null;
  /** True while the parent's create mutation is in flight. */
  busy?: boolean;
  /** Fires with the trimmed title once the operator hits Create. */
  onSubmit: (title: string) => void;
}

export function NewAlbumTitleDialog({
  open,
  onOpenChange,
  artistName,
  busy = false,
  onSubmit,
}: NewAlbumTitleDialogProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on every (re)open so each invocation starts clean.
  useEffect(() => {
    if (open) {
      setTitle("");
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-[440px] bg-white rounded-xl border-slate-200 shadow-xl p-5 gap-4"
        data-testid="dialog-new-album-title"
      >
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900">
            Name the album
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-slate-500">
            {artistName ? (
              <>
                For{" "}
                <span className="font-semibold text-slate-700">
                  {artistName}
                </span>
                . You can rename it later from the Metadata panel.
              </>
            ) : (
              <>
                You can rename it later from the Metadata panel.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label
            htmlFor="new-album-title"
            className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1"
          >
            Album name
          </label>
          <input
            id="new-album-title"
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Greatest Hits"
            disabled={busy}
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-60"
            data-testid="input-album-title"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => !busy && onOpenChange(false)}
            disabled={busy}
            className="h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 disabled:opacity-60"
            data-testid="button-album-title-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="h-9 px-4 rounded-md bg-[var(--brand-blue)] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="button-album-title-create"
          >
            {busy ? (
              <Spinner className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Create album
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
