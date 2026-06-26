// Task #2224 — Operator: partner feedback / bug-report triage inbox.
//
// Partners (press, NPO, artist, label, vendor, manager, printer,
// fulfillment, publisher) file bugs / feature requests from inside their
// portal via the shared FeedbackLauncher. This is the operator side: a
// triage inbox that shows the SERVER-DERIVED submitter identity (role +
// scope, name, email — never the client's claim), the auto-captured
// screenshot, internal notes (operator-only), a public reply the
// submitter sees in their history, the status lifecycle, and an
// "Escalated to dev" flag.
//
// Light admin surface (gt-admin slate tokens, status pills) — see
// docs/design-system.md.
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bug, Lightbulb, AlertTriangle, ExternalLink, Search } from "lucide-react";

type Feedback = {
  id: string;
  submitterUserId: string;
  submitterRole: string | null;
  submitterScopeKind: string | null;
  submitterScopeId: string | null;
  submitterScopeName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  kind: "bug" | "feature";
  title: string;
  body: string;
  pageUrl: string | null;
  screenshotUrl: string | null;
  status: string;
  escalated: boolean;
  internalNotes: string | null;
  publicReply: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "in_progress", label: "In progress" },
  { value: "shipped", label: "Shipped" },
  { value: "closed", label: "Closed" },
  { value: "wont_do", label: "Won't do" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const STATUS_PILL: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-200",
  reviewing: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-violet-50 text-violet-700 ring-violet-200",
  shipped: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
  wont_do: "bg-rose-50 text-rose-700 ring-rose-200",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_PILL[status] ?? STATUS_PILL.closed,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// Returns "role · EntityName" (or "role · scope kind" if name wasn't resolved,
// or just "role" if no scope). Uses the server-resolved submitterScopeName when
// present so e.g. "Manufacturer · Viryl Technologies" renders instead of the
// generic "Manufacturer · manufacturer".
function submitterLine(f: Feedback): string {
  const role = f.submitterRole ? f.submitterRole.replace(/_/g, " ") : "partner";
  const scopeLabel = f.submitterScopeName
    ? f.submitterScopeName
    : f.submitterScopeKind
      ? f.submitterScopeKind.replace(/_/g, " ")
      : null;
  return scopeLabel ? `${role} · ${scopeLabel}` : role;
}

// Builds a "view as this partner" URL for super-admins. Uses the existing
// scoped-portal routing each portal already honors for super_admins.
//
// Extra search params from the pageUrl are spread first so the enforced
// scope params (scopeId/scopeKind, labelId, personId, etc.) always win and
// cannot be overridden by a partner-controlled pageUrl.
//
// For scope kinds without a scoped-portal URL param (non_profit, manager),
// we fall back to the operator-facing admin detail page — still useful for
// triage. Returns null when id is unavailable.
function viewAsPartnerUrl(f: Feedback): string | null {
  const { submitterScopeKind: kind, submitterScopeId: id, pageUrl } = f;
  if (!kind || !id) return null;

  // Extract extra search params from the original pageUrl so we can carry
  // tab/filter context into the scoped portal link. Applied BEFORE scope
  // params so the enforced scope always takes precedence.
  const extra: Record<string, string> = {};
  if (pageUrl) {
    try {
      new URL(pageUrl).searchParams.forEach((v, k) => {
        extra[k] = v;
      });
    } catch {
      // Relative URL or invalid format — skip extra params.
    }
  }

  // Scope params are applied AFTER extra so they cannot be overridden.
  if (kind === "manufacturer") {
    const p = new URLSearchParams({ ...extra, scopeId: id, scopeKind: "manufacturer" });
    return `/vendor?${p}`;
  }
  if (kind === "vendor") {
    const p = new URLSearchParams({ ...extra, scopeId: id, scopeKind: "vendor" });
    return `/vendor?${p}`;
  }
  if (kind === "fulfillment") {
    const p = new URLSearchParams({ ...extra, scopeId: id, scopeKind: "fulfillment" });
    return `/vendor?${p}`;
  }
  if (kind === "label") {
    // /label accepts ?labelId= for super-admin scoping.
    const p = new URLSearchParams({ ...extra, labelId: id });
    return `/label?${p}`;
  }
  if (kind === "artist") {
    // /artist accepts ?personId= for super-admin scoping.
    const p = new URLSearchParams({ ...extra, personId: id });
    return `/artist?${p}`;
  }
  if (kind === "non_profit") {
    // The /non-profit portal derives its scope from the authenticated user's
    // membership and doesn't expose a super-admin URL override param. Link to
    // the admin detail page instead so the operator can review the entity.
    return `/admin/non-profits/${id}`;
  }
  if (kind === "manager") {
    // Same pattern as non_profit — the /manager portal has no URL scope param.
    return `/admin/managers/${id}`;
  }
  return null;
}

// Whether the "View as" link applies the scoped portal view (true) or just
// links to the admin detail page (false). Used to pick the right label.
function isFullScopedPortal(kind: string | null): boolean {
  return kind === "manufacturer" || kind === "vendor" || kind === "fulfillment"
    || kind === "label" || kind === "artist";
}

export function AdminFeedback() {
  return (
    <AdminErrorBoundary title="Feedback inbox failed to render">
      <AdminFeedbackInner />
    </AdminErrorBoundary>
  );
}

function AdminFeedbackInner() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "bug" | "feature">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading, isError, error, refetch } = useQuery<Feedback[]>({
    queryKey: ["/api/admin/feedback"],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((f) => {
      if (kindFilter !== "all" && f.kind !== kindFilter) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          f.title,
          f.body,
          f.submitterScopeName,
          f.submitterName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, kindFilter, statusFilter, search]);

  const selected = useMemo(
    () => (rows ?? []).find((f) => f.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const content = (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900" data-testid="text-feedback-heading">
          Partner feedback
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Bug reports and feature requests submitted by partners from inside
          their portals.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, partner, or keyword…"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            data-testid="input-feedback-search"
          />
        </div>
        <div className="flex rounded-md border border-slate-200 p-0.5">
          {(["all", "bug", "feature"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={cn(
                "rounded px-3 py-1 text-sm capitalize",
                kindFilter === k
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
              data-testid={`filter-kind-${k}`}
            >
              {k === "feature" ? "Features" : k === "bug" ? "Bugs" : "All"}
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="py-16 text-center text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500"
          data-testid="text-feedback-empty"
        >
          No feedback matches these filters.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="list-feedback">
          {filtered.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setSelectedId(f.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300 hover:shadow-sm"
                data-testid={`row-feedback-${f.id}`}
              >
                <span className="mt-0.5 text-slate-400">
                  {f.kind === "bug" ? (
                    <Bug className="h-4 w-4" />
                  ) : (
                    <Lightbulb className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">
                      {f.title}
                    </span>
                    {f.escalated && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {f.submitterName ?? "Unknown"} · {submitterLine(f)}
                  </span>
                </span>
                <StatusPill status={f.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <FeedbackDetail
          key={selected.id}
          feedback={selected}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
          }}
        />
      )}
    </div>
  );

  return <AdminFrame active="feedback">{content}</AdminFrame>;
}

function FeedbackDetail({
  feedback,
  onClose,
  onSaved,
}: {
  feedback: Feedback;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(feedback.status);
  const [escalated, setEscalated] = useState(feedback.escalated);
  const [internalNotes, setInternalNotes] = useState(feedback.internalNotes ?? "");
  const [publicReply, setPublicReply] = useState(feedback.publicReply ?? "");

  // Only super_admins can navigate the scoped-portal URLs that the "View as"
  // action generates (/vendor?scopeId=…, /label?labelId=…, etc.). Plain admins
  // see the existing raw "Page" link but not the "View as" action.
  const { data: meRole } = useQuery<{ role: string }>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = meRole?.role === "super_admin";

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/feedback/${feedback.id}`, {
        status,
        escalated,
        internalNotes,
        publicReply,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as { message?: string });
        throw new Error(err?.message || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "Feedback updated" });
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't save",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const partnerUrl = isSuperAdmin ? viewAsPartnerUrl(feedback) : null;
  const partnerLabel = feedback.submitterScopeName ?? feedback.submitterScopeKind ?? "partner";
  const isPortalView = isFullScopedPortal(feedback.submitterScopeKind);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      data-testid="dialog-feedback-detail"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              {feedback.kind === "bug" ? "Bug report" : "Feature request"}
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900" data-testid="text-detail-title">
              {feedback.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            data-testid="button-close-detail"
          >
            Close
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Submitted by</dt>
            <dd className="text-slate-800" data-testid="text-detail-submitter">
              {feedback.submitterName ?? "Unknown"}
              {feedback.submitterEmail ? ` · ${feedback.submitterEmail}` : ""}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Role &amp; scope</dt>
            <dd className="capitalize text-slate-800">{submitterLine(feedback)}</dd>
          </div>
          {feedback.pageUrl && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Page</dt>
              <dd className="truncate">
                <a
                  href={feedback.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-slate-700 underline"
                  data-testid="link-detail-page"
                >
                  <span className="truncate">{feedback.pageUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </dd>
            </div>
          )}
          {partnerUrl && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                {isPortalView ? "View as partner" : "Partner profile"}
              </dt>
              <dd>
                <a
                  href={partnerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                  data-testid="link-detail-view-as-partner"
                >
                  {isPortalView ? `View as ${partnerLabel}` : `Open ${partnerLabel}`}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wide text-slate-400">Description</Label>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800" data-testid="text-detail-body">
            {feedback.body}
          </p>
        </div>

        {feedback.screenshotUrl && (
          <div className="mt-4">
            <Label className="text-xs uppercase tracking-wide text-slate-400">Screenshot</Label>
            <a href={feedback.screenshotUrl} target="_blank" rel="noreferrer">
              <img
                src={feedback.screenshotUrl}
                alt="Submitter screenshot"
                className="mt-1 max-h-64 w-full rounded-lg border border-slate-200 object-contain"
                data-testid="img-detail-screenshot"
              />
            </a>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="detail-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="detail-status" className="mt-1" data-testid="select-detail-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={escalated}
                onChange={(e) => setEscalated(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
                data-testid="checkbox-escalated"
              />
              Escalated to dev
            </label>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="detail-notes">Internal notes (operator only)</Label>
          <Textarea
            id="detail-notes"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Triage notes — never shown to the partner."
            data-testid="input-internal-notes"
          />
        </div>

        <div className="mt-4">
          <Label htmlFor="detail-reply">Public reply (shown to the partner)</Label>
          <Textarea
            id="detail-reply"
            value={publicReply}
            onChange={(e) => setPublicReply(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="An optional reply the partner sees in their request history."
            data-testid="input-public-reply"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-detail">
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            data-testid="button-save-feedback"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
