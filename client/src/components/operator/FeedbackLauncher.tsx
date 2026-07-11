// Task #2224 — Partner feedback launcher.
//
// One self-contained button + dialog embedded in OperatorShell (both the
// "tabs" header and the "leftnav" topbar) so EVERY invited-partner portal
// — press, NPO, artist, label, vendor, manager, printer, fulfillment,
// publisher — gets the same "Report a bug / request a feature" affordance
// with no per-portal wiring. The dialog has two views: Report (form with
// screenshot auto-capture) and My requests (the submitter's own history
// with status). Submitter identity is derived server-side; the client
// never sends a role/scope it could spoof.
//
// Light admin surface (gt-admin tokens, slate text scale, status pills) —
// see docs/design-system.md → Partner portals are light admin surfaces.

import * as React from "react";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { postAdminImage } from "@/lib/adminUpload";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type FeedbackKind = "bug" | "feature";

type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  pageUrl: string | null;
  screenshotUrl: string | null;
  status: string;
  publicReply: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  in_progress: "In progress",
  shipped: "Shipped",
  closed: "Closed",
  wont_do: "Won't do",
};

// Light-admin status pills (no mint/pink on white — see design-system.md).
const STATUS_PILL: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-200",
  reviewing: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-violet-50 text-violet-700 ring-violet-200",
  shipped: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
  wont_do: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function FeedbackStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_PILL[status] ?? STATUS_PILL.closed,
      )}
      data-testid={`pill-feedback-status-${status}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatFeedbackDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function FeedbackLauncher({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"report" | "mine">("report");
  const [kind, setKind] = React.useState<FeedbackKind>("bug");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const mine = useQuery<MyFeedback[]>({
    queryKey: ["/api/partner/feedback/mine"],
    enabled: open,
  });

  function reset() {
    setKind("bug");
    setTitle("");
    setBody("");
  }

  async function captureScreenshot(): Promise<string | null> {
    // Best-effort — a failed capture must never block the report.
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(document.body, {
        cacheBust: true,
        pixelRatio: 1,
        filter: (node) => {
          // Skip the open feedback dialog itself.
          return !(
            node instanceof HTMLElement &&
            node.getAttribute("data-feedback-dialog") === "true"
          );
        },
      });
      const file = await dataUrlToFile(dataUrl, "feedback-screenshot.png");
      const { url } = await postAdminImage(file, { noun: "screenshot" });
      return url;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const screenshotUrl = await captureScreenshot();
      const res = await apiRequest("POST", "/api/partner/feedback", {
        kind,
        title: title.trim(),
        body: body.trim(),
        pageUrl: window.location.href,
        screenshotUrl,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as { message?: string });
        throw new Error(err?.message || "Could not send your report");
      }
      await queryClient.invalidateQueries({
        queryKey: ["/api/partner/feedback/mine"],
      });
      reset();
      setView("mine");
      toast({
        title: kind === "bug" ? "Bug reported" : "Request sent",
        description: "Thanks — the GoodTunes team can see it now.",
      });
    } catch (err: any) {
      toast({
        title: "Couldn't send your report",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn(
          "gap-1.5 bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue-hover)] border-0 shadow-sm",
          className
        )}
        onClick={() => {
          setView("report");
          setOpen(true);
        }}
        data-testid="button-open-feedback"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg"
          data-feedback-dialog="true"
          data-testid="dialog-feedback"
        >
          {/* Header: title + quiet "My requests" secondary link */}
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-7">
              <div className="min-w-0">
                <DialogTitle>
                  {view === "mine" ? "My requests" : "Help & feedback"}
                </DialogTitle>
                {view === "report" && (
                  <DialogDescription className="mt-1">
                    Report a bug or request a feature. We capture your current
                    screen automatically.
                  </DialogDescription>
                )}
              </div>
              {view === "report" ? (
                <button
                  type="button"
                  onClick={() => setView("mine")}
                  className="shrink-0 mt-0.5 text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
                  data-testid="link-feedback-my-requests"
                >
                  My requests
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setView("report")}
                  className="shrink-0 mt-0.5 text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
                  data-testid="link-feedback-new-report"
                >
                  New report
                </button>
              )}
            </div>
          </DialogHeader>

          {view === "report" ? (
            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              {/* Compact inline kind selector */}
              <div
                className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm"
                role="group"
                aria-label="Report type"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === "bug"}
                  onClick={() => setKind("bug")}
                  className={cn(
                    "px-3.5 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                    kind === "bug"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                  data-testid="seg-feedback-bug"
                >
                  Bug
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === "feature"}
                  onClick={() => setKind("feature")}
                  className={cn(
                    "px-3.5 py-1.5 font-medium border-l border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                    kind === "feature"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                  data-testid="seg-feedback-feature"
                >
                  Feature request
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feedback-title" className="text-slate-700">
                  Title
                </Label>
                <Input
                  id="feedback-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder={
                    kind === "bug"
                      ? "What went wrong?"
                      : "What would you like to see?"
                  }
                  data-testid="input-feedback-title"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feedback-body" className="text-slate-700">
                  Details
                </Label>
                <Textarea
                  id="feedback-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="Steps to reproduce, what you expected, anything that helps."
                  data-testid="input-feedback-body"
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  A screenshot of this page is attached automatically.
                </p>

                {/* Submit button: quiet disabled state → solid accent when ready */}
                <Button
                  type="submit"
                  className={cn(
                    "w-full transition-opacity",
                    !canSubmit && "opacity-40 cursor-not-allowed",
                  )}
                  disabled={!canSubmit || submitting}
                  data-testid="button-submit-feedback"
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitting ? "Sending…" : "Send to GoodTunes"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-5">
              {mine.isLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !mine.data || mine.data.length === 0 ? (
                <p
                  className="py-10 text-center text-sm text-slate-500"
                  data-testid="text-feedback-empty"
                >
                  You haven't sent any feedback yet.
                </p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {mine.data.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-slate-100 bg-white px-3.5 py-3"
                      data-testid={`row-feedback-${f.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {f.title}
                          </p>
                          <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">
                            {f.kind === "bug" ? "Bug" : "Feature request"}
                            {formatFeedbackDate(f.createdAt) && (
                              <span className="ml-2 normal-case tracking-normal text-slate-400">
                                · {formatFeedbackDate(f.createdAt)}
                              </span>
                            )}
                          </p>
                        </div>
                        <FeedbackStatusPill status={f.status} />
                      </div>
                      {f.publicReply ? (
                        <p
                          className="mt-2.5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          data-testid={`text-feedback-reply-${f.id}`}
                        >
                          <span className="font-medium">GoodTunes: </span>
                          {f.publicReply}
                        </p>
                      ) : (
                        <p
                          className="mt-2 text-xs italic text-slate-400"
                          data-testid={`text-feedback-noreply-${f.id}`}
                        >
                          No reply yet
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
