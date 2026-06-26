// Task #2224 — Partner feedback launcher.
//
// One self-contained button + dialog embedded in OperatorShell (both the
// "tabs" header and the "leftnav" topbar) so EVERY invited-partner portal
// — press, NPO, artist, label, vendor, manager, printer, fulfillment,
// publisher — gets the same "Report a bug / request a feature" affordance
// with no per-portal wiring. The dialog has two tabs: Report (form with
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function FeedbackLauncher({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"report" | "mine">("report");
  const [kind, setKind] = React.useState<FeedbackKind>("bug");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

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
    if (!title.trim() || !body.trim()) {
      toast({
        title: "Add a title and a description",
        variant: "destructive",
      });
      return;
    }
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
      setTab("mine");
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
        variant="outline"
        size="sm"
        className={cn("gap-1.5", className)}
        onClick={() => {
          setTab("report");
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
          <DialogHeader>
            <DialogTitle>Help &amp; feedback</DialogTitle>
            <DialogDescription>
              Report a bug or request a feature. We capture your current screen
              automatically.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "report" | "mine")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="report" data-testid="tab-feedback-report">
                Report
              </TabsTrigger>
              <TabsTrigger value="mine" data-testid="tab-feedback-mine">
                My requests
              </TabsTrigger>
            </TabsList>

            <TabsContent value="report" className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <RadioGroup
                  value={kind}
                  onValueChange={(v) => setKind(v as FeedbackKind)}
                  className="grid grid-cols-2 gap-3"
                >
                  <Label
                    htmlFor="feedback-kind-bug"
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      kind === "bug"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200",
                    )}
                  >
                    <RadioGroupItem
                      value="bug"
                      id="feedback-kind-bug"
                      data-testid="radio-feedback-bug"
                    />
                    Bug
                  </Label>
                  <Label
                    htmlFor="feedback-kind-feature"
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      kind === "feature"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200",
                    )}
                  >
                    <RadioGroupItem
                      value="feature"
                      id="feedback-kind-feature"
                      data-testid="radio-feedback-feature"
                    />
                    Feature request
                  </Label>
                </RadioGroup>

                <div className="space-y-1.5">
                  <Label htmlFor="feedback-title">Title</Label>
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
                  <Label htmlFor="feedback-body">Details</Label>
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

                <p className="text-xs text-slate-500">
                  A screenshot of this page is attached automatically.
                </p>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                  data-testid="button-submit-feedback"
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitting ? "Sending…" : "Send to GoodTunes"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="mine" className="mt-4">
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
                <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {mine.data.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-md border border-slate-200 p-3"
                      data-testid={`row-feedback-${f.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {f.title}
                          </p>
                          <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">
                            {f.kind === "bug" ? "Bug" : "Feature request"}
                          </p>
                        </div>
                        <FeedbackStatusPill status={f.status} />
                      </div>
                      {f.publicReply && (
                        <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">
                          <span className="font-medium">GoodTunes: </span>
                          {f.publicReply}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
